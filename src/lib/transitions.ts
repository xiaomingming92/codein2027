export type TaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED"

export interface TaskTransition {
  from: TaskStatus
  to: TaskStatus
  allowed: boolean
  reason?: string
}

export const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["BLOCKED", "COMPLETED", "CANCELLED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransition(
  from: TaskStatus,
  to: TaskStatus
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: "状态未变化" }
  }

  const allowedTargets = taskTransitions[from]

  if (allowedTargets.includes(to)) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `不允许从 ${from} 直接转换到 ${to}，可转换的状态为: ${allowedTargets.join(", ") || "无"}`,
  }
}

export interface AbilityResult {
  allowed: boolean
  reason?: string
  suggestions?: string[]
}

export function canCreateTask(): AbilityResult {
  return { allowed: true }
}

export function canUpdateTask(
  currentStatus: TaskStatus,
  userRole: "ROOT" | "STAFF"
): AbilityResult {
  if (userRole === "ROOT") {
    return { allowed: true }
  }

  if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
    return {
      allowed: false,
      reason: "已完成或已取消的任务不允许普通员工修改",
      suggestions: ["联系管理员", "创建新任务"],
    }
  }

  return { allowed: true }
}

export function canDeleteTask(
  currentStatus: TaskStatus,
  userRole: "ROOT" | "STAFF"
): AbilityResult {
  if (userRole === "ROOT") {
    return { allowed: true }
  }

  if (currentStatus === "IN_PROGRESS") {
    return {
      allowed: false,
      reason: "进行中的任务不允许删除",
      suggestions: ["先完成任务或取消任务"],
    }
  }

  return { allowed: true }
}

export function canChangeTaskStatus(
  from: TaskStatus,
  to: TaskStatus,
  userRole: "ROOT" | "STAFF"
): AbilityResult {
  const transition = canTransition(from, to)

  if (!transition.allowed) {
    return {
      allowed: false,
      reason: transition.reason,
      suggestions: getNextAllowedStatuses(from),
    }
  }

  if (userRole !== "ROOT" && to === "COMPLETED") {
    return {
      allowed: false,
      reason: "只有管理员可以将任务标记为完成",
    }
  }

  return { allowed: true }
}

export function getNextAllowedStatuses(
  currentStatus: TaskStatus
): string[] {
  return taskTransitions[currentStatus]
}

export function getTaskStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    PENDING: "bg-gray-100 text-gray-800",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
    BLOCKED: "bg-red-100 text-red-800",
    COMPLETED: "bg-green-100 text-green-800",
    CANCELLED: "bg-gray-100 text-gray-500",
  }
  return colors[status]
}
