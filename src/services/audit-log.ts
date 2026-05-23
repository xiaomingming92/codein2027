export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ACCESS"
  | "LOGIN"
  | "LOGOUT"
  | "VECTORIZE"
  | "CHAT"
  | "VERDICT"

export type TargetType =
  | "User"
  | "Project"
  | "Task"
  | "Document"
  | "Verdict"
  | "Milestone"

export interface AuditLogEntry {
  id: string
  userId: string
  action: AuditAction
  targetType: TargetType
  targetId: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  reason?: string
  ip?: string
  userAgent?: string
  createdAt: string
}

const auditLogs: AuditLogEntry[] = []

export async function createAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void> {
  const log: AuditLogEntry = {
    id: crypto.randomUUID(),
    ...entry,
    createdAt: new Date().toISOString(),
  }

  auditLogs.push(log)

  if (process.env.NODE_ENV === "development") {
    console.log("[AuditLog]", JSON.stringify(log, null, 2))
  }
}

export async function getAuditLogs(filters?: {
  userId?: string
  action?: AuditAction
  targetType?: TargetType
  targetId?: string
  startDate?: string
  endDate?: string
}): Promise<AuditLogEntry[]> {
  let filtered = [...auditLogs]

  if (filters?.userId) {
    filtered = filtered.filter((log) => log.userId === filters.userId)
  }

  if (filters?.action) {
    filtered = filtered.filter((log) => log.action === filters.action)
  }

  if (filters?.targetType) {
    filtered = filtered.filter((log) => log.targetType === filters.targetType)
  }

  if (filters?.targetId) {
    filtered = filtered.filter((log) => log.targetId === filters.targetId)
  }

  if (filters?.startDate) {
    const start = new Date(filters.startDate)
    filtered = filtered.filter((log) => new Date(log.createdAt) >= start)
  }

  if (filters?.endDate) {
    const end = new Date(filters.endDate)
    filtered = filtered.filter((log) => new Date(log.createdAt) <= end)
  }

  return filtered.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function getAuditLogsByTarget(
  targetType: TargetType,
  targetId: string
): Promise<AuditLogEntry[]> {
  return auditLogs
    .filter((log) => log.targetType === targetType && log.targetId === targetId)
    .sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
}
