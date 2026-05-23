import { ChatOpenAI } from "@langchain/openai"

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

const LLM_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || "",
  baseUrl: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: process.env.LLM_MODEL || "qwen-vl-plus",
  temperature: 0.1,
  maxTokens: 4000,
}

function createLLM() {
  return new ChatOpenAI({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.temperature,
    maxTokens: LLM_CONFIG.maxTokens,
    apiKey: LLM_CONFIG.apiKey,
    configuration: {
      baseURL: LLM_CONFIG.baseUrl,
    },
  })
}

const globalForLLM = globalThis as unknown as {
  llm: ReturnType<typeof createLLM> | undefined
  llmWithTools: ReturnType<ReturnType<typeof createLLM>["bindTools"]> | undefined
}

export const llm = globalForLLM.llm ?? createLLM()

if (process.env.NODE_ENV !== "production") {
  globalForLLM.llm = llm
}

let agentTools: Array<{ name: string; description: string; schema?: unknown }> | undefined

export function setAgentTools(
  tools: Array<{ name: string; description: string; schema?: unknown }>
) {
  agentTools = tools
}

export const llmWithTools = (() => {
  if (agentTools && agentTools.length > 0) {
    return llm.bindTools(agentTools as Parameters<typeof llm.bindTools>[0])
  }
  return llm
})()

export function getLLMConfig() {
  return { ...LLM_CONFIG }
}

export function updateLLMConfig(updates: Partial<typeof LLM_CONFIG>) {
  Object.assign(LLM_CONFIG, updates)
}
