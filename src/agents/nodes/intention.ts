import { AgentState } from "../state"
import { getLLM } from "@/lib/llm/index"
import { agentAudit } from "@/lib/agent-audit-logger"
import { intentionPrompt } from "@/agents/prompts"
import type { IntentionInput, IntentionOutput } from "@/agents/prompts"
import { NodeStreamController } from "@/agents/node-stream-controller"

export async function intentionNode(state: typeof AgentState.State) {
  const { messages, explicitIntent } = state
  const stream = NodeStreamController.fromState(state, "intention")
  stream.nodeStarted()
  const lastMessage = messages[messages.length - 1]

  if (!lastMessage || lastMessage.role !== "user") {
    return { currentTask: state.currentTask }
  }

  const content = lastMessage.content
  let hasImage = false
  let hasAudio = false

  if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === "object" && item !== null && "type" in item) {
        const itemType = (item as { type: string }).type
        if (itemType === "image_url") hasImage = true
        if (itemType === "audio_url") hasAudio = true
      }
    }
  }

  let queryText: string
  if (Array.isArray(content)) {
    queryText = content
      .filter(function (c) {
        return typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "text"
      })
      .map(function (c) {
        return (c as { text?: string }).text || ""
      })
      .filter(Boolean)
      .join("\n")
  } else if (typeof content === "string") {
    queryText = content
  } else {
    queryText = JSON.stringify(content)
  }

  if (explicitIntent) {
    agentAudit("NODE_END", "intention: explicit intent", {
      source: "explicit",
      intent: explicitIntent,
    })

    stream.structuredOutput({
      intent: {
        type: explicitIntent,
        source: "explicit",
        original: queryText,
      },
    })

    return {
      currentTask: {
        ...state.currentTask,
        intent: explicitIntent,
        entities: state.currentTask?.entities || {},
        query: queryText,
      },
    }
  }

  const input: IntentionInput = {
    userMessage: queryText,
    hasImage,
    hasAudio,
    textContent: queryText,
  }

  const prompt = intentionPrompt.build(input)
  const response = await getLLM().invoke(prompt)

  let parsed: IntentionOutput = { intent: "chat", entities: { keywords: [] } }

  try {
    const result = intentionPrompt.parse(response.content as string)
    if (!intentionPrompt.validate(result)) {
      throw new Error("Validation failed")
    }
    parsed = result
    agentAudit("NODE_END", "intention parse success", {
      source: "llm_parsed",
      intent: result.intent,
      keywords: result.entities.keywords,
    })
  } catch (_e) {
    agentAudit("NODE_END", "intention parse fallback to chat", { fallback: true })
  }

  stream.structuredOutput({
    intent: {
      type: parsed.intent,
      source: "llm_parsed",
      original: queryText,
    },
  })

  return {
    currentTask: {
      ...state.currentTask,
      intent: parsed.intent,
      entities: {
        ...parsed.entities,
        ...(parsed.multimodal ? { multimodal: parsed.multimodal } : {}),
      },
      query: queryText,
    },
  }
}