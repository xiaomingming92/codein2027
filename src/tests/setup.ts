import "@testing-library/jest-dom"
import { vi } from "vitest"

// Mock environment variables (only if not already set - allows real env for integration tests)
if (!process.env.CHROMA_HOST) process.env.CHROMA_HOST = "localhost"
if (!process.env.CHROMA_PORT) process.env.CHROMA_PORT = "8000"
if (!process.env.CHROMA_COLLECTION) process.env.CHROMA_COLLECTION = "test_collection"
if (!process.env.EMBEDDING_PROVIDER) process.env.EMBEDDING_PROVIDER = "cloud"
if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = "test-api-key"
if (!process.env.EMBEDDING_BASE_URL) process.env.EMBEDDING_BASE_URL = "http://localhost:11434/v1"
if (!process.env.EMBEDDING_MODEL) process.env.EMBEDDING_MODEL = "test-embedding-model"

// Polyfill for browser APIs required by pdf-parse
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0
    }
  } as unknown as typeof DOMMatrix
}

// Only mock fetch for unit tests, not integration tests
if (!process.env.INTEGRATION_TEST) {
  // Mock Next.js specific globals for unit tests
  globalThis.fetch = vi.fn()
}

// Suppress console errors in tests
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("warn")) {
      return
    }
    originalConsoleError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalConsoleError
})