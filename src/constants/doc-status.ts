export const DOC_STATUS = {
  PENDING_INDEX: "PENDING_INDEX",
  PENDING: "PENDING",
  INDEXING: "INDEXING",
  INDEXED: "INDEXED",
  OUTDATED: "OUTDATED",
  ERROR: "ERROR",
} as const

export const SOURCE_TYPE = {
  PROJECT_DOC: "PROJECT_DOC",
  KNOWLEDGE_UPDATE: "KNOWLEDGE_UPDATE",
} as const

export const ACTIVE_STATUSES = [
  DOC_STATUS.INDEXED,
  DOC_STATUS.PENDING_INDEX,
  DOC_STATUS.INDEXING,
] as const

export const INDEXABLE_STATUSES = [
  DOC_STATUS.PENDING,
  DOC_STATUS.PENDING_INDEX,
] as const

export const STATUS_FOR_DEDUP_CHECK = [
  DOC_STATUS.PENDING_INDEX,
  DOC_STATUS.INDEXED,
  DOC_STATUS.INDEXING,
] as const

export const STATUS_DISPLAY: Record<string, string> = {
  [DOC_STATUS.PENDING_INDEX]: "pending",
  [DOC_STATUS.PENDING]: "processing",
  PARSING: "processing",
  [DOC_STATUS.INDEXING]: "processing",
  [DOC_STATUS.INDEXED]: "ready",
  [DOC_STATUS.OUTDATED]: "outdated",
  [DOC_STATUS.ERROR]: "error",
}

export type UIStatus = "pending" | "processing" | "ready" | "outdated" | "error"