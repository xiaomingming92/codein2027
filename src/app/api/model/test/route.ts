import { NextRequest, NextResponse } from "next/server"
import { modelConfigAudit } from "@/lib/model-config-logger"
import type { ConnectionStatus } from "@/config/model-config"
import { resolveApiKeyForModel } from "@/config/model-config"

interface ModelTestRequest {
  provider: "cloud" | "ollama"
  baseURL: string
  model: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}

interface ModelTestResponse {
  status: ConnectionStatus
  message: string
  latencyMs?: number
  detail?: string
}

async function testCloudConnection(config: ModelTestRequest): Promise<ModelTestResponse> {
  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`
    }

    const response = await fetch(`${config.baseURL}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      return {
        status: "connect_failed",
        message: `服务端返回错误: HTTP ${response.status}`,
        latencyMs,
        detail: response.statusText,
      }
    }

    return {
      status: "connected",
      message: "连接成功",
      latencyMs,
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (error instanceof Error && (error.name === "AbortError" || error.message.includes("fetch"))) {
      return {
        status: "connect_failed",
        message: "无法连接到服务地址，请检查网络和地址是否正确",
        latencyMs,
        detail: error.message,
      }
    }

    return {
      status: "connect_failed",
      message: "连接异常",
      latencyMs,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testCloudInvoke(config: ModelTestRequest): Promise<ModelTestResponse> {
  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`
    }

    const body = {
      model: config.model,
      messages: [{ role: "user", content: "Hello, reply with just 'ok'." }],
      max_tokens: 5,
      temperature: config.temperature ?? 0.1,
    }

    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      return {
        status: "invoke_failed",
        message: `模型调用失败: HTTP ${response.status}`,
        latencyMs,
        detail: errorBody || response.statusText,
      }
    }

    return {
      status: "connected",
      message: "模型调用成功",
      latencyMs,
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "invoke_failed",
        message: "模型调用超时（30秒）",
        latencyMs,
        detail: error.message,
      }
    }

    return {
      status: "invoke_failed",
      message: "模型调用异常",
      latencyMs,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testOllamaConnection(config: ModelTestRequest): Promise<ModelTestResponse> {
  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(`${config.baseURL}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      return {
        status: "connect_failed",
        message: `Ollama 服务返回错误: HTTP ${response.status}`,
        latencyMs,
        detail: response.statusText,
      }
    }

    const data = await response.json()
    const availableModels: Array<{ name: string }> = Array.isArray(data?.models) ? data.models : []
    const modelExists = availableModels.some(
      (m) => m.name === config.model || m.name.startsWith(`${config.model}:`)
    )

    if (!modelExists) {
      return {
        status: "invoke_failed",
        message: `已连接 Ollama 服务，但模型 "${config.model}" 不存在。可用模型: ${availableModels.map((m) => m.name).join(", ") || "无"}`,
        latencyMs,
      }
    }

    return {
      status: "connected",
      message: "连接成功，模型已就绪",
      latencyMs,
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (error instanceof Error && (error.name === "AbortError" || error.message.includes("fetch"))) {
      return {
        status: "connect_failed",
        message: "无法连接到 Ollama 服务，请检查服务地址是否正确以及 Ollama 是否已启动",
        latencyMs,
        detail: error.message,
      }
    }

    return {
      status: "connect_failed",
      message: "Ollama 连接异常",
      latencyMs,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function testOllamaInvoke(config: ModelTestRequest): Promise<ModelTestResponse> {
  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const body = {
      model: config.model,
      messages: [{ role: "user", content: "Hello, reply with just 'ok'." }],
      stream: false,
      options: {
        temperature: config.temperature ?? 0.1,
        num_predict: 5,
      },
    }

    const response = await fetch(`${config.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      return {
        status: "invoke_failed",
        message: `Ollama 模型调用失败: HTTP ${response.status}`,
        latencyMs,
        detail: errorBody || response.statusText,
      }
    }

    return {
      status: "connected",
      message: "Ollama 模型调用成功",
      latencyMs,
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: "invoke_failed",
        message: "Ollama 模型调用超时（30秒）",
        latencyMs,
        detail: error.message,
      }
    }

    return {
      status: "invoke_failed",
      message: "Ollama 模型调用异常",
      latencyMs,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: ModelTestRequest = await request.json()

    if (!body.baseURL || !body.model) {
      return NextResponse.json(
        { status: "connect_failed" as ConnectionStatus, message: "缺少必要参数: baseURL, model" },
        { status: 400 }
      )
    }

    if (body.provider === "cloud" && !body.apiKey) {
      body.apiKey = resolveApiKeyForModel({
        provider: body.provider,
        baseURL: body.baseURL,
        model: body.model,
        temperature: body.temperature ?? 0.3,
        maxTokens: body.maxTokens ?? 4000,
        id: "",
        name: "",
        providerLabel: "",
      })
    }

    modelConfigAudit("MODEL_CONFIG_START", `模型连通性测试: ${body.provider}/${body.model}`, {
      provider: body.provider,
      model: body.model,
      baseURL: body.baseURL,
      apiKeySource: body.apiKey ? "resolved" : "none",
    })

    let connectionResult: ModelTestResponse
    let invokeResult: ModelTestResponse

    if (body.provider === "cloud") {
      connectionResult = await testCloudConnection(body)
    } else {
      connectionResult = await testOllamaConnection(body)
    }

    if (connectionResult.status !== "connected") {
      modelConfigAudit("MODEL_CONFIG_FAIL", `模型连通性测试失败: ${connectionResult.message}`, {
        status: connectionResult.status,
        provider: body.provider,
        model: body.model,
        detail: connectionResult.detail,
      })
      return NextResponse.json(connectionResult)
    }

    if (body.provider === "cloud") {
      invokeResult = await testCloudInvoke(body)
    } else {
      invokeResult = await testOllamaInvoke(body)
    }

    modelConfigAudit("MODEL_CONFIG_DONE", `模型连通性测试完成: ${invokeResult.message}`, {
      status: invokeResult.status,
      provider: body.provider,
      model: body.model,
      latencyMs: invokeResult.latencyMs,
    })

    return NextResponse.json(invokeResult)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    modelConfigAudit("MODEL_CONFIG_FAIL", `模型测试 API 异常: ${errorMessage}`, {
      error: errorMessage,
    })
    return NextResponse.json(
      {
        status: "connect_failed" as ConnectionStatus,
        message: "服务器内部错误",
        detail: errorMessage,
      },
      { status: 500 }
    )
  }
}
