import { getLLMConfigInfo, getLLMProviderType, getLLMConfig } from "../src/lib/llm/index"
import { prisma } from "../src/lib/prisma"
import { CHROMA_URL, CHROMA_AUTH_TOKEN, CHROMA_COLLECTION, getChromaHeaders } from "../src/config/chroma-config"

interface DiagnosticResult {
  name: string
  status: "ok" | "error" | "warn"
  message: string
  detail?: string
  durationMs?: number
}

async function diagnoseLLM(): Promise<DiagnosticResult> {
  const config = getLLMConfigInfo()
  const startTime = Date.now()

  try {
    const { ChatOpenAI } = await import("@langchain/openai")
    const llm = new ChatOpenAI({
      model: config.model,
      apiKey: process.env.OPENAI_API_KEY || "",
      configuration: { baseURL: config.baseURL },
      maxTokens: 10,
    })

    const result = await llm.invoke("回复OK")
    const durationMs = Date.now() - startTime
    const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content)

    return {
      name: "LLM API",
      status: "ok",
      message: `连通正常, 响应: "${content.slice(0, 50)}"`,
      detail: `provider=${config.provider}, model=${config.model}, baseURL=${config.baseURL}`,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      name: "LLM API",
      status: "error",
      message: `连接失败: ${errorMsg.slice(0, 200)}`,
      detail: `provider=${config.provider}, model=${config.model}, baseURL=${config.baseURL}`,
      durationMs,
    }
  }
}

async function diagnoseChromaDB(): Promise<DiagnosticResult> {
  const startTime = Date.now()
  try {
    const headers = getChromaHeaders()

    const heartbeatResp = await fetch(`${CHROMA_URL}/api/v1/heartbeat`, { headers })
    if (!heartbeatResp.ok) {
      throw new Error(`Heartbeat failed: ${heartbeatResp.status}`)
    }

    const collectionsResp = await fetch(`${CHROMA_URL}/api/v1/collections`, { headers })
    if (!collectionsResp.ok) {
      throw new Error(`List collections failed: ${collectionsResp.status}`)
    }
    const collections = await collectionsResp.json() as Array<{ name: string; id: string }>

    const targetCollection = collections.find((c) => c.name === CHROMA_COLLECTION)
    let vectorCount = 0
    if (targetCollection) {
      const countResp = await fetch(`${CHROMA_URL}/api/v1/collections/${targetCollection.id}/count`, { headers })
      if (countResp.ok) {
        vectorCount = await countResp.json() as number
      }
    }

    const durationMs = Date.now() - startTime
    return {
      name: "ChromaDB",
      status: "ok",
      message: `连通正常, 集合数: ${collections.length}, 目标集合向量数: ${vectorCount}`,
      detail: `url=${CHROMA_URL}, collection=${CHROMA_COLLECTION}`,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      name: "ChromaDB",
      status: "error",
      message: `连接失败: ${errorMsg.slice(0, 200)}`,
      detail: `url=${CHROMA_URL}`,
      durationMs,
    }
  }
}

async function diagnoseDatabase(): Promise<DiagnosticResult> {
  const startTime = Date.now()
  try {
    const docCount = await prisma.document.count()
    const indexedCount = await prisma.document.count({
      where: { status: "INDEXED" },
    })
    const durationMs = Date.now() - startTime

    return {
      name: "PostgreSQL",
      status: "ok",
      message: `连通正常, 文档总数: ${docCount}, 已索引: ${indexedCount}`,
      detail: `DATABASE_URL=${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@")}`,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      name: "PostgreSQL",
      status: "error",
      message: `连接失败: ${errorMsg.slice(0, 200)}`,
      durationMs,
    }
  }
}

async function diagnoseEnvConfig(): Promise<DiagnosticResult> {
  const missing: string[] = []
  const present: string[] = []

  const requiredVars = [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "LLM_BASE_URL",
    "CHROMA_HOST",
    "CHROMA_PORT",
  ]

  for (const varName of requiredVars) {
    if (process.env[varName]) {
      present.push(varName)
    } else {
      missing.push(varName)
    }
  }

  return {
    name: "环境变量",
    status: missing.length > 0 ? "warn" : "ok",
    message: missing.length > 0 ? `缺少: ${missing.join(", ")}` : "所有必需变量已配置",
    detail: `已配置: ${present.join(", ")}`,
  }
}

async function main() {
  console.log("═══════════════════════════════════════")
  console.log("  Agent 诊断工具")
  console.log("═══════════════════════════════════════\n")

  const results = await Promise.all([
    diagnoseEnvConfig(),
    diagnoseLLM(),
    diagnoseChromaDB(),
    diagnoseDatabase(),
  ])

  for (const result of results) {
    const icon = result.status === "ok" ? "✅" : result.status === "warn" ? "⚠️" : "❌"
    const duration = result.durationMs ? ` (${result.durationMs}ms)` : ""
    console.log(`${icon} [${result.name}] ${result.message}${duration}`)
    if (result.detail) {
      console.log(`   ${result.detail}`)
    }
    console.log()
  }

  const hasError = results.some((r) => r.status === "error")
  console.log("═══════════════════════════════════════")
  if (hasError) {
    console.log("  ❌ 存在连接问题，请检查上述错误")
    console.log("\n  常见问题排查:")
    console.log("  1. LLM 连接失败 → 检查 OPENAI_API_KEY 和 LLM_BASE_URL")
    console.log("  2. ChromaDB 连接失败 → 运行 npm run db:start")
    console.log("  3. PostgreSQL 连接失败 → 运行 npm run db:start")
  } else {
    console.log("  ✅ 所有服务连通正常")
  }
  console.log("═══════════════════════════════════════")

  await prisma.$disconnect()
  process.exit(hasError ? 1 : 0)
}

main().catch((error) => {
  console.error("诊断失败:", error)
  process.exit(1)
})
