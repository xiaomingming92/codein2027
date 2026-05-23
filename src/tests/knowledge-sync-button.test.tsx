import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { KnowledgeBasePanel } from "@/components/knowledge/knowledge-base-panel"

const createMockSSEStream = (events: object[]): ReadableStream => {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        const data = `data: ${JSON.stringify(events[index])}\n\n`
        controller.enqueue(new TextEncoder().encode(data))
        index++
      } else {
        controller.close()
      }
    },
  })
}

describe("KnowledgeBasePanel - 同步知识库按钮测试", () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    const defaultMockResponse = {
      success: true,
      data: [],
      total: 0,
    }

    const defaultSyncStatsResponse = {
      success: true,
      data: {
        total: 0,
        indexed: 0,
        pending: 0,
        indexing: 0,
        errors: 0,
        bySource: { projectDoc: 0, knowledgeUpdate: 0 },
      },
    }

    mockFetch = vi.fn((url: string, options?: RequestInit) => {
      if (url === "/api/knowledge/documents" && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(defaultMockResponse),
        })
      }
      if (url === "/api/knowledge/sync" && (!options || options.method === "GET" || !options.method)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(defaultSyncStatsResponse),
        })
      }
      if (url === "/api/knowledge/sync" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/event-stream" }),
          body: createMockSSEStream([
            { type: "start", message: "开始同步..." },
            { type: "progress", message: "扫描中...", progress: 50 },
            { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
          ]),
        })
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("按钮渲染", () => {
    it("应该渲染同步知识库按钮", async () => {
      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })
      expect(syncButton).toBeInTheDocument()
    })

    it("按钮初始状态应该启用", async () => {
      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })
      expect(syncButton).not.toBeDisabled()
    })
  })

  describe("按钮点击行为", () => {
    it("点击按钮后应调用同步API", async () => {
      let callCount = 0
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          callCount++
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/knowledge/sync", expect.objectContaining({ method: "POST" }))
      }, { timeout: 3000 })
    })

    it("点击按钮后按钮应变为禁用状态", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "progress", message: "扫描中...", progress: 50 },
              { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      expect(syncButton).toBeDisabled()
    })

    it("点击按钮后应显示进度条", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "progress", message: "扫描中...", progress: 50 },
              { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(() => {
        const progressBar = screen.getByRole("progressbar")
        expect(progressBar).toBeInTheDocument()
      }, { timeout: 3000 })
    })

    it("同步完成后按钮应恢复启用状态", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(syncButton).not.toBeDisabled()
        },
        { timeout: 5000 }
      )
    })
  })

  describe("进度更新", () => {
    it("应显示正确的进度消息", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步知识库..." },
              { type: "progress", message: "正在扫描文件系统...", progress: 25 },
              { type: "progress", message: "发现 3 个新文件", progress: 50 },
              { type: "progress", message: "正在向量化...", progress: 75 },
              { type: "complete", success: true, added: 3, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(screen.getByText(/同步完成/)).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it("应显示同步完成的统计信息", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "complete", success: true, added: 3, updated: 2, deleted: 1, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(screen.getByText(/新增 3/)).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })
  })

  describe("错误处理", () => {
    it("同步失败时应显示错误消息", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "error", message: "同步失败: 数据库连接错误" },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(screen.getByText(/同步失败/)).toBeInTheDocument()
        },
        { timeout: 3000 }
      )
    })

    it("同步失败后按钮应恢复启用状态", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "error", message: "同步失败" },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(syncButton).not.toBeDisabled()
        },
        { timeout: 3000 }
      )
    })
  })

  describe("数据刷新", () => {
    it("同步完成后应刷新文档列表", async () => {
      let documentsFetchCount = 0

      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "complete", success: true, added: 1, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        if (url === "/api/knowledge/documents") {
          documentsFetchCount++
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                data: documentsFetchCount === 1 ? [] : [{ id: "1", name: "测试文档.md", type: "text/markdown", size: 1024, sourceType: "PROJECT_DOC", status: "ready", uploadedAt: new Date().toISOString() }],
                total: documentsFetchCount === 1 ? 0 : 1,
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(screen.getByText("测试文档.md")).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })

    it("同步完成后应刷新统计数据", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "complete", success: true, added: 5, updated: 2, deleted: 0, unchanged: 3 },
            ]),
          })
        }
        if (url === "/api/knowledge/sync") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                data: {
                  total: 10,
                  indexed: 5,
                  pending: 3,
                  indexing: 0,
                  errors: 2,
                  bySource: { projectDoc: 7, knowledgeUpdate: 3 },
                },
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(
        () => {
          expect(screen.getByText(/5 已索引/)).toBeInTheDocument()
        },
        { timeout: 5000 }
      )
    })
  })

  describe("按钮状态切换", () => {
    it("同步中按钮应该包含旋转图标", async () => {
      mockFetch.mockImplementation((url: string, options?: RequestInit) => {
        if (url === "/api/knowledge/sync" && options?.method === "POST") {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "text/event-stream" }),
            body: createMockSSEStream([
              { type: "start", message: "开始同步..." },
              { type: "progress", message: "处理中...", progress: 50 },
              { type: "complete", success: true, added: 0, updated: 0, deleted: 0, unchanged: 0 },
            ]),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: [], total: 0 }),
        })
      })

      await act(async () => {
        render(<KnowledgeBasePanel />)
      })

      const syncButton = screen.getByRole("button", { name: /同步知识库/i })

      await act(async () => {
        fireEvent.click(syncButton)
      })

      await waitFor(() => {
        const loaderIcon = screen.getByRole("button", { name: /同步中/i })
        expect(loaderIcon).toBeInTheDocument()
      }, { timeout: 3000 })
    })
  })
})
