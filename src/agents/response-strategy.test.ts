import { describe, expect, test } from "vitest"
import {
  getResponseStrategyRegistry,
  resolveResponseStrategy,
  type StrategyContext,
} from "./response-strategy"

function context(overrides: Partial<StrategyContext>): StrategyContext {
  return {
    thinkingLevel: "deep",
    intent: "analysis",
    activeExperts: [],
    hasNonPriorEvidence: true,
    ...overrides,
  }
}

describe("resolveResponseStrategy", () => {
  test("fast chat resolves to fast:chat", () => {
    const strategy = resolveResponseStrategy(context({ thinkingLevel: "fast", intent: "chat" }))

    expect(strategy.id).toBe("fast:chat")
    expect(strategy.sections).toEqual(["conclusion"])
    expect(strategy.promptHint).toContain("1-2句话")
    expect(strategy.maxTokens).toBe(256)
  })

  test("deep analysis resolves to deep:analysis", () => {
    const strategy = resolveResponseStrategy(context({ intent: "analysis" }))

    expect(strategy.id).toBe("deep:analysis")
    expect(strategy.sections).toEqual(["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"])
  })

  test("deep planning resolves to deep:planning", () => {
    const strategy = resolveResponseStrategy(context({ intent: "planning" }))

    expect(strategy.id).toBe("deep:planning")
    expect(strategy.sections).toContain("action_steps")
    expect(strategy.sections).toContain("timeline")
    expect(strategy.sections).not.toContain("evidence_digest")
  })

  test("deep question resolves to deep:question", () => {
    const strategy = resolveResponseStrategy(context({ intent: "question" }))

    expect(strategy.id).toBe("deep:question")
    expect(strategy.sections).toContain("evidence_digest")
    expect(strategy.sections).not.toContain("reasoning")
    expect(strategy.showEvidenceDigest).toBe(true)
  })

  test("deep unknown intent resolves to deep:fallback", () => {
    const strategy = resolveResponseStrategy(context({ intent: "unknown-intent" }))

    expect(strategy.id).toBe("deep:fallback")
    expect(strategy.sections).toEqual(["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"])
  })

  test("priority desc chooses exact deep strategy before fallback", () => {
    const registry = getResponseStrategyRegistry()
    const analysis = registry.find((descriptor) => descriptor.id === "deep:analysis")
    const fallback = registry.find((descriptor) => descriptor.id === "deep:fallback")
    const ctx = context({ intent: "analysis" })

    expect(analysis?.matches(ctx)).toBe(true)
    expect(fallback?.matches(ctx)).toBe(true)
    expect(analysis?.priority).toBeGreaterThan(fallback?.priority ?? 0)
    expect(resolveResponseStrategy(ctx).id).toBe("deep:analysis")
  })

  test("evidence_digest downgrades when there is no non-prior evidence", () => {
    const strategy = resolveResponseStrategy(context({ intent: "question", hasNonPriorEvidence: false }))

    expect(strategy.id).toBe("deep:question")
    expect(strategy.showEvidenceDigest).toBe(false)
    expect(strategy.sections).toEqual(["conclusion", "evidence"])
  })

  test("activeExperts outputSections merge and deduplicate", () => {
    const strategy = resolveResponseStrategy(context({
      intent: "question",
      activeExperts: [
        { id: "crop", outputSections: ["reasoning", "confidence"] },
        { id: "risk", outputSections: ["confidence", "risk"] },
      ],
    }))

    expect(strategy.sections).toEqual(["conclusion", "evidence_digest", "evidence", "reasoning", "confidence", "risk"])
  })

  test("registry contains exactly eight descriptors", () => {
    expect(getResponseStrategyRegistry().map((descriptor) => descriptor.id)).toEqual([
      "fast:chat",
      "deep:analysis",
      "deep:planning",
      "deep:decision",
      "deep:question",
      "deep:creation",
      "deep:modification",
      "deep:fallback",
    ])
  })
})
