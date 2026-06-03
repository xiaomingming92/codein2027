/**
 * CacheTtlStats — 语义缓存 TTL 自主学习服务
 *
 * 回路一：缓存过期后重新运行 LLM，对比新旧置信度：
 *   - 相同（±5%）→ TTL 上调 20%（不超过 maxTtl = defaultTtl × 10）
 *   - 不同       → TTL 不变或下调 20%（不低于 minTtl = 60s）
 *
 * 触发条件：同一 intent 累积 ≥ 3 次过期事件
 * 数据持久化到 logs/cache-ttl-stats.json，重启后恢复，删除文件即回退初始常量
 */
import * as fs from "fs/promises"
import * as path from "path"

// ===== 类型定义 =====

export interface TtlStats {
  hitCount: number
  missCount: number
  expiredCount: number
  reconfirmedCount: number
  divergedCount: number
  adaptedTtl: number
  lastAdjustedAt: string | null
}

interface PersistedStats {
  updatedAt: string
  intents: Record<string, TtlStats>
}

// ===== 常量 =====

const CONFIDENCE_MARGIN = 5        // ±5% 视为结论一致
const TTL_ADJUST_FACTOR_UP = 1.2   // 上调 20%
const TTL_ADJUST_FACTOR_DOWN = 0.8 // 下调 20%
const MIN_EXPIRY_EVENTS = 3        // 至少 3 次过期事件才触发调整
const MIN_TTL = 60                 // 最小 TTL（秒）
const MAX_TTL_MULTIPLIER = 10      // maxTtl = defaultTtl × 10

const LOG_DIR = path.join(process.cwd(), "logs")
const STATS_FILE = "cache-ttl-stats.json"

// ===== 动态 TTL 表 =====

/**
 * 初始 TTL 常量（来自 semantic-cache.ts），作为自适应基线和回退值。
 * 运行中通过 adaptCacheTtl() 改写，持久化到文件后在重启时恢复。
 */
const DEFAULT_TTL: Record<string, number> = {
  chat: 3600,
  question: 1800,
  analysis: 300,
  planning: 600,
  decision: 600,
  creation: 300,
  modification: 300,
}

let _adaptedTtl: Record<string, number> = { ...DEFAULT_TTL }
let _stats: Record<string, TtlStats> = {}

function getDefaultTtl(intent: string): number {
  return DEFAULT_TTL[intent] ?? 300
}

function getOrCreateStats(intent: string): TtlStats {
  if (!_stats[intent]) {
    _stats[intent] = {
      hitCount: 0,
      missCount: 0,
      expiredCount: 0,
      reconfirmedCount: 0,
      divergedCount: 0,
      adaptedTtl: getDefaultTtl(intent),
      lastAdjustedAt: null,
    }
  }
  return _stats[intent]
}

// ===== 读写自适应 TTL =====

export function getAdaptedTtl(intent: string): number {
  return _adaptedTtl[intent] ?? getDefaultTtl(intent)
}

export function getAllAdaptedTtl(): Readonly<Record<string, number>> {
  return { ..._adaptedTtl }
}

// ===== 记录缓存事件 =====

export function recordCacheHit(intent: string): void {
  const stats = getOrCreateStats(intent)
  stats.hitCount += 1
}

export function recordCacheMiss(intent: string): void {
  const stats = getOrCreateStats(intent)
  stats.missCount += 1
}

export function recordCacheExpiry(
  intent: string,
  oldConfidence: number,
  newConfidence: number,
): void {
  const stats = getOrCreateStats(intent)
  stats.expiredCount += 1

  const diff = Math.abs(oldConfidence - newConfidence)
  if (diff <= CONFIDENCE_MARGIN) {
    stats.reconfirmedCount += 1
  } else {
    stats.divergedCount += 1
  }
}

// ===== TTL 自适应调整 =====

export function adaptCacheTtl(intent: string): number {
  const stats = getOrCreateStats(intent)
  const defaultTtl = getDefaultTtl(intent)
  const maxTtl = defaultTtl * MAX_TTL_MULTIPLIER

  // 触发条件：至少 MIN_EXPIRY_EVENTS 次过期事件
  if (stats.expiredCount < MIN_EXPIRY_EVENTS) {
    return stats.adaptedTtl
  }

  const currentTtl = _adaptedTtl[intent] ?? defaultTtl

  if (stats.reconfirmedCount > stats.divergedCount) {
    // 多数过期后结论一致 → 上调 TTL
    const newTtl = Math.round(currentTtl * TTL_ADJUST_FACTOR_UP)
    _adaptedTtl[intent] = Math.min(newTtl, maxTtl)
    stats.adaptedTtl = _adaptedTtl[intent]
    stats.lastAdjustedAt = new Date().toISOString()
  } else if (stats.divergedCount > stats.reconfirmedCount) {
    // 多数过期后结论不一致 → 下调 TTL
    const newTtl = Math.round(currentTtl * TTL_ADJUST_FACTOR_DOWN)
    _adaptedTtl[intent] = Math.max(newTtl, MIN_TTL)
    stats.adaptedTtl = _adaptedTtl[intent]
    stats.lastAdjustedAt = new Date().toISOString()
  }
  // 相等则不变

  // 调整后异步持久化
  persistStats()

  return _adaptedTtl[intent]
}

// ===== 持久化 =====

async function persistStats(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
    const data: PersistedStats = {
      updatedAt: new Date().toISOString(),
      intents: _stats,
    }
    const filePath = path.join(LOG_DIR, STATS_FILE)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
  } catch {
    // 持久化失败不影响主流程
  }
}

export async function loadStats(): Promise<void> {
  const filePath = path.join(LOG_DIR, STATS_FILE)

  let raw: string
  try {
    raw = await fs.readFile(filePath, "utf-8")
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOENT") {
      // 首次运行，无持久化数据，使用默认 TTL
      return
    }
    // EACCES 等非预期错误：打日志但不阻塞
    console.warn("[TTL-ADAPT] Cannot read stats file:", (err as Error).message)
    return
  }

  try {
    const data: PersistedStats = JSON.parse(raw)

    if (data && data.intents) {
      _stats = data.intents

      for (const [intent, stats] of Object.entries(_stats)) {
        _adaptedTtl[intent] = stats.adaptedTtl
      }
    }
  } catch {
    console.warn("[TTL-ADAPT] Stats file corrupted, using defaults:", filePath)
  }
}

export function getTtlStats(): Readonly<Record<string, TtlStats>> {
  return { ..._stats }
}

/** 重置统计（用于测试和回滚） */
export function resetStats(): void {
  _stats = {}
  _adaptedTtl = { ...DEFAULT_TTL }
}
