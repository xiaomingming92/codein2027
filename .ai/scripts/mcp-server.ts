import dotenv from "dotenv"
dotenv.config({ path: ".env.development" })

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://team_admin:team_secure_pass_2024@localhost:5432/team_coordinator?schema=public"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { readFile, readdir, stat } from "fs/promises"
import { join, relative } from "path"
import { existsSync } from "fs"
import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
})

const PROJECT_ROOT = process.cwd()

type ToolResponse = Array<{ type: "text"; text: string }>

function textResponse(text: string): { content: ToolResponse } {
  return { content: [{ type: "text", text }] }
}

function errorResponse(message: string): { content: ToolResponse; isError: boolean } {
  return { content: [{ type: "text", text: message }], isError: true }
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

const server = new McpServer(
  {
    name: "add-dev-tools",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.registerTool(
  "get_project_context",
  {
    description: "获取项目的完整上下文信息：目录结构、技术栈、包管理信息、项目规则（ADD 范式约束）。AI 助手在生成代码前应调用此工具获取项目真实信息，避免幻觉。",
    inputSchema: {
      scope: z.string().optional().describe("获取信息的范围: 'structure' 仅目录结构, 'rules' 仅项目规则, 'package' 仅包信息, 'all' 全部"),
    },
  },
  async (args: { scope?: string }) => {
    try {
      const scope = args?.scope || "all"
      const parts: string[] = []

      if (scope === "all" || scope === "package") {
        const pkg = await readFileSafe(join(PROJECT_ROOT, "package.json"))
        if (pkg) {
          const parsed = JSON.parse(pkg)
          parts.push("=== 项目信息 ===")
          parts.push(`名称: ${parsed.name}`)
          parts.push(`版本: ${parsed.version}`)
          parts.push(`技术栈: Next.js ${parsed.dependencies?.next || "unknown"} + TypeScript + Prisma + LangGraph`)
          parts.push("")
          parts.push("核心依赖:")
          const keyDeps = [
            "next", "@langchain/langgraph", "@prisma/client", "prisma",
            "zustand", "@tanstack/react-query", "chromadb", "zod",
          ]
          for (const dep of keyDeps) {
            const ver = parsed.dependencies?.[dep] || parsed.devDependencies?.[dep]
            if (ver) parts.push(`  ${dep}: ${ver}`)
          }
          parts.push("")
          parts.push("可用脚本:")
          for (const [name, script] of Object.entries(parsed.scripts || {})) {
            parts.push(`  ${name}: ${script}`)
          }
          parts.push("")
        }
      }

      if (scope === "all" || scope === "rules") {
        const rules = await readFileSafe(join(PROJECT_ROOT, ".trae", "rules", "project_rules.md"))
        if (rules) {
          parts.push("=== 项目规则 (ADD 范式强制约束) ===")
          const lines = rules.split("\n")
          let inCodeBlock = false
          for (const line of lines) {
            if (line.startsWith("```")) {
              inCodeBlock = !inCodeBlock
              continue
            }
            if (inCodeBlock) continue
            if (line.startsWith("## ADD-") || line.startsWith("## 项目")) {
              parts.push("")
              parts.push(line)
            } else if (line.startsWith("###") || line.startsWith("####")) {
              parts.push(line)
            }
          }
          parts.push("")
        }
      }

      if (scope === "all" || scope === "structure") {
        parts.push("=== 项目目录结构（顶层） ===")
        const topDirs = [".trae", "src", "prisma", "scripts", "docs", "data", "public"]
        for (const dir of topDirs) {
          const fullPath = join(PROJECT_ROOT, dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            parts.push(`  ${dir}/ (${entries.length} 项)`)
          }
        }
        parts.push("")
        parts.push("=== src/ 子目录结构 ===")
        const srcDirs = ["agents", "app", "components", "lib", "services", "stores", "types"]
        for (const dir of srcDirs) {
          const fullPath = join(PROJECT_ROOT, "src", dir)
          if (existsSync(fullPath)) {
            const entries = await readdir(fullPath)
            const items = (await Promise.all(
              entries.slice(0, 15).map(async (e) => {
                const s = await stat(join(fullPath, e))
                return s.isDirectory() ? `${e}/` : e
              })
            )).join(", ")
            parts.push(`  src/${dir}/ (${entries.length} 项): ${items})`)
          }
        }
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取项目上下文失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "get_db_schema",
  {
    description: "获取 Prisma 数据库 Schema 定义。返回指定模型的结构、字段、关系。AI 助手在编写数据库查询代码时应调用此工具获取真实的 Schema 信息。",
    inputSchema: {
      model: z.string().optional().describe("可选的模型名称（不区分大小写）。不指定则返回所有模型概况。指定则返回该模型的完整字段定义。"),
    },
  },
  async (args: { model?: string }) => {
    try {
      const schemaPath = join(PROJECT_ROOT, "prisma", "schema.prisma")
      const schema = await readFileSafe(schemaPath)
      if (!schema) {
        return errorResponse("未找到 prisma/schema.prisma 文件")
      }

      const modelName = args?.model?.toLowerCase()
      if (modelName) {
        const modelRegex = new RegExp(`model\\s+${modelName}\\s*\{`, "i")
        const match = schema.match(modelRegex)
        if (match) {
          const startIdx = match.index ?? 0
          const braceIdx = schema.indexOf("{", startIdx)
          if (braceIdx !== -1) {
            let depth = 1
            let endIdx = braceIdx + 1
            while (depth > 0 && endIdx < schema.length) {
              if (schema[endIdx] === "{") depth++
              else if (schema[endIdx] === "}") depth--
              endIdx++
            }
            const body = schema.slice(braceIdx, endIdx)
            return textResponse(`=== Model: ${args.model} ===\n\nmodel ${args.model} ${body}`)
          }
        }
        const enumMatch = schema.match(new RegExp(`enum\\s+${modelName}\\s*\{`, "i"))
        if (enumMatch) {
          return textResponse(`=== Enum: ${args.model} ===\n\n可用的枚举值见不传参调用结果。`)
        }
        return errorResponse(`未找到模型或枚举: ${args.model}。可用模型见不传参调用结果。`)
      }

      const models: Array<{ name: string; fieldCount: number }> = []
      const modelRegex = /model\s+(\w+)\s*\{/g
      let m
      while ((m = modelRegex.exec(schema)) !== null) {
        const name = m[1]
        const startIdx = m.index
        const braceIdx = schema.indexOf("{", startIdx)
        if (braceIdx !== -1) {
          let depth = 1
          let endIdx = braceIdx + 1
          while (depth > 0 && endIdx < schema.length) {
            if (schema[endIdx] === "{") depth++
            else if (schema[endIdx] === "}") depth--
            endIdx++
          }
          const body = schema.slice(braceIdx, endIdx)
          const fieldCount = body.split("\n").filter(
            (l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("@@")
          ).length
          models.push({ name, fieldCount })
        }
      }

      const enums: string[] = []
      const enumRegex = /enum\s+(\w+)\s*\{/g
      while ((m = enumRegex.exec(schema)) !== null) {
        enums.push(m[1])
      }

      const parts: string[] = ["=== Prisma Schema 概况 ==="]
      parts.push("")
      parts.push(`模型 (${models.length} 个):`)
      for (const model of models) {
        parts.push(`  ${model.name} (${model.fieldCount} 字段)`)
      }
      if (enums.length > 0) {
        parts.push("")
        parts.push(`枚举 (${enums.length} 个): ${enums.join(", ")}`)
      }
      parts.push("")
      parts.push('提示: 指定 model 参数获取完整字段定义，例如: get_db_schema({ model: "User" })')

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`获取 Schema 失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "get_audit_logger_pattern",
  {
    description: "获取指定域的审计日志器完整代码或模式。历史域（'knowledge-base', 'agent'）返回已有的混合式日志器代码；新域（如 'personnel'）返回三层分离式模板。新业务域应使用三层分离模式（Layer 1 dev-logger + Layer 2 runtime audit）。",
    inputSchema: {
      domain: z.string().describe("审计日志器域: 'knowledge-base', 'agent'（历史混合式），或新域如 'personnel'（三层分离式）"),
    },
  },
  async (args: { domain: string }) => {
    try {
      const domain = args?.domain
      if (!domain) return errorResponse("domain 参数不能为空")

      // 历史混合式日志器（从文件读取）
      const legacyFileMap: Record<string, string> = {
        "knowledge-base": join(PROJECT_ROOT, "src", "lib", "audit-logger.ts"),
        "agent": join(PROJECT_ROOT, "src", "lib", "agent-audit-logger.ts"),
      }

      // 新域三层分离式日志器（生成模板）
      const threeLayerPatternTemplate = `=== ${domain} 三层分离式审计日志器（新模式） ===

新建 ${domain} 业务域应创建两个文件：

--- 文件1: src/lib/${domain}-dev-logger.ts (Layer 1 开发审计) ---
仅在 NODE_ENV=development 时生效, 用于 AI 合规检查。
输出: console.log + fs.appendFile + DB metadata 回写。
包含函数: auditPhaseStart / auditPhaseEnd / audit / readRecentLogs / clearLogs

--- 文件2: src/lib/${domain}-audit.ts (Layer 2 运行时业务审计) ---
始终开启, 用于业务记录。
输出: console.log + fs.appendFile + AuditLog 表写入。
包含函数: record${domain.charAt(0).toUpperCase() + domain.slice(1)}Audit()

详见项目规则 ADD-4「三层可插拔架构」`

      if (legacyFileMap[domain]) {
        // 返回历史混合式日志器
        const filePath = legacyFileMap[domain]
        const content = await readFileSafe(filePath)
        if (!content) {
          return errorResponse(`未找到 ${domain} 审计日志器文件: ${filePath}`)
        }

        const metaMap: Record<string, { prefix: string; logDir: string; logFile: string }> = {
          "knowledge-base": { prefix: "[KB-AUDIT]", logDir: "logs/knowledge-base/", logFile: "kb-audit.log" },
          "agent": { prefix: "[AGENT-AUDIT]", logDir: "logs/agent/", logFile: "agent-audit.log" },
        }
        const meta = metaMap[domain]

        const parts: string[] = [
          `=== ${domain} 审计日志器（历史混合式，Layer 1 + Layer 2 未分离） ===`,
          `前缀: ${meta.prefix}`,
          `日志目录: ${meta.logDir}`,
          `日志文件: ${meta.logFile}`,
          `文件路径: ${relative(PROJECT_ROOT, filePath)}`,
          "",
          "=== 完整代码 ===",
          content,
          "",
          "=== 模式要点 ===",
          "1. PREFIX 常量: [DOMAIN-AUDIT] 格式",
          `2. LOG_DIR: logs/domain/ 目录 (当前: ${meta.logDir})`,
          "3. AuditPhase 类型: 枚举所有业务阶段",
          "4. audit() / auditPhaseStart() / auditPhaseEnd() 三函数",
          "5. readRecentLogs() / clearLogs() 读写函数",
          "6. ENABLE_FILE_LOG 环境变量控制，开发环境默认启用",
          "7. 三通道输出: console.log + fs.appendFile + 数据库回写",
          "",
          "⚠️ 注意: 这是历史混合式模式。新建业务域应使用三层分离模式（调用 generate_audit_logger 生成）。",
        ]

        return textResponse(parts.join("\n"))
      }

      // 返回三层分离式模板
      return textResponse(threeLayerPatternTemplate)
    } catch (error) {
      return errorResponse(`获取审计日志器失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "check_phase_symmetry",
  {
    description: "检查代码中的阶段标记对称性（ADD-2 规则）。统计 auditPhaseStart/End 配对情况，返回不对称列表。AI 助手在生成包含审计阶段的代码后应调用此工具验证。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
    },
  },
  async (args: { code: string }) => {
    try {
      const code = args?.code
      if (!code) return errorResponse("code 参数不能为空")

      const startRegex = /auditPhaseStart\(["']([^"']+)["']/g
      const endRegex = /auditPhaseEnd\(["']([^"']+)["']/g

      const starts: string[] = []
      const ends: string[] = []
      let m

      while ((m = startRegex.exec(code)) !== null) starts.push(m[1])
      while ((m = endRegex.exec(code)) !== null) ends.push(m[1])

      const startCounts: Record<string, number> = {}
      const endCounts: Record<string, number> = {}
      for (const s of starts) startCounts[s] = (startCounts[s] || 0) + 1
      for (const e of ends) endCounts[e] = (endCounts[e] || 0) + 1

      const allPhases = new Set([...Object.keys(startCounts), ...Object.keys(endCounts)])
      const asymmetric: string[] = []

      allPhases.forEach((phase) => {
        const sc = startCounts[phase] || 0
        const ec = endCounts[phase] || 0
        if (sc !== ec) {
          asymmetric.push(`  ⚠️ ${phase}: Start=${sc}, End=${ec} (${sc > ec ? "缺少 End" : "缺少 Start"})`)
        }
      })

      const lines: string[] = [
        "=== ADD-2 阶段标记对称性检查 ===",
        `审计阶段 Start 总数: ${starts.length}`,
        `审计阶段 End 总数: ${ends.length}`,
        "",
      ]

      if (asymmetric.length === 0) {
        lines.push("✅ 阶段标记完全对称")
      } else {
        lines.push(`❌ 发现 ${asymmetric.length} 个不对称阶段:`)
        lines.push(...asymmetric)
      }

      lines.push("")
      lines.push("=== 所有阶段明细 ===")
      allPhases.forEach((phase) => {
        lines.push(`  ${phase}: Start=${startCounts[phase] || 0}, End=${endCounts[phase] || 0}`)
      })

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查阶段对称性失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "check_failure_path",
  {
    description: "检查代码中的失败路径审计信息密度（ADD-6 规则）。对比 try 块与 catch 块的 extra 字段数，确保失败路径的审计信息不少于成功路径。",
    inputSchema: {
      code: z.string().describe("要检查的 TypeScript 代码文本"),
    },
  },
  async (args: { code: string }) => {
    try {
      const code = args?.code
      if (!code) return errorResponse("code 参数不能为空")

      const sections = code.split(/catch\s*\(/)
      if (sections.length <= 1) {
        return textResponse("=== ADD-6 失败路径审计检查 ===\n\n未检测到 try/catch 块，无需检查失败路径。")
      }

      const lines: string[] = [
        "=== ADD-6 失败路径审计信息密度检查 ===",
        `检测到 ${sections.length - 1} 个 catch 块`,
        "",
      ]

      let allPass = true
      for (let i = 1; i < sections.length; i++) {
        const catchBlock = sections[i]
        const catchEnd = catchBlock.indexOf("{")
        if (catchEnd === -1) continue

        const tryBlock = sections[i - 1]
        const tryExtraMatches = tryBlock.match(/extra[:\s]*\{[^}]*\}/g)
        const tryExtraFieldCount = tryExtraMatches
          ? tryExtraMatches.reduce((sum, m) => sum + (m.match(/\w+:/g)?.length || 0), 0)
          : 0

        const closeIdx = catchBlock.indexOf("}")
        const catchBody = catchBlock.slice(catchEnd, closeIdx + 1)
        const catchExtraMatches = catchBody.match(/extra[:\s]*\{[^}]*\}/g)
        const catchExtraFieldCount = catchExtraMatches
          ? catchExtraMatches.reduce((sum, m) => sum + (m.match(/\w+:/g)?.length || 0), 0)
          : 0

        const catchHasThrow = catchBody.includes("throw")
        const catchHasErrorLog = catchBody.includes("audit") || catchBody.includes("Audit")
        const catchInfoDensity = catchExtraFieldCount + (catchHasThrow ? 2 : 0) + (catchHasErrorLog ? 2 : 0)

        lines.push(`--- Catch 块 #${i} ---`)
        if (catchInfoDensity >= tryExtraFieldCount && catchHasErrorLog) {
          lines.push(`  ✅ 失败路径审计信息密度充足`)
        } else {
          allPass = false
          if (!catchHasErrorLog) lines.push(`  ❌ catch 块缺少审计调用（audit/Audit）`)
          if (catchInfoDensity < tryExtraFieldCount) {
            lines.push(`  ❌ 信息密度不足: catch extra 字段=${catchExtraFieldCount}, try extra 字段=${tryExtraFieldCount}`)
            lines.push("  建议: 在 catch 块中添加与 try 块同级的 extra 字段")
          }
        }
        lines.push(`  try extra 字段数: ${tryExtraFieldCount}`)
        lines.push(`  catch extra 字段数: ${catchExtraFieldCount}`)
        lines.push(`  有审计调用: ${catchHasErrorLog ? "是" : "否"}`)
        lines.push(`  有 throw: ${catchHasThrow ? "是" : "否"}`)
        lines.push("")
      }

      if (allPass) {
        lines.push("✅ 所有 catch 块审计信息密度满足 ADD-6 要求")
      } else {
        lines.push("⚠️ 部分 catch 块需要补充审计信息")
      }

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(`检查失败路径失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "generate_audit_logger",
  {
    description: "生成符合三层分离模式的新审计日志器完整代码。遵循 ADD-1~6 原则，生成两个文件：Layer 1 开发审计（console + file + DB metadata）+ Layer 2 运行时审计（console + AuditLog 表）。AI 助手在新建功能时必须调用此工具生成审计日志器，而非手写。",
    inputSchema: {
      domain: z.string().describe("审计日志器域名（小写中划线）, 例如: 'chat-persistence'"),
      phases: z.string().describe("业务阶段枚举列表（逗号分隔，大写蛇形）, 例如: 'CHAT_SAVE,CHAT_SAVE_MSG,CHAT_LOAD,CHAT_DONE,CHAT_FAIL'"),
      prefix: z.string().describe("审计前缀标识, 例如: 'CHAT-PERSISTENCE-AUDIT'"),
    },
  },
  async (args: { domain: string; phases: string; prefix: string }) => {
    try {
      const { domain, phases, prefix } = args
      if (!domain || !phases || !prefix) {
        return errorResponse("domain, phases, prefix 参数均不能为空")
      }

      const phaseList = phases.split(",").map(p => p.trim()).filter(Boolean)
      if (phaseList.length === 0) {
        return errorResponse("phases 必须包含至少一个阶段")
      }

      const featureName = domain.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join("")
      const domainUpper = prefix
      const logDir = `logs/${domain}/`
      const logFile = `${domain}.log`

      const typeEntries = phaseList.map(p => `  | "${p}"`).join("\n")
      const envPrefix = domainUpper.replace(/-/g, "_")
      const fnPrefix = featureName.charAt(0).toLowerCase() + featureName.slice(1)

      // === Layer 1: 开发审计日志器 (dev-logger.ts) ===
      const devLoggerCode = `import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[${prefix}]"

const LOG_DIR = process.env.${envPrefix}_LOG_DIR || path.join(process.cwd(), "${logDir}")
const LOG_FILE = process.env.${envPrefix}_LOG_FILE || "${logFile}"
const ENABLE_FILE_LOG = process.env.${envPrefix}_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

// Layer 1: 开发审计 — 仅在 NODE_ENV=development 时生效
const IS_DEV = process.env.NODE_ENV === "development"

type ${featureName}AuditPhase =
${typeEntries}

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Ignore if directory already exists
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\\n", "utf-8")
  } catch (error) {
    console.error("\${PREFIX} Failed to write to log file:", error)
  }
}

function formatMessage(phase: ${featureName}AuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? \` | \${JSON.stringify(extra)}\` : ""
  return \`\${PREFIX} [\${ts}] [\${phase}] \${detail}\${extraStr}\`
}

export function ${fnPrefix}Audit(phase: ${featureName}AuditPhase, detail: string, extra?: Record<string, unknown>) {
  if (!IS_DEV) return
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function ${fnPrefix}AuditPhaseStart(phase: ${featureName}AuditPhase, description: string, count?: number) {
  if (!IS_DEV) return
  const countStr = count !== undefined ? \` (\${count}个)\` : ""
  const message = \`\${PREFIX} ═══ [\${phase}] 开始\${countStr}: \${description} ═══\`
  console.log(message)
  writeToFile(message)
}

export function ${fnPrefix}AuditPhaseEnd(phase: ${featureName}AuditPhase, detail: string) {
  if (!IS_DEV) return
  const message = \`\${PREFIX} ═══ [\${phase}] 结束: \${detail} ═══\`
  console.log(message)
  writeToFile(message)
}

export async function read${featureName}Logs(lines: number = 100): Promise<string[]> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    const content = await fs.readFile(logPath, "utf-8")
    const allLines = content.split("\\n").filter(Boolean)
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

export async function clear${featureName}Logs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
`

      // === Layer 2: 运行时业务审计 (audit.ts) ===
      const runtimeAuditCode = `import { prisma } from "@/lib/prisma"

const PREFIX = "[${prefix}:RUNTIME]"

type ${featureName}AuditAction =
${phaseList.map(p => `  | "${p}"`).join("\n")}

export type ${featureName}AuditRecord = {
  action: ${featureName}AuditAction
  entityId: string
  detail: Record<string, unknown>
}

function formatMessage(record: ${featureName}AuditRecord): string {
  const ts = new Date().toISOString()
  const extraStr = Object.keys(record.detail).length > 0 ? \` | \${JSON.stringify(record.detail)}\` : ""
  return \`\${PREFIX} [\${ts}] [\${record.action}] entity=\${record.entityId}\${extraStr}\`
}

export async function record${featureName}Audit(record: ${featureName}AuditRecord): Promise<void> {
  // Layer 2: 三通道输出 — console
  console.log(formatMessage(record))

  // Layer 2: 三通道输出 — AuditLog 表
  try {
    await prisma.auditLog.create({
      data: {
        userId: "system",
        action: record.action,
        targetType: "${featureName}",
        targetId: record.entityId,
        afterState: record.detail as Record<string, unknown>,
        reason: \`\${record.action} on \${record.entityId}\`,
      },
    })
  } catch (error) {
    console.error(\`\${PREFIX} Failed to write AuditLog: \${error instanceof Error ? error.message : String(error)}\`)
  }
}
`

      const parts: string[] = [
        `=== 三层分离式审计日志器: ${domain} ===`,
        `域名: ${domain}`,
        `前缀: [${prefix}]`,
        `日志目录: ${logDir}`,
        `日志文件: ${logFile}`,
        `阶段数: ${phaseList.length}`,
        `阶段列表: ${phaseList.join(", ")}`,
        "",
        "=== 文件1: src/lib/${domain}-dev-logger.ts (Layer 1 开发审计) ===",
        "仅在 NODE_ENV=development 时生效，用于 AI 合规检查。",
        "输出: console + file + 业务代码自行调用 saveAuditData 回写 DB metadata",
        "",
        devLoggerCode,
        "",
        "=== 文件2: src/lib/${domain}-audit.ts (Layer 2 运行时业务审计) ===",
        "始终开启，用于业务记录。",
        "输出: console + AuditLog 表",
        "",
        runtimeAuditCode,
        "",
        "=== 使用方式 ===",
        "业务服务层同时导入两个文件:",
        `  import { ${fnPrefix}AuditPhaseStart, ${fnPrefix}AuditPhaseEnd, ${fnPrefix}Audit } from "@/lib/${domain}-dev-logger"`,
        `  import { record${featureName}Audit } from "@/lib/${domain}-audit"`,
        "",
        "开发审计层调用 auditPhaseStart/End（仅开发环境生效）",
        "运行时审计层调用 recordXxxAudit（始终开启）",
      ]

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`生成审计日志器失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "query_audit_logs",
  {
    description: "稀疏查询开发操作审计日志（AuditLog 表）。支持多维度检索，AI 可在不同对话会话中通过任意维度组合查询之前的开发操作记录，实现跨会话的上下文恢复（稀疏推理）。\n\n典型用法:\n- query_audit_logs({ targetType: \"API_ROUTE\" }) — 查所有 API 路由改动\n- query_audit_logs({ targetId: \"/api/knowledge/documents\" }) — 查特定文件改动\n- query_audit_logs({ keyword: \"pagination\" }) — 按关键词搜索\n- query_audit_logs({ targetType: \"COMPONENT\", keyword: \"document\" }) — 组合过滤\n- query_audit_logs({ traceId: \"trace-abc123\" }) — 按 traceId 查完整调用链（运行时排查）\n- query_audit_logs({}) — 查最近的记录（无过滤条件）",
    inputSchema: {
      targetType: z.string().optional().describe("按目标类型精确过滤（如 'API_ROUTE', 'COMPONENT', 'SCHEMA', 'RULE', 'DEPENDENCY', 'MCP_TOOL'）"),
      action: z.string().optional().describe("按操作类型精确过滤（如 'MODIFY', 'CREATE', 'DELETE', 'API_PAGINATION_ENABLED'）"),
      targetId: z.string().optional().describe("按目标标识精确过滤（如 '/api/knowledge/documents'）"),
      traceId: z.string().optional().describe("按 traceId 精确过滤，用于查询同一请求/操作的完整调用链（如 'trace-abc123'）"),
      keyword: z.string().optional().describe("关键词搜索，在 action/targetType/targetId/reason 字段中模糊匹配，用于跨会话查找相关性数据"),
      sinceMinutes: z.number().optional().describe("时间窗口起始（分钟前），不传则不限制时间范围"),
      limit: z.number().optional().default(20).describe("返回最大条数，默认 20，最大 100"),
    },
  },
  async (args: { targetType?: string; action?: string; targetId?: string; traceId?: string; keyword?: string; sinceMinutes?: number; limit?: number }) => {
    try {
      const { targetType, action, targetId, traceId, keyword, sinceMinutes, limit = 20 } = args

      const where: Record<string, unknown> = {}

      if (sinceMinutes !== undefined) {
        const since = new Date(Date.now() - sinceMinutes * 60 * 1000)
        where.createdAt = { gte: since }
      }

      if (targetType) where.targetType = targetType
      if (action) where.action = action
      if (targetId) where.targetId = targetId
      if (traceId) where.traceId = traceId

      if (keyword) {
        where.OR = [
          { action: { contains: keyword, mode: "insensitive" } },
          { targetType: { contains: keyword, mode: "insensitive" } },
          { targetId: { contains: keyword, mode: "insensitive" } },
          { reason: { contains: keyword, mode: "insensitive" } },
        ]
      }

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: Math.min(limit, 100),
        include: {
          user: {
            select: { username: true },
          },
        },
      })

      if (logs.length === 0) {
        const parts: string[] = []
        if (targetType) parts.push(`targetType=${targetType}`)
        if (action) parts.push(`action=${action}`)
        if (targetId) parts.push(`targetId=${targetId}`)
        if (traceId) parts.push(`traceId=${traceId}`)
        if (keyword) parts.push(`keyword="${keyword}"`)
        if (sinceMinutes !== undefined) parts.push(`sinceMinutes=${sinceMinutes}`)
        const filterDesc = parts.length > 0 ? `条件: ${parts.join(", ")}` : "无条件"

        return textResponse(
          `=== 开发操作审计日志 ===\n\n未找到匹配的审计记录（${filterDesc}）。\n\n` +
          `可能原因: 数据库未运行、尚无相关开发操作记录、或 filter 过于严格。\n` +
          `建议: 尝试放宽过滤条件，或检查数据库是否正常运行。`
        )
      }

      const filters: string[] = []
      if (targetType) filters.push(`targetType=${targetType}`)
      if (action) filters.push(`action=${action}`)
      if (targetId) filters.push(`targetId=${targetId}`)
      if (traceId) filters.push(`traceId=${traceId}`)
      if (keyword) filters.push(`keyword="${keyword}"`)
      if (sinceMinutes !== undefined) filters.push(`最近${sinceMinutes}分钟`)
      const filterDesc = filters.length > 0 ? `条件: ${filters.join(", ")}` : "无过滤条件（最近全部）"

      const timeRange = logs.length > 0
        ? `${logs[0].createdAt.toISOString()} ~ ${logs[logs.length - 1].createdAt.toISOString()}`
        : ""

      const lines: string[] = [
        `=== 开发操作审计日志 (${filterDesc}) ===`,
        `共 ${logs.length} 条记录`,
        ...(timeRange ? [`时间跨度: ${timeRange}`] : []),
        "",
      ]

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i]
        lines.push(`[${i + 1}] ${log.createdAt.toISOString()}`)
        lines.push(`    action: ${log.action} | targetType: ${log.targetType} | targetId: ${log.targetId || "(无)"}`)
        if (log.traceId) lines.push(`    traceId: ${log.traceId}`)
        if (log.reason) lines.push(`    reason: ${log.reason}`)
        if (log.beforeState || log.afterState) {
          lines.push(`    beforeState: ${log.beforeState ? JSON.stringify(log.beforeState).slice(0, 200) : "(无)"}`)
          lines.push(`    afterState: ${log.afterState ? JSON.stringify(log.afterState).slice(0, 200) : "(无)"}`)
        }
        lines.push("")
      }

      if (traceId) {
        lines.push("=== 调用链分析 ===")
        lines.push(`traceId=${traceId} 的完整调用链（按时间排序）:`)
        const actions = logs.map(l => `  ${l.createdAt.toISOString().slice(11, 19)} ${l.action}`)
        lines.push(...actions)
        lines.push("")
      }

      lines.push("=== 稀疏推理建议 ===")
      lines.push("基于以上审计日志，可以恢复开发上下文。")
      lines.push("如果新对话的 context 不足，可进一步调用 query_audit_logs 细化查询。")

      return textResponse(lines.join("\n"))
    } catch (error) {
      return errorResponse(
        `查询审计日志失败: ${error instanceof Error ? error.message : String(error)}\n` +
        `可能原因: 数据库未运行或 AuditLog 表不存在。请先运行 npm run db:start。`
      )
    }
  }
)

server.registerTool(
  "record_dev_operation",
  {
    description: "记录一次开发操作到 AuditLog 表。AI 助手在对代码进行任何修改/创建/删除操作后，必须调用此工具记录操作审计。这是稀疏推理（Sparse Inference）的基础——后续 AI Session 通过查询这些记录恢复开发上下文。",
    inputSchema: {
      action: z.string().describe("操作类型，如 'MODIFY', 'CREATE', 'DELETE', 'API_PAGINATION_ENABLED'"),
      targetType: z.string().describe("目标类型，如 'API_ROUTE', 'COMPONENT', 'SCHEMA', 'RULE'"),
      targetId: z.string().optional().describe("目标标识，如文件路径 '/api/knowledge/documents'"),
      beforeState: z.string().optional().describe("操作前的状态（JSON 字符串），描述修改前的关键信息"),
      afterState: z.string().optional().describe("操作后的状态（JSON 字符串），描述修改后的关键信息"),
      reason: z.string().optional().describe("操作原因，为什么做这个改动"),
    },
  },
  async (args: { action: string; targetType: string; targetId?: string; beforeState?: string; afterState?: string; reason?: string }) => {
    try {
      const { action, targetType, targetId, beforeState, afterState, reason } = args

      let parsedBefore: Prisma.InputJsonValue | undefined
      let parsedAfter: Prisma.InputJsonValue | undefined
      try {
        if (beforeState) parsedBefore = JSON.parse(beforeState) as Prisma.InputJsonValue
        if (afterState) parsedAfter = JSON.parse(afterState) as Prisma.InputJsonValue
      } catch {
        return errorResponse("beforeState 或 afterState 必须是有效的 JSON 字符串")
      }

      let systemUser = await prisma.user.findUnique({
        where: { username: "ai-assistant" },
        select: { id: true },
      })

      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            id: "ai-assistant",
            username: "ai-assistant",
            email: "ai-assistant@internal",
            password: "internal",
          },
          select: { id: true },
        })
      }

      const log = await prisma.auditLog.create({
        data: {
          userId: systemUser.id,
          action,
          targetType,
          targetId: targetId || "unknown",
          beforeState: parsedBefore ?? Prisma.JsonNull,
          afterState: parsedAfter ?? Prisma.JsonNull,
          reason: reason || null,
        },
      })

      const ts = new Date().toISOString()
      console.log(`[DEV-AUDIT] [${ts}] [${action}] ${targetType}:${targetId || "unknown"} | ${reason || ""} | ${JSON.stringify({ before: parsedBefore, after: parsedAfter })}`)

      return textResponse(
        `✅ 开发操作已记录\n` +
        `  ID: ${log.id}\n` +
        `  action: ${action}\n` +
        `  targetType: ${targetType}\n` +
        `  targetId: ${targetId || "unknown"}\n` +
        `  createdAt: ${log.createdAt.toISOString()}\n\n` +
        `后续 AI Session 可通过 get_recent_audit_logs 查询到此记录。`
      )
    } catch (error) {
      return errorResponse(`记录开发操作失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

server.registerTool(
  "find_related_docs",
  {
    description: "搜索与当前变更相关的项目文档。项目文档位于 docs/ 目录下，包括需求文档、架构文档、规范文档等。AI 助手在 ADD 范式 Step 0（文档先行）中应调用此工具查找需要更新的文档。",
    inputSchema: {
      query: z.string().describe("搜索关键词，如功能名、模块名、API 名等"),
      category: z.string().optional().describe("文档类别过滤: 'requirement' 需求, 'architecture' 架构, 'standard' 规范"),
    },
  },
  async (args: { query: string; category?: string }) => {
    try {
      const { query, category } = args

      const docsDir = join(PROJECT_ROOT, "docs")

      // 类别到目录前缀的映射
      const categoryPrefixes: Record<string, string[]> = {
        requirement: ["00-需求"],
        architecture: ["01-架构", "02-架构"],
        standard: ["02-规范", "03-规范"],
      }

      // 收集所有 Markdown 文件
       const allFiles: Array<{ path: string; relativePath: string; category: string }> = []
 
       const walkDir = async (dir: string, relativeDir: string): Promise<void> => {
         try {
           const entries = await readdir(dir, { withFileTypes: true })
           for (const entry of entries) {
             const fullPath = join(dir, entry.name)
             const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
             if (entry.isDirectory()) {
               await walkDir(fullPath, relPath)
             } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".html"))) {
               // 确定文档类别
               let docCategory = "unknown"
               for (const [cat, prefixes] of Object.entries(categoryPrefixes)) {
                 if (prefixes.some(p => relPath.includes(p))) {
                   docCategory = cat
                   break
                 }
               }
               allFiles.push({ path: fullPath, relativePath: relPath, category: docCategory })
             }
           }
         } catch {
           // Ignore errors for non-existent dirs
         }
       }
 
       await walkDir(docsDir, "")

      // 如果指定了类别，先过滤
      let filtered = allFiles
      if (category && categoryPrefixes[category]) {
        filtered = allFiles.filter(f => f.category === category)
      }

      // 关键词匹配（文件名和内容第一行标题）
      const queryLower = query.toLowerCase()
      const matchingDocs: Array<{
        path: string
        relativePath: string
        category: string
        title: string
        relevance: number
      }> = []

      for (const doc of filtered) {
        const fileName = doc.relativePath.toLowerCase()
        let title = ""
        let relevance = 0

        // 文件名匹配
        if (fileName.includes(queryLower)) {
          relevance += 3
        }

        // 读取文件第一行获取标题
        try {
          const content = await readFileSafe(doc.path)
          if (content) {
            const firstLine = content.split("\n")[0]
            // 尝试获取 Markdown 标题
            const titleMatch = content.match(/^#\s+(.+)/m)
            if (titleMatch) {
              title = titleMatch[1].trim()
            } else {
              title = firstLine.replace(/^#+\s*/, "").replace(/[#*]/g, "").trim()
            }
            // 内容匹配
            const contentLower = content.toLowerCase()
            if (contentLower.includes(queryLower)) {
              relevance += 2
            }
            // 提取相关段落摘要
            const lines = content.split("\n")
            const matchingLines = lines.filter(l => l.toLowerCase().includes(queryLower))
            if (matchingLines.length > 0) {
              relevance += Math.min(matchingLines.length, 5)
            }
          }
        } catch {
          // Ignore read errors
        }

        if (relevance > 0) {
          matchingDocs.push({
            path: doc.path,
            relativePath: doc.relativePath,
            category: doc.category,
            title: title || doc.relativePath.split("/").pop() || doc.relativePath,
            relevance,
          })
        }
      }

      // 按相关性降序排序
      matchingDocs.sort((a, b) => b.relevance - a.relevance)

      // 构建输出
      const parts: string[] = [
        `=== 项目文档搜索: "${query}" ===`,
        `搜索范围: docs/ 目录`,
        category ? `文档类别: ${category}（${categoryPrefixes[category]?.join(", ") || category}）` : "文档类别: 全部",
        `匹配文档数: ${matchingDocs.length}`,
        "",
      ]

      if (matchingDocs.length === 0) {
        parts.push("未找到匹配的文档。建议:")
        parts.push("- 检查关键词拼写")
        parts.push("- 尝试使用更宽泛的关键词")
        parts.push("- 确认 docs/ 目录下存在相关文档")
        parts.push("")
        // 列出所有可用文档作为参考
        parts.push("=== 可用文档列表 ===")
        for (const doc of allFiles) {
          const catLabel: Record<string, string> = {
            requirement: "[需求]",
            architecture: "[架构]",
            standard: "[规范]",
            unknown: "[其他]",
          }
          parts.push(`  ${catLabel[doc.category] || "[其他]"} ${doc.relativePath}`)
        }
      } else {
        // 按类别分组展示
        const byCategory: Record<string, typeof matchingDocs> = {}
        for (const doc of matchingDocs) {
          const cat = doc.category || "unknown"
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(doc)
        }

        const catLabelFull: Record<string, string> = {
          requirement: "需求文档",
          architecture: "架构文档",
          standard: "规范文档",
          unknown: "其他文档",
        }

        for (const [cat, docs] of Object.entries(byCategory)) {
          parts.push(`--- ${catLabelFull[cat] || "其他文档"} (${docs.length}篇) ---`)
          for (const doc of docs) {
            parts.push(`  [相关度 ${doc.relevance}] ${doc.relativePath}`)
            parts.push(`  标题: ${doc.title}`)
            parts.push("")
          }
        }

        parts.push("=== 使用提示 ===")
        parts.push("1. 阅读文档确认需要更新的章节")
        parts.push("2. 在修改代码前先更新文档内容")
        parts.push("3. 更新完成后调用 record_dev_operation 记录文档变更")
        parts.push("   → targetType: \"DOC\", action: \"DOC_UPDATED\" 或 \"DOC_CREATED\"")
        parts.push("   → targetId: 文档文件路径")
      }

      return textResponse(parts.join("\n"))
    } catch (error) {
      return errorResponse(`搜索文档失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("[ADD-MCP] add-dev-tools MCP server started on stdio")
}

main().catch((error) => {
  console.error("[ADD-MCP] Fatal error:", error)
  process.exit(1)
})
