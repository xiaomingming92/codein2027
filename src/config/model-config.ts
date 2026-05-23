import { readFileSync } from "fs"
import { join } from "path"
import * as TOML from "smol-toml"

export type ModelProvider = "cloud" | "ollama"

export type ConnectionStatus = "unknown" | "connected" | "connect_failed" | "invoke_failed"

export interface ModelInfo {
  id: string
  name: string
  provider: ModelProvider
  providerLabel: string
  baseURL: string
  model: string
  apiKey?: string
  temperature: number
  maxTokens: number
  multimodal: boolean
  connectionStatus?: ConnectionStatus
}

export interface OllamaTemplate {
  model: string
  name: string
  providerLabel: string
  multimodal?: boolean
}

interface TomlCloudModel {
  model: string
  name?: string
  providerLabel?: string
  baseURL?: string
  apiKeyEnv?: string
  temperature?: number
  maxTokens?: number
  multimodal?: boolean
}

interface TomlDefaults {
  cloud?: {
    baseURL?: string
    apiKeyEnv?: string
    temperature?: number
    maxTokens?: number
    multimodal?: boolean
  }
  ollama?: {
    baseURL?: string
    temperature?: number
    maxTokens?: number
    multimodal?: boolean
  }
}

interface TomlConfig {
  defaults?: TomlDefaults
  cloud?: TomlCloudModel[]
  ollama_template?: Array<{
    model: string
    name?: string
    providerLabel?: string
    multimodal?: boolean
  }>
}

function resolveTomlPath(): string {
  return join(process.cwd(), "src/config/model.toml")
}

function readTomlConfig(): TomlConfig {
  try {
    const content = readFileSync(resolveTomlPath(), "utf-8")
    return TOML.parse(content) as unknown as TomlConfig
  } catch (error) {
    console.error("[MODEL-CONFIG] Failed to read model.toml:", error)
    return {}
  }
}

function resolveEnvVar(envKey: string): string {
  return process.env[envKey] || ""
}

function buildCloudModels(config: TomlConfig): ModelInfo[] {
  const defaults = config.defaults?.cloud
  const cloudEntries = config.cloud

  if (!cloudEntries || !Array.isArray(cloudEntries) || cloudEntries.length === 0) {
    return []
  }

  return cloudEntries.map((entry) => {
    const apiKeyEnv = entry.apiKeyEnv || defaults?.apiKeyEnv || "OPENAI_API_KEY"
    const apiKey = resolveEnvVar(apiKeyEnv)

    return {
      id: `cloud-${entry.model}`,
      name: entry.name || entry.model,
      provider: "cloud" as ModelProvider,
      providerLabel: entry.providerLabel || "云端模型",
      baseURL: entry.baseURL || defaults?.baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: entry.model,
      apiKey: apiKey || undefined,
      temperature: entry.temperature ?? defaults?.temperature ?? 0.3,
      maxTokens: entry.maxTokens ?? defaults?.maxTokens ?? 4000,
      multimodal: entry.multimodal ?? defaults?.multimodal ?? false,
    }
  })
}

function buildOllamaTemplates(config: TomlConfig): OllamaTemplate[] {
  const templates = config.ollama_template
  if (!templates || !Array.isArray(templates)) return []

  return templates.map((t) => ({
    model: t.model,
    name: t.name || t.model,
    providerLabel: t.providerLabel || "Ollama",
    multimodal: t.multimodal ?? config.defaults?.ollama?.multimodal ?? false,
  }))
}

function buildFallbackCloudModels(): ModelInfo[] {
  const apiKey = resolveEnvVar("OPENAI_API_KEY")
  const baseURL = process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  const model = process.env.LLM_MODEL || "qwen-vl-plus"

  console.warn(
    `[MODEL-CONFIG] model.toml 解析失败或 [[cloud]] 为空，使用环境变量兜底。` +
    `请检查 src/config/model.toml 是否存在且格式正确。`
  )

  return [
    {
      id: `cloud-${model}`,
      name: model,
      provider: "cloud",
      providerLabel: "云端模型",
      baseURL,
      model,
      apiKey: apiKey || undefined,
      temperature: 0.1,
      maxTokens: 4000,
      multimodal: false,
    },
  ]
}

let cachedModels: ModelInfo[] | null = null
let cachedTemplates: OllamaTemplate[] | null = null

function getModelsFromToml(): ModelInfo[] {
  if (cachedModels) return cachedModels

  const config = readTomlConfig()
  const cloudModels = buildCloudModels(config)

  if (cloudModels.length > 0) {
    cachedModels = cloudModels
  } else {
    cachedModels = buildFallbackCloudModels()
  }

  return cachedModels!
}

function getTemplatesFromToml(): OllamaTemplate[] {
  if (cachedTemplates) return cachedTemplates

  const config = readTomlConfig()
  cachedTemplates = buildOllamaTemplates(config)
  return cachedTemplates!
}

export function getDefaultModelId(): string {
  return process.env.LLM_MODEL || "cloud-qwen-vl-plus"
}

export function getDefaultModel(): ModelInfo | undefined {
  return getModelsFromToml().find((m) => m.id === getDefaultModelId()) || getModelsFromToml()[0]
}

export const DEFAULT_MODELS: ModelInfo[] = getModelsFromToml()

export const OLLAMA_TEMPLATES: OllamaTemplate[] = getTemplatesFromToml()

export const OLLAMA_DEFAULTS = {
  baseURL: "http://localhost:11434",
  temperature: 0.1,
  maxTokens: 4000,
  multimodal: false,
}

export function resolveApiKeyForModel(model: ModelInfo): string | undefined {
  if (model.provider === "ollama") return undefined

  if (model.apiKey) return model.apiKey

  const config = readTomlConfig()
  const defaults = config.defaults?.cloud
  const cloudEntries = config.cloud

  const envKey = cloudEntries?.find((e) => e.model === model.model)?.apiKeyEnv
    || defaults?.apiKeyEnv
    || "OPENAI_API_KEY"

  return resolveEnvVar(envKey) || undefined
}
