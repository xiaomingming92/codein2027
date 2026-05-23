import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { vi as vitest } from "vitest"

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const { mockAddDocuments, mockDelete, mockSimilaritySearchWithScore, MockChroma } = vitest.hoisted(() => {
  const mockAddDocuments = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn().mockResolvedValue(undefined)
  const mockSimilaritySearchWithScore = vi.fn().mockResolvedValue([])

  const MockChroma = vi.fn().mockImplementation(() => ({
    addDocuments: mockAddDocuments,
    delete: mockDelete,
    similaritySearchWithScore: mockSimilaritySearchWithScore,
  }))

  return {
    mockAddDocuments,
    mockDelete,
    mockSimilaritySearchWithScore,
    MockChroma,
  }
})

const { MockEmbeddings, mockEmbedQuery, mockEmbedDocuments } = vitest.hoisted(() => {
  const mockEmbedQuery = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
  const mockEmbedDocuments = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]])

  const MockEmbeddings = vi.fn().mockImplementation(() => ({
    embedQuery: mockEmbedQuery,
    embedDocuments: mockEmbedDocuments,
  }))

  return {
    MockEmbeddings,
    mockEmbedQuery,
    mockEmbedDocuments,
  }
})

const { mockDocumentUpdate, mockDocumentCreate, mockDocumentFindMany, mockDocumentDelete } = vitest.hoisted(() => ({
  mockDocumentUpdate: vi.fn().mockResolvedValue({}),
  mockDocumentCreate: vi.fn().mockResolvedValue({}),
  mockDocumentFindMany: vi.fn().mockResolvedValue([]),
  mockDocumentDelete: vi.fn().mockResolvedValue({}),
}))

// Set up mocks
vi.mock("@langchain/community/vectorstores/chroma", () => ({
  Chroma: MockChroma,
}))

vi.mock("@/lib/embeddings", () => ({
  getEmbeddings: () => new MockEmbeddings(),
  getEmbeddingConfig: () => ({
    provider: "cloud",
    apiKey: "test-key",
    baseURL: "http://test.com",
    model: "test-model",
  }),
  getEmbeddingProviderType: () => "cloud" as const,
  resetEmbeddings: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: mockDocumentFindMany,
      create: mockDocumentCreate,
      update: mockDocumentUpdate,
      delete: mockDocumentDelete,
    },
  },
}))

vi.mock("@/services/document-parser", () => ({
  parseDocumentFromBuffer: vi.fn(),
}))

// Import after mocks are set up
import { indexKnowledgeDocument, deleteKnowledgeVectors, searchKnowledgeDocuments } from "@/services/knowledge-indexer"
import { getEmbeddings, getEmbeddingConfig, getEmbeddingProviderType, resetEmbeddings } from "@/lib/embeddings"
import { parseDocumentFromBuffer } from "@/services/document-parser"
import { DOC_STATUS, SOURCE_TYPE } from "@/constants/doc-status"

describe("KnowledgeIndexer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("indexKnowledgeDocument", () => {
    it("should successfully index a text document with progress callbacks", async () => {
      const mockBuffer = Buffer.from("这是一个测试文档内容")
      const mockParsed = {
        content: "这是一个测试文档内容",
        metadata: { type: "text" },
      }

      vi.mocked(parseDocumentFromBuffer).mockResolvedValue(mockParsed)
      mockDocumentUpdate.mockResolvedValue({} as never)

      const progressCalls: Array<{ status: string; message: string; progress?: number }> = []
      
      const result = await indexKnowledgeDocument(
        "test-doc-id",
        mockBuffer,
        "test.txt",
        (progress) => {
          progressCalls.push(progress)
        }
      )

      expect(result.success).toBe(true)
      expect(result.vectorIds).toBeDefined()
      expect(result.vectorIds?.length).toBe(1)
      expect(progressCalls.length).toBeGreaterThan(0)

      // Verify progress flow
      const statuses = progressCalls.map((p) => p.status)
      expect(statuses).toContain("PARSING")
      expect(statuses).toContain("INDEXING")
      expect(statuses).toContain("INDEXED")

      // Verify final progress is 100%
      const finalProgress = progressCalls[progressCalls.length - 1]
      expect(finalProgress.progress).toBe(100)

      // Verify chroma.addDocuments was called
      expect(mockAddDocuments).toHaveBeenCalledTimes(1)
    })

    it("should split long documents into multiple chunks", async () => {
      const longContent = "这是一个很长的测试文档。".repeat(200)
      const mockBuffer = Buffer.from(longContent)
      const mockParsed = {
        content: longContent,
        metadata: { type: "text" },
      }

      vi.mocked(parseDocumentFromBuffer).mockResolvedValue(mockParsed)
      mockDocumentUpdate.mockResolvedValue({} as never)

      const result = await indexKnowledgeDocument(
        "test-long-doc-id",
        mockBuffer,
        "long-test.txt"
      )

      expect(result.success).toBe(true)
      expect(result.vectorIds?.length).toBeGreaterThan(1)
    })

    it("should handle empty document content gracefully", async () => {
      const mockBuffer = Buffer.from("")
      const mockParsed = {
        content: "",
        metadata: { type: "text" },
      }

      vi.mocked(parseDocumentFromBuffer).mockResolvedValue(mockParsed)
      mockDocumentUpdate.mockResolvedValue({} as never)

      const result = await indexKnowledgeDocument(
        "empty-doc-id",
        mockBuffer,
        "empty.txt"
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain("文档内容为空")
    })

    it("should handle parsing errors and update status to PENDING", async () => {
      const mockBuffer = Buffer.from("content")

      vi.mocked(parseDocumentFromBuffer).mockRejectedValue(new Error("解析失败"))
      mockDocumentUpdate.mockResolvedValue({} as never)

      const result = await indexKnowledgeDocument(
        "error-doc-id",
        mockBuffer,
        "error.txt"
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe("解析失败")

      // Verify status was set back to PENDING on error
      expect(mockDocumentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "PENDING",
          }),
        })
      )
    })

    it("should track token usage and timing information via console logs", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const mockBuffer = Buffer.from("测试token追踪")
      const mockParsed = {
        content: "测试token追踪",
        metadata: { type: "text" },
      }

      vi.mocked(parseDocumentFromBuffer).mockResolvedValue(mockParsed)
      mockDocumentUpdate.mockResolvedValue({} as never)

      await indexKnowledgeDocument("token-test-id", mockBuffer, "token.txt")

      // Verify logging includes token information
      const logCalls = consoleSpy.mock.calls.map((call) => call[0] as string)
      const hasTokenLog = logCalls.some((log) => log.includes("token"))
      expect(hasTokenLog).toBe(true)

      consoleSpy.mockRestore()
    })

    it("should call onProgress with correct status sequence", async () => {
      const mockBuffer = Buffer.from("测试进度回调")
      const mockParsed = {
        content: "测试进度回调",
        metadata: { type: "text" },
      }

      vi.mocked(parseDocumentFromBuffer).mockResolvedValue(mockParsed)
      mockDocumentUpdate.mockResolvedValue({} as never)

      const progressCalls: Array<{ status: string; message: string; progress?: number }> = []
      
      await indexKnowledgeDocument(
        "progress-test-id",
        mockBuffer,
        "progress-test.txt",
        (progress) => {
          progressCalls.push(progress)
        }
      )

      // Verify the sequence of statuses
      expect(progressCalls[0].status).toBe("PARSING")
      expect(progressCalls[progressCalls.length - 1].status).toBe("INDEXED")

      // Verify progress is monotonically increasing
      for (let i = 1; i < progressCalls.length; i++) {
        if (progressCalls[i].progress && progressCalls[i - 1].progress) {
          expect(progressCalls[i].progress).toBeGreaterThanOrEqual(progressCalls[i - 1].progress)
        }
      }
    })
  })

  describe("deleteKnowledgeVectors", () => {
    it("should return true for empty vectorIds array", async () => {
      const result = await deleteKnowledgeVectors([])
      expect(result).toBe(true)
    })

    it("should call chroma.delete with correct vectorIds", async () => {
      const vectorIds = ["vec-1", "vec-2", "vec-3"]
      
      const result = await deleteKnowledgeVectors(vectorIds)
      
      expect(result).toBe(true)
      expect(mockDelete).toHaveBeenCalledWith({ ids: vectorIds })
    })

    it("should handle chroma deletion errors gracefully", async () => {
      mockDelete.mockRejectedValueOnce(new Error("Deletion failed"))

      const result = await deleteKnowledgeVectors(["vec-1"])
      
      expect(result).toBe(false)
    })
  })

  describe("searchKnowledgeDocuments", () => {
    it("should return empty array when no results found", async () => {
      const results = await searchKnowledgeDocuments("test query")
      expect(results).toEqual([])
    })

    it("should call similaritySearchWithScore with correct parameters", async () => {
      await searchKnowledgeDocuments("test query", 10)

      expect(mockSimilaritySearchWithScore).toHaveBeenCalledWith(
        "test query",
        10,
        expect.objectContaining({
          sourceType: SOURCE_TYPE.KNOWLEDGE_UPDATE,
        })
      )
    })

    it("should handle search errors gracefully", async () => {
      mockSimilaritySearchWithScore.mockRejectedValueOnce(new Error("Search failed"))

      const results = await searchKnowledgeDocuments("test query")
      
      expect(results).toEqual([])
    })
  })
})

describe("EmbeddingProvider", () => {
  beforeEach(() => {
    resetEmbeddings()
  })

  describe("getEmbeddingProviderType", () => {
    it("should return 'cloud' by default", () => {
      const originalEnv = process.env.EMBEDDING_PROVIDER
      process.env.EMBEDDING_PROVIDER = undefined
      
      const providerType = getEmbeddingProviderType()
      expect(providerType).toBe("cloud")
      
      process.env.EMBEDDING_PROVIDER = originalEnv
    })

    it("should return 'ollama' when configured", () => {
      const originalEnv = process.env.EMBEDDING_PROVIDER
      process.env.EMBEDDING_PROVIDER = "ollama"
      
      const providerType = getEmbeddingProviderType()
      expect(providerType).toBe("ollama")
      
      process.env.EMBEDDING_PROVIDER = originalEnv
    })
  })

  describe("getEmbeddingConfig", () => {
    it("should return cloud config with correct structure", () => {
      const config = getEmbeddingConfig()
      
      expect(config.provider).toBe("cloud")
      if (config.provider === "cloud") {
        expect(config).toHaveProperty("apiKey")
        expect(config).toHaveProperty("baseURL")
        expect(config).toHaveProperty("model")
      }
    })
  })

  describe("getEmbeddings", () => {
    it("should return embeddings instance with required methods", () => {
      const embeddings = getEmbeddings()
      
      expect(embeddings).toBeDefined()
      expect(typeof embeddings.embedQuery).toBe("function")
      expect(typeof embeddings.embedDocuments).toBe("function")
    })

    it("should return singleton instance on multiple calls", () => {
      const instance1 = getEmbeddings()
      const instance2 = getEmbeddings()
      
      expect(instance1).toBe(instance2)
    })
  })
})

describe("DocumentParser", () => {
  describe("parseDocumentFromBuffer", () => {
    it("should parse text files correctly", async () => {
      const buffer = Buffer.from("Hello, World!", "utf-8")
      const result = await parseDocumentFromBuffer(buffer, "test.txt")
      
      expect(result.content).toBe("Hello, World!")
      expect(result.metadata.type).toBe("text")
    })

    it("should parse markdown files correctly", async () => {
      const markdownContent = "# Title\n\nThis is **markdown** content."
      const buffer = Buffer.from(markdownContent, "utf-8")
      const result = await parseDocumentFromBuffer(buffer, "test.md")
      
      expect(result.content).toContain("# Title")
      expect(result.metadata.type).toBe("markdown")
    })

    it("should throw error for unsupported file types", async () => {
      const buffer = Buffer.from("some content")
      await expect(parseDocumentFromBuffer(buffer, "test.exe")).rejects.toThrow()
    })
  })
})

describe("Constants", () => {
  describe("DOC_STATUS", () => {
    it("should contain all required status values", () => {
      expect(DOC_STATUS.PENDING_INDEX).toBe("PENDING_INDEX")
      expect(DOC_STATUS.PENDING).toBe("PENDING")
      expect(DOC_STATUS.INDEXING).toBe("INDEXING")
      expect(DOC_STATUS.INDEXED).toBe("INDEXED")
      expect(DOC_STATUS.OUTDATED).toBe("OUTDATED")
      expect(DOC_STATUS.ERROR).toBe("ERROR")
    })

    it("should have exactly 6 status values", () => {
      expect(Object.keys(DOC_STATUS)).toHaveLength(6)
    })
  })

  describe("SOURCE_TYPE", () => {
    it("should contain all required source types", () => {
      expect(SOURCE_TYPE.PROJECT_DOC).toBe("PROJECT_DOC")
      expect(SOURCE_TYPE.KNOWLEDGE_UPDATE).toBe("KNOWLEDGE_UPDATE")
    })

    it("should have exactly 2 source types", () => {
      expect(Object.keys(SOURCE_TYPE)).toHaveLength(2)
    })
  })
})