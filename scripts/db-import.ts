/**
 * 审计日志导入脚本
 *
 * 将 db:export 导出的 farm-agent 审计 JSON 文件导入到本地 PostgreSQL AuditLog 表。
 * 其他人下载项目后可通过此脚本验证 farm-agent 开发过程（Round 1-7）的完整审计链路。
 *
 * 默认导入两个文件:
 *   data/exports/farm-agent-dev-audit.json     — 开发操作审计
 *   data/exports/farm-agent-runtime-audit.json — 运行时决策审计
 *
 * 用法:
 *   npm run db:import                        # 导入默认双文件
 *   npm run db:import -- data/exports/xxx.json  # 导入指定单个文件
 *
 * 用户映射:
 *   导入时会自动查找本地数据库中的第一个 ROOT 用户作为日志归属。
 *   如果找不到，会创建一个虚拟系统用户 "audit-archive" 承载所有导入日志。
 */

import * as fs from "fs/promises"
import * as path from "path"
import { createReadStream } from "fs"
import { createGunzip } from "zlib"
import { pipeline } from "stream/promises"
import { prisma } from "../src/lib/prisma"
import type { Prisma } from "@prisma/client"

const DEFAULT_FILES = [
  "data/exports/farm-agent-dev-audit.json.gz",
  "data/exports/farm-agent-runtime-audit.json.gz",
]

interface ImportLog {
  id: string
  userId: string
  action: string
  targetType: string
  targetId: string
  traceId: string | null
  reason: string | null
  beforeState: unknown
  afterState: unknown
  createdAt: string
}

interface ImportData {
  meta: { exportedAt: string; totalCount: number }
  logs: ImportLog[]
}

async function getOrCreateImportUser(): Promise<string> {
  const rootUser = await prisma.user.findFirst({
    where: { role: "ROOT" },
    orderBy: { createdAt: "asc" },
  })
  if (rootUser) {
    console.log(`   用户映射 → ${rootUser.email || rootUser.username || rootUser.id}`)
    return rootUser.id
  }

  const anyUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } })
  if (anyUser) {
    console.log(`   用户映射 → ${anyUser.email || anyUser.username || anyUser.id}`)
    return anyUser.id
  }

  console.log("   创建虚拟系统用户: audit-archive")
  const systemUser = await prisma.user.create({
    data: {
      email: "audit-archive@add-paradigm.local",
      username: "AUDIT_ARCHIVE",
      password: "__imported__",
      role: "ROOT",
    },
  })
  return systemUser.id
}

async function readJsonFile(filePath: string): Promise<string> {
  if (filePath.endsWith(".gz")) {
    const chunks: Buffer[] = []
    await pipeline(
      createReadStream(filePath),
      createGunzip(),
      async function* (source) {
        for await (const chunk of source) {
          chunks.push(Buffer.from(chunk))
        }
      }
    )
    return Buffer.concat(chunks).toString("utf-8")
  }
  return fs.readFile(filePath, "utf-8")
}

async function importOneFile(filePath: string, targetUserId: string): Promise<{ imported: number; skipped: number; failed: number }> {
  let raw: string
  try {
    raw = await readJsonFile(filePath)
  } catch {
    console.log(`   ⚠️  文件不存在或无法读取，跳过`)
    return { imported: 0, skipped: 0, failed: 0 }
  }

  const data: ImportData = JSON.parse(raw)
  if (!data.logs || data.logs.length === 0) {
    console.log(`   ⚠️  文件中无记录，跳过`)
    return { imported: 0, skipped: 0, failed: 0 }
  }

  console.log(`   导出时间: ${data.meta.exportedAt}  |  记录: ${data.logs.length} 条`)

  const existingRecords = await prisma.auditLog.findMany({
    where: { id: { in: data.logs.map((l) => l.id) } },
    select: { id: true },
  })
  const existingIds = new Set(existingRecords.map((r: { id: string }) => r.id))

  const toImport = data.logs.filter((l) => !existingIds.has(l.id))
  const skipped = data.logs.length - toImport.length

  if (toImport.length === 0) {
    console.log("   ✅ 已全部存在，无需导入")
    return { imported: 0, skipped, failed: 0 }
  }

  let imported = 0
  let failed = 0

  for (let i = 0; i < toImport.length; i += 100) {
    const batch = toImport.slice(i, i + 100)
    const results = await Promise.allSettled(
      batch.map((log) =>
        prisma.auditLog.create({
          data: {
            id: log.id,
            userId: targetUserId,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            traceId: log.traceId,
            beforeState: log.beforeState as Prisma.InputJsonValue | undefined,
            afterState: log.afterState as Prisma.InputJsonValue | undefined,
            reason: log.reason,
            createdAt: new Date(log.createdAt),
          },
        })
      )
    )
    for (const r of results) {
      if (r.status === "fulfilled") imported++
      else {
        failed++
        console.error(`   ❌ ${(r.reason as Error)?.message}`)
      }
    }
  }

  console.log(`   成功: ${imported}  |  跳过: ${skipped}  |  失败: ${failed}`)
  return { imported, skipped, failed }
}

async function main() {
  const args = process.argv.slice(2)

  // 指定单个文件
  const files: string[] = args.length > 0
    ? [args[0]]
    : DEFAULT_FILES.map((f) => path.join(process.cwd(), f))

  console.log("📥 审计日志导入")
  console.log("")

  const targetUserId = await getOrCreateImportUser()
  console.log("")

  let totalImported = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const filePath of files) {
    const r = await importOneFile(filePath, targetUserId)
    totalImported += r.imported
    totalSkipped += r.skipped
    totalFailed += r.failed
    console.log("")
  }

  console.log("━".repeat(40))
  console.log(`✅ 总计: 导入 ${totalImported}  |  跳过 ${totalSkipped}  |  失败 ${totalFailed}`)

  await prisma.$disconnect()
}

main().catch(async (err: unknown) => {
  console.error("❌ 导入失败:", err)
  await prisma.$disconnect()
  process.exit(1)
})
