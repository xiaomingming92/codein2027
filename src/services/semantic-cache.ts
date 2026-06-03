/**
 * SemanticCache — 语义级 Agent 响应缓存
 *
 * 三层淘汰策略：
 *   Layer 1 — Generation-based: 知识库版本号比对，惰性淘汰知识库变更前的缓存
 *   Layer 2 — TTL-based: 按意图分档的时间过期
 *   Layer 3 — LRU: 内存容量保护（MAX_CACHE_SIZE=200）
 *
 * 缓存键：三元组（normalizedQuery + intent + activeExperts）
 * kbGeneration 不进 key，作为 CacheEntry 出生版本号在 get() 中惰性比对
 */
import * as crypto from "crypto"
import { recordCacheHit, recordCacheMiss } from "@/services/cache-ttl-stats"

// ===== 类型定义 =====

export interface CacheKey {
  normalizedQueryHash: string
  intentHash: string
  activeExpertsHash: string
  compositeKey: string
  intent: string
}

export interface CacheEntry {
  responseContent: string
  displayContent: Record<string, unknown>
  createdAt: number
  ttl: number
  hitCount: number
  sourceTraceId: string
  kbGeneration: number
  intent: string
  confidence?: number
}

export interface CacheStats {
  size: number
  maxSize: number
  hitCount: number
  missCount: number
  evictedByGeneration: number
  evictedByTTL: number
  evictedByLRU: number
}

// ===== 常量 =====

const MAX_CACHE_SIZE = 200

const CACHE_TTL: Record<string, number> = {
  chat: 3600,
  question: 1800,
  analysis: 300,
  planning: 600,
  decision: 600,
  creation: 300,
  modification: 300,
}

const DEFAULT_TTL = 300

function getTTL(intent: string): number {
  return CACHE_TTL[intent] ?? DEFAULT_TTL
}

// ===== 全局 kbGeneration =====

let _kbGeneration = 1

export function getKbGeneration(): number {
  return _kbGeneration
}

export function bumpKbGeneration(): number {
  _kbGeneration += 1
  return _kbGeneration
}

// ===== 查询文本标准化 =====

const PUNCTUATION_RE =
  /[，。！？、；：""''（）《》【】〈〉「」『』、,.!?;:;"'`()\[\]{}<>]/g

export function normalizeQuery(text: string): string {
  return text
    .replace(PUNCTUATION_RE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

// ===== Hash 辅助 =====

function sha256First(text: string, chars: number): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, chars)
}

// ===== 缓存键构建 =====

export function buildCacheKey(
  normalizedQuery: string,
  intent: string,
  activeExperts: string[],
): CacheKey {
  const normalizedQueryHash = sha256First(normalizeQuery(normalizedQuery), 16)
  const intentHash = sha256First(intent, 8)
  const activeExpertsHash = sha256First(
    [...activeExperts].sort().join(","),
    8,
  )
  const compositeKey = `${normalizedQueryHash}:${intentHash}:${activeExpertsHash}`

  return {
    normalizedQueryHash,
    intentHash,
    activeExpertsHash,
    compositeKey,
    intent,
  }
}

// ===== SemanticCache 类 =====

export class SemanticCache {
  private store = new Map<string, CacheEntry>()
  private stats: CacheStats = {
    size: 0,
    maxSize: MAX_CACHE_SIZE,
    hitCount: 0,
    missCount: 0,
    evictedByGeneration: 0,
    evictedByTTL: 0,
    evictedByLRU: 0,
  }
  /** TTL 过期时暂存条目，供调用方获取旧置信度后消费 */
  private lastExpiredEntry: CacheEntry | null = null

  get(key: CacheKey): CacheEntry | null {
    const entry = this.store.get(key.compositeKey)

    if (!entry) {
      this.stats.missCount += 1
      recordCacheMiss(key.intent)
      return null
    }

    // Layer 1: Generation-based 淘汰
    if (entry.kbGeneration < getKbGeneration()) {
      this.store.delete(key.compositeKey)
      this.stats.size = this.store.size
      this.stats.evictedByGeneration += 1
      this.stats.missCount += 1
      recordCacheMiss(key.intent)
      return null
    }

    // Layer 2: TTL-based 淘汰（回路一接入点：保存过期条目置信度）
    if (Date.now() - entry.createdAt > entry.ttl * 1000) {
      this.store.delete(key.compositeKey)
      this.stats.size = this.store.size
      this.stats.evictedByTTL += 1
      this.stats.missCount += 1
      this.lastExpiredEntry = { ...entry }
      recordCacheMiss(key.intent)
      return null
    }

    // 命中
    entry.hitCount += 1
    this.stats.hitCount += 1
    recordCacheHit(entry.intent)
    return entry
  }

  /**
   * 消费最近一次 TTL 过期条目的置信度。
   * 调用一次后清空（幂等消费），避免旧数据污染后续请求。
   */
  popExpiredEntry(): CacheEntry | null {
    const entry = this.lastExpiredEntry
    this.lastExpiredEntry = null
    return entry
  }

  set(key: CacheKey, entry: Omit<CacheEntry, "hitCount" | "kbGeneration">): void {
    // Layer 3: LRU 淘汰
    if (this.store.size >= MAX_CACHE_SIZE) {
      this.evictOldest()
    }

    // 检查已存在（同一 key 覆盖）
    const existed = this.store.has(key.compositeKey)

    const fullEntry: CacheEntry = {
      ...entry,
      hitCount: 0,
      kbGeneration: getKbGeneration(),
    }

    this.store.set(key.compositeKey, fullEntry)
    if (!existed) {
      this.stats.size = this.store.size
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [k, v] of this.store) {
      if (v.createdAt < oldestTime) {
        oldestTime = v.createdAt
        oldestKey = k
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey)
      this.stats.size = this.store.size
      this.stats.evictedByLRU += 1
    }
  }

  invalidate(pattern: RegExp): number {
    let count = 0
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key)
        count += 1
      }
    }
    this.stats.size = this.store.size
    return count
  }

  getStats(): CacheStats {
    return { ...this.stats, size: this.store.size }
  }

  /** 子包可见：根据 compositeKey 直接删除（用于 kbGeneration 淘汰等场景） */
  _internalDelete(key: string): boolean {
    const result = this.store.delete(key)
    if (result) {
      this.stats.size = this.store.size
    }
    return result
  }
}

// ===== 模块级单例 =====

export const semanticCache = new SemanticCache()
