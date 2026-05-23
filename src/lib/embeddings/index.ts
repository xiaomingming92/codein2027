import { OpenAIEmbeddings } from "@langchain/openai"
import { OllamaEmbeddings } from "@langchain/ollama"

export type EmbeddingProviderType = "cloud" | "ollama"

interface CloudEmbeddingConfig {
  provider: "cloud"
  apiKey: string
  baseURL: string
  model: string
}

interface OllamaEmbeddingConfig {
  provider: "ollama"
  baseURL: string
  model: string
}

export type EmbeddingConfig = CloudEmbeddingConfig | OllamaEmbeddingConfig

let embeddingsInstance: OpenAIEmbeddings | OllamaEmbeddings | null = null

export function getEmbeddingProviderType(): EmbeddingProviderType {
  const provider = process.env.EMBEDDING_PROVIDER || "cloud"
  if (provider === "ollama") {
    return "ollama"
  }
  return "cloud"
}

function resolveCloudApiKey(): string {
  const directKey = process.env.OPENAI_API_KEY
  if (directKey) return directKey
  const dashscopeKey = process.env.OPENAI_API_KEY_DASHSCOPE
  if (dashscopeKey) return dashscopeKey
  const deepseekKey = process.env.OPENAI_API_KEY_DEEPSEEK
  if (deepseekKey && deepseekKey !== "sk-") return deepseekKey
  return ""
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const providerType = getEmbeddingProviderType()

  if (providerType === "ollama") {
    return {
      provider: "ollama",
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      model: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
    }
  }

  return {
    provider: "cloud",
    apiKey: resolveCloudApiKey(),
    baseURL: process.env.EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: process.env.EMBEDDING_MODEL || "text-embedding-v4",
  }
}

export function getEmbeddings(): OpenAIEmbeddings | OllamaEmbeddings {
  if (embeddingsInstance) {
    return embeddingsInstance
  }

  const config = getEmbeddingConfig()

  if (config.provider === "ollama") {
    embeddingsInstance = new OllamaEmbeddings({
      baseUrl: config.baseURL,
      model: config.model,
    })
  } else {
    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: config.apiKey,
      configuration: {
        baseURL: config.baseURL,
      },
      model: config.model,
    })
  }

  return embeddingsInstance
}

export function resetEmbeddings(): void {
  embeddingsInstance = null
}
