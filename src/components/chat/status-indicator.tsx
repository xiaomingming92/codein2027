"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  TRAFFIC_LIGHT_BG,
  TRAFFIC_LIGHT_BORDER,
  TRAFFIC_LIGHT_GLOW,
  TRAFFIC_LIGHT_MAP,
  STATUS_LABELS,
  THREAD_STATUS,
  MATRIX_RAIN_CHARS,
  MATRIX_RAIN_COLORS,
  MATRIX_RAIN_CANVAS_WIDTH,
  MATRIX_RAIN_CANVAS_HEIGHT,
  MATRIX_RAIN_COL_WIDTH,
  MATRIX_RAIN_FONT_SIZE,
  MATRIX_RAIN_IDLE_OPACITY,
  MATRIX_RAIN_SPEED,
  MATRIX_RAIN_RESET_CHANCE,
  MATRIX_RAIN_MAX_DROP_LENGTH,
  MATRIX_RAIN_BG_OPACITY,
  MATRIX_RAIN_BG_SPEED,
  MATRIX_RAIN_BG_FONT_SIZE,
  MATRIX_RAIN_BG_COL_WIDTH,
  MATRIX_RAIN_BG_MAX_DROP_LENGTH,
} from "@/constants/thread-status"
import type { ThreadStatus } from "@/constants/thread-status"

interface StatusIndicatorProps {
  status: ThreadStatus
}

function TrafficLight({ status }: { status: ThreadStatus }) {
  return (
    <div className="flex items-center gap-[3px] overflow-visible">
      {TRAFFIC_LIGHT_MAP.map(({ key, isOnStatus }) => {
        const isOn = status === isOnStatus
        const bgCls = isOn
          ? TRAFFIC_LIGHT_BG[key].on
          : TRAFFIC_LIGHT_BG[key].off
        return (
          <div
            key={key}
            className={cn(
              "w-2 h-2 rounded-full border transition-all duration-300 overflow-visible",
              bgCls,
              TRAFFIC_LIGHT_BORDER[key]
            )}
            style={isOn ? { boxShadow: `0 0 6px 3px ${TRAFFIC_LIGHT_GLOW[key]}` } : undefined}
          />
        )
      })}
    </div>
  )
}

type Drop = {
  y: number
  length: number
  chars: string[]
}

function randomChar(): string {
  return MATRIX_RAIN_CHARS[Math.floor(Math.random() * MATRIX_RAIN_CHARS.length)]
}

function initDrop(): Drop {
  const length = Math.floor(Math.random() * MATRIX_RAIN_MAX_DROP_LENGTH) + 1
  const chars = Array.from({ length }, () => randomChar())
  const totalRows = MATRIX_RAIN_CANVAS_HEIGHT / MATRIX_RAIN_FONT_SIZE
  return {
    y: Math.floor(Math.random() * (totalRows + length)) - length,
    length,
    chars,
  }
}

function morphDrop(drop: Drop): void {
  for (let i = 0; i < drop.chars.length; i++) {
    drop.chars[i] = randomChar()
  }
}

function MatrixRain({ status }: { status: ThreadStatus }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const animRef = React.useRef<number>(0)
  const dropsRef = React.useRef<Drop[]>([])

  const isStreaming = status === THREAD_STATUS.STREAMING
  const color = MATRIX_RAIN_COLORS[status]

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = MATRIX_RAIN_CANVAS_WIDTH * devicePixelRatio
    canvas.height = MATRIX_RAIN_CANVAS_HEIGHT * devicePixelRatio
    ctx.scale(devicePixelRatio, devicePixelRatio)

    const colCount = Math.floor(MATRIX_RAIN_CANVAS_WIDTH / MATRIX_RAIN_COL_WIDTH)

    if (dropsRef.current.length !== colCount) {
      dropsRef.current = Array.from({ length: colCount }, () => initDrop())
    }

    const draw = () => {
      ctx.clearRect(0, 0, MATRIX_RAIN_CANVAS_WIDTH, MATRIX_RAIN_CANVAS_HEIGHT)

      if (!isStreaming) {
        for (let i = 0; i < colCount; i++) {
          const drop = dropsRef.current[i]
          const x = i * MATRIX_RAIN_COL_WIDTH
          for (let j = 0; j < drop.chars.length; j++) {
            const py = drop.y + j
            const screenY = py * MATRIX_RAIN_FONT_SIZE
            if (screenY < -MATRIX_RAIN_FONT_SIZE || screenY > MATRIX_RAIN_CANVAS_HEIGHT) continue
            ctx.fillStyle = color
            ctx.globalAlpha = MATRIX_RAIN_IDLE_OPACITY
            ctx.fillText(drop.chars[j], x, screenY)
          }
        }
        return
      }

      for (let i = 0; i < colCount; i++) {
        const drop = dropsRef.current[i]
        const x = i * MATRIX_RAIN_COL_WIDTH

        morphDrop(drop)

        for (let j = 0; j < drop.chars.length; j++) {
          const py = drop.y + j
          const screenY = py * MATRIX_RAIN_FONT_SIZE
          if (screenY < -MATRIX_RAIN_FONT_SIZE || screenY > MATRIX_RAIN_CANVAS_HEIGHT) continue

          const t = j / drop.chars.length
          ctx.fillStyle = color
          ctx.globalAlpha = 0.3 + 0.7 * t
          ctx.fillText(drop.chars[j], x, screenY)
        }

        drop.y += MATRIX_RAIN_SPEED

        if (drop.y * MATRIX_RAIN_FONT_SIZE > MATRIX_RAIN_CANVAS_HEIGHT + drop.chars.length * MATRIX_RAIN_FONT_SIZE) {
          if (Math.random() > MATRIX_RAIN_RESET_CHANCE) {
            dropsRef.current[i] = initDrop()
          }
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    requestAnimationFrame(() => draw())

    return () => {
      cancelAnimationFrame(animRef.current)
    }
  }, [isStreaming, color])

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{
        width: MATRIX_RAIN_CANVAS_WIDTH,
        height: MATRIX_RAIN_CANVAS_HEIGHT,
      }}
    />
  )
}

function StatusLabel({ status }: { status: ThreadStatus }) {
  const colorCls = cn(
    "text-xs transition-colors duration-300",
    status === THREAD_STATUS.IDLE && "text-green-600 dark:text-green-400",
    status === THREAD_STATUS.STREAMING && "text-blue-600 dark:text-blue-400",
    status === THREAD_STATUS.WARNING && "text-yellow-600 dark:text-yellow-400",
    status === THREAD_STATUS.ERROR && "text-red-600 dark:text-red-400",
  )

  return <span className={colorCls}>{STATUS_LABELS[status]}</span>
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <TrafficLight status={status} />
      {/* <MatrixRain status={status} /> */}
      <StatusLabel status={status} />
    </div>
  )
}

type BgDrop = {
  x: number
  y: number
  length: number
  speed: number
  chars: string[]
}

function createBgDrop(x: number, canvasHeight: number): BgDrop {
  const length = Math.floor(Math.random() * MATRIX_RAIN_BG_MAX_DROP_LENGTH) + 2
  const chars = Array.from({ length }, () => randomChar())
  const totalRows = canvasHeight / MATRIX_RAIN_BG_FONT_SIZE
  return {
    x,
    y: Math.floor(Math.random() * (totalRows + length)) - length,
    length,
    speed: MATRIX_RAIN_BG_SPEED + Math.random() * 0.06,
    chars,
  }
}

function morphBgDrop(drop: BgDrop, charPool?: string[]): void {
  for (let i = 0; i < drop.chars.length; i++) {
    if (Math.random() > 0.3) continue
    if (charPool && charPool.length > 0) {
      drop.chars[i] = charPool[Math.floor(Math.random() * charPool.length)]
    } else {
      drop.chars[i] = randomChar()
    }
  }
}

export function MatrixRainBackground({ status, charPool }: { status: ThreadStatus; charPool?: string[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const animRef = React.useRef<number>(0)
  const dropsRef = React.useRef<BgDrop[]>([])
  const sizeRef = React.useRef({ width: 0, height: 0 })
  const charPoolRef = React.useRef(charPool)

  React.useEffect(() => {
    charPoolRef.current = charPool
  }, [charPool])

  const isStreaming = status === THREAD_STATUS.STREAMING
  const color = MATRIX_RAIN_COLORS[status]
  const baseOpacity = MATRIX_RAIN_BG_OPACITY[status]

  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1

    const initSize = () => {
      const rect = container.getBoundingClientRect()
      const width = rect.width
      const height = rect.height
      sizeRef.current = { width, height }
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const colCount = Math.floor(width / MATRIX_RAIN_BG_COL_WIDTH)
      dropsRef.current = Array.from({ length: colCount }, (_, i) =>
        createBgDrop(i * MATRIX_RAIN_BG_COL_WIDTH, height)
      )
    }

    initSize()

    const resizeObserver = new ResizeObserver(() => {
      initSize()
      draw()
    })

    resizeObserver.observe(container)

    const draw = () => {
      const { width, height } = sizeRef.current
      if (width === 0 || height === 0) return

      if (!isStreaming) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        return
      }

      if (dropsRef.current.length === 0) {
        const colCount = Math.floor(width / MATRIX_RAIN_BG_COL_WIDTH)
        dropsRef.current = Array.from({ length: colCount }, (_, i) =>
          createBgDrop(i * MATRIX_RAIN_BG_COL_WIDTH, height)
        )
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < dropsRef.current.length; i++) {
        const drop = dropsRef.current[i]

        morphBgDrop(drop, charPoolRef.current)

        for (let j = 0; j < drop.chars.length; j++) {
          const screenY = (drop.y + j) * MATRIX_RAIN_BG_FONT_SIZE
          if (screenY < -MATRIX_RAIN_BG_FONT_SIZE || screenY > height) continue

          const t = j / drop.chars.length
          ctx.fillStyle = color
          ctx.globalAlpha = baseOpacity * (0.2 + 0.8 * t)
          ctx.font = `bold ${MATRIX_RAIN_BG_FONT_SIZE}px monospace`
          ctx.fillText(drop.chars[j], drop.x, screenY)
        }

        drop.y += drop.speed

        if (drop.y * MATRIX_RAIN_BG_FONT_SIZE > height + drop.chars.length * MATRIX_RAIN_BG_FONT_SIZE) {
          if (Math.random() > MATRIX_RAIN_RESET_CHANCE) {
            dropsRef.current[i] = createBgDrop(drop.x, height)
          }
        }
      }

      animRef.current = requestAnimationFrame(draw)
    }

    requestAnimationFrame(() => draw())

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(animRef.current)
    }
  }, [isStreaming, color, baseOpacity])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 0, display: isStreaming ? undefined : "none" }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
