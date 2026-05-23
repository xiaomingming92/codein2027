import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { indexKnowledgeDocument, type IndexProgress } from "@/services/knowledge-indexer"
import { DOC_STATUS } from "@/constants/doc-status"
import { auditDoc, auditPhaseStart, auditPhaseEnd } from "@/lib/audit-logger"

const PROGRESS_AUDIT_PREFIX = "DOC_PROGRESS"

type ProgressAuditPhase =
  | `${typeof PROGRESS_AUDIT_PREFIX}_START`
  | `${typeof PROGRESS_AUDIT_PREFIX}_DB_QUERY`
  | `${typeof PROGRESS_AUDIT_PREFIX}_FILE_READ`
  | `${typeof PROGRESS_AUDIT_PREFIX}_VECTORIZE`
  | `${typeof PROGRESS_AUDIT_PREFIX}_DONE`
  | `${typeof PROGRESS_AUDIT_PREFIX}_FAIL`

// GET /api/knowledge/documents/:id/progress - SSE 进度推送
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  let docId: string | undefined

  try {
    const { id } = await params
    docId = id

    auditPhaseStart("DOC_PROGRESS_START", `进度查询开始: ${id}`)

    const doc = await prisma.document.findUnique({
      where: { id },
    })

    if (!doc) {
      auditPhaseEnd("DOC_PROGRESS_START", `文档不存在: ${id}`)
      return new Response("data: " + JSON.stringify({ error: "文档不存在" }) + "\n\n", {
        status: 404,
        headers: { "Content-Type": "text/event-stream" },
      })
    }

    auditPhaseEnd("DOC_PROGRESS_START", `文档查询成功: ${doc.name}`)

    // 如果已经向量化完成或失败，直接返回最终状态
    if (doc.status === DOC_STATUS.INDEXED) {
      return new Response(
        "data: " + JSON.stringify({ status: DOC_STATUS.INDEXED, message: "向量化完成", progress: 100 }) + "\n\n",
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      )
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false

        const send = (progress: IndexProgress) => {
          if (streamClosed) return
          try {
            const data = `data: ${JSON.stringify(progress)}\n\n`
            controller.enqueue(encoder.encode(data))
          } catch {
            streamClosed = true
          }
        }

        send({ status: DOC_STATUS.PENDING, message: "准备向量化...", progress: 0 })

        // 如果文档有文件路径，读取文件内容进行向量化
        if (doc.filePath) {
          try {
            auditPhaseStart("DOC_PROGRESS_FILE_READ", `读取文件: ${doc.filePath}`)
            const fs = await import("fs/promises")
            const buffer = await fs.readFile(doc.filePath)
            auditPhaseEnd("DOC_PROGRESS_FILE_READ", `文件读取成功, 大小: ${(buffer.length / 1024).toFixed(2)}KB`)

            auditPhaseStart("DOC_PROGRESS_VECTORIZE", `开始向量化: ${doc.name}`)
            await indexKnowledgeDocument(id, buffer, doc.name, async (progress) => {
              send(progress)
            })
            auditPhaseEnd("DOC_PROGRESS_VECTORIZE", `向量化流程完成`)
          } catch (error) {
            const message = error instanceof Error ? error.message : "读取文件失败"
            auditDoc("DOC_PROGRESS_FAIL", doc.name, id, `错误: ${message}`, {
              duration_ms: Date.now() - startTime,
              phase: "FILE_READ_OR_VECTORIZE",
            })
            send({ status: DOC_STATUS.ERROR, message })
          }
        } else {
          auditDoc("DOC_PROGRESS_FAIL", doc.name, id, `文件路径不存在`, {
            duration_ms: Date.now() - startTime,
          })
          send({ status: DOC_STATUS.ERROR, message: "文件路径不存在" })
        }

        if (!streamClosed) {
          try { controller.close() } catch { /* already closed */ }
        }
      },
    })

    auditPhaseStart("DOC_PROGRESS_DONE", `SSE 流创建完成, 总耗时: ${Date.now() - startTime}ms`)

    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })

    auditPhaseEnd("DOC_PROGRESS_DONE", `SSE 流已返回给客户端`)

    return response
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const totalTime = Date.now() - startTime

    auditDoc("DOC_PROGRESS_FAIL", "unknown", docId || "unknown", `未捕获异常: ${errorMsg}`, {
      duration_ms: totalTime,
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined,
    })

    console.error(`[PROGRESS-AUDIT] [${new Date().toISOString()}] [DOC_PROGRESS_FAIL] 进度查询失败: ${errorMsg} | {"duration_ms":${totalTime},"docId":"${docId}","error":"${errorMsg}"}`)

    return new Response(
      "data: " + JSON.stringify({
        status: DOC_STATUS.ERROR,
        message: "服务器内部错误，请稍后重试",
        error: process.env.NODE_ENV === "development" ? errorMsg : undefined,
      }) + "\n\n",
      {
        status: 500,
        headers: { "Content-Type": "text/event-stream" },
      }
    )
  }
}
