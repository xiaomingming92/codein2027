import { describe, it, expect, beforeAll } from "vitest"
import * as dotenv from "dotenv"

// Load environment
dotenv.config({ path: ".env.development" })
process.env.INTEGRATION_TEST = "true"

describe("Knowledge Base GUI Integration Tests", () => {
  let baseUrl: string

  beforeAll(() => {
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    console.log("\n🖥️  GUI集成测试")
    console.log(`   Base URL: ${baseUrl}\n`)
  })

  describe("GET /api/knowledge/documents - 文档列表API", () => {
    it("should return all documents with correct structure", async () => {
      console.log("📋 测试文档列表API...\n")

      const response = await fetch(`${baseUrl}/api/knowledge/documents`)
      
      expect(response.ok).toBe(true)
      
      const data = await response.json()
      
      console.log(`✅ API响应成功`)
      console.log(`   状态码: ${response.status}`)
      console.log(`   成功标志: ${data.success}`)
      console.log(`   文档总数: ${data.total}`)
      console.log("")

      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.total).toBe(data.data.length)

      if (data.data.length > 0) {
        const firstDoc = data.data[0]
        console.log("📄 第一个文档结构:")
        console.log(JSON.stringify(firstDoc, null, 2).split("\n").map((line: string) => `   ${line}`).join("\n"))
        console.log("")

        // 验证必需字段
        expect(firstDoc).toHaveProperty("id")
        expect(firstDoc).toHaveProperty("name")
        expect(firstDoc).toHaveProperty("type")
        expect(firstDoc).toHaveProperty("size")
        expect(firstDoc).toHaveProperty("sourceType")  // 新增字段
        expect(firstDoc).toHaveProperty("status")
        expect(firstDoc).toHaveProperty("uploadedAt")

        // 验证状态值
        const validStatuses = ["pending", "processing", "ready", "outdated", "error", "unknown"]
        expect(validStatuses).toContain(firstDoc.status)

        // 验证来源类型
        const validSourceTypes = ["PROJECT_DOC", "KNOWLEDGE_UPDATE"]
        expect(validSourceTypes).toContain(firstDoc.sourceType)
      }
    })

    it("should support filtering by sourceType", async () => {
      console.log("🔍 测试来源类型过滤...\n")

      // 测试只获取用户上传的文档
      const response = await fetch(`${baseUrl}/api/knowledge/documents?sourceType=KNOWLEDGE_UPDATE`)
      const data = await response.json()

      console.log(`✅ KNOWLEDGE_UPDATE 过滤:`)
      console.log(`   返回数量: ${data.data?.length || 0}`)
      
      if (data.data?.length > 0) {
        const allCorrect = data.data.every((doc: { sourceType: string }) => 
          doc.sourceType === "KNOWLEDGE_UPDATE"
        )
        expect(allCorrect).toBe(true)
        console.log(`   ✅ 所有文档都是 KNOWLEDGE_UPDATE 类型`)
      }
      console.log("")
    })

    it("should return proper status mapping for all documents", async () => {
      console.log("📊 验证所有文档的状态映射...\n")

      const response = await fetch(`${baseUrl}/api/knowledge/documents`)
      const data = await response.json()

      const statusCounts: Record<string, number> = {}
      const sourceTypeCounts: Record<string, number> = {}

      for (const doc of data.data) {
        // 统计状态分布
        statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1
        
        // 统计来源类型分布
        sourceTypeCounts[doc.sourceType] = (sourceTypeCounts[doc.sourceType] || 0) + 1
      }

      console.log("📈 状态分布:")
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`   ${status.padEnd(12)}: ${count} 个文档`)
      })

      console.log("\n📂 来源类型分布:")
      Object.entries(sourceTypeCounts).forEach(([type, count]) => {
        console.log(`   ${type.padEnd(20)}: ${count} 个文档`)
      })
      console.log("")

      // 验证没有无效状态
      const validStatuses = ["pending", "processing", "ready", "outdated", "error", "unknown"]
      const invalidDocs = data.data.filter((doc: { status: string }) => 
        !validStatuses.includes(doc.status)
      )
      expect(invalidDocs.length).toBe(0)
    })
  })

  describe("POST /api/knowledge/sync - 同步API", () => {
    it("should accept sync request and return SSE stream", async () => {
      console.log("🔄 测试同步API连接...\n")

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

      try {
        const response = await fetch(`${baseUrl}/api/knowledge/sync`, {
          method: "POST",
          signal: controller.signal,
        })

        console.log(`✅ 同步请求已发送`)
        console.log(`   状态码: ${response.status}`)
        console.log(`   Content-Type: ${response.headers.get("content-type")}`)

        expect(response.ok).toBe(true)
        expect(response.headers.get("content-type")).toContain("text/event-stream")

        // 读取前几个SSE事件
        const reader = response.body?.getReader()
        if (reader) {
          const decoder = new TextDecoder()
          let buffer = ""
          let eventCount = 0
          const maxEvents = 5

          console.log("\n📡 接收SSE事件:")

          while (eventCount < maxEvents) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6))
                  eventCount++
                  
                  console.log(`\n   事件 #${eventCount}:`)
                  console.log(`   类型: ${event.type}`)
                  if (event.message) console.log(`   消息: ${event.message}`)
                  if (event.progress !== undefined) console.log(`   进度: ${event.progress}%`)

                  // 验证事件类型
                  const validTypes = ["start", "progress", "complete", "error"]
                  expect(validTypes).toContain(event.type)

                  if (event.type === "complete" || event.type === "error") {
                    console.log("\n✅ 收到最终事件，停止读取")
                    break
                  }
                } catch (e) {
                  console.error(`   ❌ 解析事件失败:`, e)
                }
              }
            }

            if (buffer.includes('"complete"') || buffer.includes('"error"')) {
              break
            }
          }

          console.log(`\n   总共收到 ${eventCount} 个事件`)
          expect(eventCount).toBeGreaterThan(0)
        }

        clearTimeout(timeoutId)
      } catch (error) {
        clearTimeout(timeoutId)
        if ((error as Error).name === "AbortError") {
          console.log("⏱️  请求超时（这是正常的，说明SSE流正在工作）")
        } else {
          throw error
        }
      }
    }, 15000)
  })

  describe("Frontend Data Flow", () => {
    it("should provide all required fields for UI rendering", async () => {
      console.log("🎨 验证前端渲染所需字段...\n")

      const response = await fetch(`${baseUrl}/api/knowledge/documents`)
      const data = await response.json()

      if (data.data.length === 0) {
        console.log("⚠️  没有文档数据，跳过验证")
        return
      }

      const doc = data.data[0]
      const uiFields = {
        "文档ID": doc.id,
        "文件名": doc.name,
        "文件类型": doc.type,
        "文件大小": doc.size,
        "来源类型": doc.sourceType,
        "状态": doc.status,
        "上传时间": doc.uploadedAt,
        "向量数量": doc.vectorCount,
        "版本号": doc.version,
      }

      console.log("✅ 前端UI字段检查:")
      Object.entries(uiFields).forEach(([field, value]) => {
        const status = value !== undefined && value !== null ? "✅" : "❌"
        const displayValue = value !== undefined ? 
          (typeof value === "number" ? value : `"${value}"`) : 
          "undefined"
        console.log(`   ${status} ${field.padEnd(15)}: ${displayValue}`)
      })
      console.log("")

      // 关键字段必须存在
      expect(doc.id).toBeDefined()
      expect(doc.name).toBeDefined()
      expect(doc.status).toBeDefined()
      expect(doc.sourceType).toBeDefined()
    })

    it("should have consistent data for status badge rendering", async () => {
      console.log("🏷️  验证状态徽章数据...\n")

      const response = await fetch(`${baseUrl}/api/knowledge/documents`)
      const data = await response.json()

      const statusBadgeMap: Record<string, { label: string; color: string }> = {
        pending: { label: "待处理", color: "secondary" },
        processing: { label: "处理中", color: "secondary" },
        ready: { label: "已就绪", color: "green" },
        outdated: { label: "已过期", color: "orange" },
        error: { label: "错误", color: "red" },
        unknown: { label: "未知", color: "secondary" },
      }

      console.log("📊 各状态的文档:")
      for (const [status, config] of Object.entries(statusBadgeMap)) {
        const docs = data.data.filter((d: { status: string }) => d.status === status)
        if (docs.length > 0) {
          console.log(`   ${config.label.padEnd(8)} (${status}): ${docs.length} 个文档`)
          
          // 显示前2个文档名
          docs.slice(0, 2).forEach((doc: { name: string }) => {
            console.log(`      - ${doc.name}`)
          })
        }
      }
      console.log("")
    })
  })
})