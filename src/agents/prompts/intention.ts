import { PromptTemplate, IntentionInput, IntentionOutput } from "./types"

export const intentionPrompt: PromptTemplate<IntentionInput, IntentionOutput> = {
  id: "intention",
  name: "意图解析",
  description: "分析用户消息的意图，返回结构化的意图和实体信息",

  build(input: IntentionInput): string {
    const { hasImage, hasAudio, textContent, userMessage } = input

    if (hasImage || hasAudio) {
      return `
你是一个意图解析助手，需要分析用户消息的意图。

用户输入包含：
${hasImage ? "- 图片内容\n" : ""}${hasAudio ? "- 音频内容\n" : ""}- 文本内容：${textContent || "无"}

请分析并返回以下格式的 JSON：
{
  "intent": "analysis | planning | question | decision | creation | modification | chat",
  "entities": {
    "projectId": "如果提到项目，提取项目ID",
    "taskId": "如果提到任务，提取任务ID",
    "keywords": ["关键词列表"]
  },
  "multimodal": {
    "hasImage": ${hasImage},
    "hasAudio": ${hasAudio}
  }
}

只返回 JSON，不要其他内容。
`
    }

    return `
你是一个意图解析助手，需要分析用户消息的意图。

用户消息：${userMessage}

请分析并返回以下格式的 JSON：
{
  "intent": "analysis | planning | question | decision | creation | modification | chat",
  "entities": {
    "projectId": "如果提到项目，提取项目ID",
    "taskId": "如果提到任务，提取任务ID",
    "keywords": ["关键词列表"]
  }
}

只返回 JSON，不要其他内容。
`
  },

  parse(raw: string): IntentionOutput {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    const validIntents: IntentionOutput["intent"][] = [
      "analysis", "planning", "question", "decision", "creation", "modification", "chat",
    ]
    const intent = validIntents.includes(parsed.intent) ? parsed.intent : "chat"

    return {
      intent,
      entities: {
        projectId: parsed.entities?.projectId || undefined,
        taskId: parsed.entities?.taskId || undefined,
        keywords: Array.isArray(parsed.entities?.keywords) ? parsed.entities.keywords : [],
      },
      multimodal: parsed.multimodal
        ? {
            hasImage: Boolean(parsed.multimodal.hasImage),
            hasAudio: Boolean(parsed.multimodal.hasAudio),
          }
        : undefined,
    }
  },

  validate(output: IntentionOutput): boolean {
    const validIntents: IntentionOutput["intent"][] = [
      "analysis", "planning", "question", "decision", "creation", "modification", "chat",
    ]
    if (!validIntents.includes(output.intent)) return false
    if (!output.entities || !Array.isArray(output.entities.keywords)) return false
    return true
  },
}
