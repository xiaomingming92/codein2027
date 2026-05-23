import { ChatOpenAI } from "@langchain/openai"
import { ChatOllama } from "@langchain/ollama"
import type { Runnable } from "@langchain/core/runnables"
import { agentAuditLLMCall, agentAuditLLMError } from "@/lib/agent-audit-logger"

export type LLMProviderType = "cloud" | "ollama"

export interface MultimodalContent {
  type: "text" | "image_url" | "audio_url" | "video_url"
  text?: string
  image_url?: {
    url: string
    detail?: "low" | "high" | "auto"
  }
  audio_url?: {
    url: string
    format?: string
  }
  video_url?: {
    url: string
    format?: string
  }
}

export interface MultimodalMessage {
  role: "user" | "assistant" | "system"
  content: MultimodalContent[]
  name?: string
}

interface CloudLLMConfig {
  provider: "cloud"
  apiKey: string
  baseURL: string
  model: string
  temperature: number
  maxTokens: number
}

interface OllamaLLMConfig {
  provider: "ollama"
  baseURL: string
  model: string
  temperature: number
  maxTokens: number
}

export type LLMConfig = CloudLLMConfig | OllamaLLMConfig

let llmInstance: AuditedLLM | null = null
let llmWithToolsInstance: Runnable | AuditedLLM | null = null
let agentToolsInstance: Array<{ name: string; description: string; schema?: unknown }> | undefined

class AuditedLLM {
  private llm: ChatOpenAI | ChatOllama
  private model: string

  constructor(llm: ChatOpenAI | ChatOllama, model: string) {
    this.llm = llm
    this.model = model
  }

  async invoke(input: string | Parameters<ChatOpenAI["invoke"]>[0]) {
    const startTime = Date.now()
    const inputStr = typeof input === "string" ? input : JSON.stringify(input)
    try {
      const result = await this.llm.invoke(input as Parameters<ChatOpenAI["invoke"]>[0])
      const durationMs = Date.now() - startTime
      const outputStr = typeof result.content === "string" ? result.content : JSON.stringify(result.content)
      agentAuditLLMCall(this.model, durationMs, inputStr.length, outputStr.length)
      return result
    } catch (error) {
      const durationMs = Date.now() - startTime
      agentAuditLLMError(this.model, error)
      throw error
    }
  }

  bindTools(tools: Parameters<ChatOpenAI["bindTools"]>[0]) {
    if (this.llm instanceof ChatOpenAI) {
      return this.llm.bindTools(tools)
    }
    return this.llm
  }

  stream(input: Parameters<ChatOpenAI["stream"]>[0]) {
    return this.llm.stream(input)
  }

  get underlying() {
    return this.llm
  }
}

export function getLLMProviderType(): LLMProviderType {
  const provider = process.env.LLM_PROVIDER || "cloud"
  if (provider === "ollama") {
    return "ollama"
  }
  return "cloud"
}

function resolveLLMApiKey(): string {
  const directKey = process.env.OPENAI_API_KEY
  if (directKey) return directKey
  const dashscopeKey = process.env.OPENAI_API_KEY_DASHSCOPE
  if (dashscopeKey) return dashscopeKey
  const deepseekKey = process.env.OPENAI_API_KEY_DEEPSEEK
  if (deepseekKey && deepseekKey !== "sk-") return deepseekKey
  return ""
}

export function getLLMConfig(): LLMConfig {
  const providerType = getLLMProviderType()

  let config: LLMConfig

  if (providerType === "ollama") {
    config = {
      provider: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_MODEL || "qwen2.5",
      temperature: 0.1,
      maxTokens: 4000,
    }
  } else {
    config = {
      provider: "cloud",
      apiKey: resolveLLMApiKey(),
      baseURL: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: process.env.LLM_MODEL || "qwen-vl-plus",
      temperature: 0.1,
      maxTokens: 4000,
    }
  }

  if (runtimeConfigOverride) {
    config = { ...config, ...runtimeConfigOverride } as LLMConfig
  }

  return config
}

function createCloudLLM(config: CloudLLMConfig): ChatOpenAI {
  return new ChatOpenAI({
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    apiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
    },
  })
}

function createOllamaLLM(config: OllamaLLMConfig): ChatOllama {
  return new ChatOllama({
    baseUrl: config.baseURL,
    model: config.model,
    temperature: config.temperature,
  })
}

export function getLLM(): AuditedLLM {
  if (llmInstance) {
    return llmInstance
  }

  const config = getLLMConfig()

  if (config.provider === "ollama") {
    const ollamaLLM = createOllamaLLM(config as OllamaLLMConfig)
    llmInstance = new AuditedLLM(ollamaLLM, config.model)
  } else {
    const cloudLLM = createCloudLLM(config as CloudLLMConfig)
    llmInstance = new AuditedLLM(cloudLLM, config.model)
  }

  return llmInstance
}

export function setAgentTools(
  tools: Array<{ name: string; description: string; schema?: unknown }>
) {
  agentToolsInstance = tools
  llmWithToolsInstance = null
}

export function getLLMWithTools(): Runnable | AuditedLLM {
  const llm = getLLM()

  if (!agentToolsInstance || agentToolsInstance.length === 0) {
    return llm
  }

  if (llmWithToolsInstance) {
    return llmWithToolsInstance
  }

  if (llm.underlying instanceof ChatOpenAI) {
    llmWithToolsInstance = llm.bindTools(agentToolsInstance as Parameters<ChatOpenAI["bindTools"]>[0])
  } else {
    llmWithToolsInstance = llm
  }

  return llmWithToolsInstance
}

export function resetLLM(): void {
  llmInstance = null
  llmWithToolsInstance = null
}

export function getLLMConfigInfo() {
  const config = getLLMConfig()
  return {
    provider: config.provider,
    model: config.model,
    baseURL: config.provider === "cloud" ? config.baseURL : config.baseURL,
  }
}

let runtimeConfigOverride: Partial<LLMConfig> | null = null

export function setLLMConfig(config: {
  provider?: LLMProviderType
  model?: string
  baseURL?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}): void {
  const previousConfig = getLLMConfig()
  runtimeConfigOverride = {
    ...(config.provider ? { provider: config.provider } : {}),
    ...(config.model ? { model: config.model } : {}),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
  } as Partial<LLMConfig>
  resetLLM()
  const newConfig = getLLMConfig()
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { modelConfigAudit } = require("@/lib/model-config-logger")
    modelConfigAudit("MODEL_CONFIG_APPLY", `LLM配置切换: ${previousConfig.model} → ${newConfig.model}`, {
      previousModel: previousConfig.model,
      newModel: newConfig.model,
      provider: newConfig.provider,
      baseURL: newConfig.baseURL,
    })
  } catch {
    // Logger unavailable in server context
  }
}

export function clearLLMConfigOverride(): void {
  runtimeConfigOverride = null
  resetLLM()
}

export { getLLMConfig as getRawLLMConfig }
