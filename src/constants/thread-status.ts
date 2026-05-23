export const THREAD_STATUS = {
  IDLE: "idle",
  STREAMING: "streaming",
  WARNING: "warning",
  ERROR: "error",
} as const

export type ThreadStatus = (typeof THREAD_STATUS)[keyof typeof THREAD_STATUS]

export const STATUS_LABELS: Record<ThreadStatus, string> = {
  [THREAD_STATUS.IDLE]: "就绪",
  [THREAD_STATUS.STREAMING]: "思考中...",
  [THREAD_STATUS.WARNING]: "警告",
  [THREAD_STATUS.ERROR]: "出错了",
}

export const TRAFFIC_LIGHT_BG: Record<string, { on: string; off: string }> = {
  red: {
    on: "bg-red-600",
    off: "bg-red-500",
  },
  yellow: {
    on: "bg-yellow-500",
    off: "bg-yellow-500",
  },
  green: {
    on: "bg-green-500",
    off: "bg-green-500",
  },
}

export const TRAFFIC_LIGHT_BORDER: Record<string, string> = {
  red: "border-red-400/30",
  yellow: "border-yellow-400/30",
  green: "border-green-400/30",
}

export const TRAFFIC_LIGHT_GLOW: Record<string, string> = {
  red: "rgba(239,68,68,0.6)",
  yellow: "rgba(234,179,8,0.6)",
  green: "rgba(34,197,94,0.6)",
}

export const TRAFFIC_LIGHT_MAP: ReadonlyArray<{ key: keyof typeof TRAFFIC_LIGHT_BG; isOnStatus: ThreadStatus }> = [
  { key: "red", isOnStatus: THREAD_STATUS.ERROR },
  { key: "yellow", isOnStatus: THREAD_STATUS.WARNING },
  { key: "green", isOnStatus: THREAD_STATUS.IDLE },
] as const

export const MATRIX_RAIN_CHARS = "人机协作中..."

export const MATRIX_RAIN_COLORS: Record<ThreadStatus, string> = {
  [THREAD_STATUS.IDLE]: "#1bab3fff",
  [THREAD_STATUS.STREAMING]: "#00cc33",
  [THREAD_STATUS.WARNING]: "#cc8800",
  [THREAD_STATUS.ERROR]: "#cc0033",
}

export const MATRIX_RAIN_CANVAS_WIDTH = 32
export const MATRIX_RAIN_CANVAS_HEIGHT = 24
export const MATRIX_RAIN_COL_WIDTH = 4
export const MATRIX_RAIN_FONT_SIZE = 6
export const MATRIX_RAIN_IDLE_OPACITY = 0.3
export const MATRIX_RAIN_SPEED = 0.15
export const MATRIX_RAIN_RESET_CHANCE = 0.99
export const MATRIX_RAIN_MAX_DROP_LENGTH = 4

export const MATRIX_RAIN_BG_OPACITY: Record<ThreadStatus, number> = {
  [THREAD_STATUS.IDLE]: 0.25,
  [THREAD_STATUS.STREAMING]: 0.45,
  [THREAD_STATUS.WARNING]: 0.30,
  [THREAD_STATUS.ERROR]: 0.35,
}

export const MATRIX_RAIN_BG_SPEED = 0.06
export const MATRIX_RAIN_BG_FONT_SIZE = 13
export const MATRIX_RAIN_BG_COL_WIDTH = 10
export const MATRIX_RAIN_BG_MAX_DROP_LENGTH = 8
