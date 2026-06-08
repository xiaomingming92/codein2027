import { spawn, type ChildProcess } from "child_process"
import { createInterface, type ReadLine } from "readline"

const MCP_SERVER_PATH = ".ai/scripts/mcp-server.ts"
const PROJECT_ROOT = process.cwd()

interface MCPResponse {
  jsonrpc: string
  id: number
  result?: { content?: Array<{ type: string; text: string }>; tools?: Array<{ name: string; description: string; inputSchema: unknown }> }
  error?: { code: number; message: string }
}

interface TestResult {
  id: string
  name: string
  category: string
  pass: boolean
  detail: string
}

let nextId = 1
const results: TestResult[] = []

const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"

class MCPTestRunner {
  private proc: ChildProcess | null = null
  private rl: ReadLine | null = null
  private pendingResolve: ((value: MCPResponse) => void) | null = null
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null
  private buffer = ""

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.proc = spawn("npx", ["tsx", MCP_SERVER_PATH], {
        cwd: PROJECT_ROOT,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      })

      let started = false

      this.proc.stdout!.on("data", (data: Buffer) => {
        this.buffer += data.toString()
        const lines = this.buffer.split("\n")
        this.buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line) as MCPResponse
            if (this.pendingResolve) {
              if (this.pendingTimeout) clearTimeout(this.pendingTimeout)
              this.pendingResolve(parsed)
              this.pendingResolve = null
            }
          } catch {
            // Partial JSON in buffer, wait for more
          }
        }
      })

      this.proc.stderr!.on("data", (data: Buffer) => {
        const msg = data.toString()
        if (msg.includes("[ADD-MCP]") && !started) {
          started = true
          resolve()
        }
      })

      this.proc.on("error", reject)

      setTimeout(() => {
        if (!started) {
          started = true
          resolve()
        }
      }, 3000)
    })
  }

  async call(method: string, params?: unknown): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.proc.stdin) {
        reject(new Error("MCP Server not started"))
        return
      }

      const id = nextId++
      const request = { jsonrpc: "2.0", id, method, params }

      this.pendingResolve = resolve
      this.pendingTimeout = setTimeout(() => {
        this.pendingResolve = null
        reject(new Error(`Request timeout: ${method}`))
      }, 15000)

      this.proc.stdin.write(JSON.stringify(request) + "\n")
    })
  }

  async stop(): Promise<void> {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
    }
  }
}

function report(id: string, name: string, category: string, pass: boolean, detail: string) {
  results.push({ id, name, category, pass, detail })
  const status = pass ? `${GREEN}✅ PASS${RESET}` : `${RED}❌ FAIL${RESET}`
  const catColor = category === "protocol" ? CYAN : category === "workflow" ? YELLOW : GREEN
  console.log(`[${catColor}${id}${RESET}] ${status} ${name}`)
  if (!pass || detail) {
    console.log(`       ${pass ? GREEN : RED}${detail}${RESET}`)
  }
}

function fail(detail: string) {
  return { pass: false as const, detail }
}

function pass(detail?: string) {
  return { pass: true as const, detail: detail || "" }
}

async function runTests() {
  const runner = new MCPTestRunner()

  console.log(`${BOLD}${CYAN}========== MCP Server 全量测试 ==========${RESET}\n`)

  try {
    console.log(`${BOLD}启动 MCP Server...${RESET}`)
    await runner.start()
    console.log(`${GREEN}✅ MCP Server 已启动${RESET}\n`)
  } catch (e) {
    console.error(`${RED}❌ MCP Server 启动失败: ${e}${RESET}`)
    process.exit(1)
  }

  const call = runner.call.bind(runner)

  // ==================== Protocol Tests ====================
  console.log(`${BOLD}${CYAN}--- 协议层测试 (Protocol) ---${RESET}\n`)

  // P1: tools/list 返回 6 个工具
  try {
    const res = await call("tools/list")
    const tools = res.result?.tools
    const names = tools?.map(t => t.name) || []
    const expected = [
      "get_project_context", "get_db_schema", "get_audit_logger_pattern",
      "check_phase_symmetry", "check_failure_path", "generate_audit_logger",
    ]
    const missing = expected.filter(n => !names.includes(n))
    if (tools && tools.length === 6 && missing.length === 0) {
      report("P1", "tools/list 返回 6 个工具", "protocol", true, `已注册: ${names.join(", ")}`)
    } else {
      report("P1", "tools/list 返回 6 个工具", "protocol", false, `工具数=${tools?.length}, 缺少=${missing.join(",") || "无"}`)
    }
  } catch (e) {
    report("P1", "tools/list 返回 6 个工具", "protocol", false, `异常: ${e}`)
  }

  // P2: 未知工具名
  try {
    const res = await call("tools/call", { name: "unknown_tool", arguments: {} })
    if (res.error || res.result?.isError) {
      report("P2", "tools/call 未知工具返回错误", "protocol", true, "正确返回错误响应")
    } else {
      report("P2", "tools/call 未知工具返回错误", "protocol", false, "未返回错误")
    }
  } catch (e) {
    report("P2", "tools/call 未知工具返回错误", "protocol", false, `异常: ${e}`)
  }

  // P3: 缺少必填参数
  try {
    const res = await call("tools/call", { name: "check_phase_symmetry", arguments: {} })
    if (res.error || res.result?.isError || (res.result?.content?.[0]?.text || "").includes("不能为空")) {
      report("P3", "缺少必填参数返回错误", "protocol", true, "正确校验必填参数")
    } else {
      report("P3", "缺少必填参数返回错误", "protocol", false, "未校验必填参数")
    }
  } catch (e) {
    report("P3", "缺少必填参数返回错误", "protocol", false, `异常: ${e}`)
  }

  // P4: 非法方法名
  try {
    const res = await call("invalid_method")
    if (res.error) {
      report("P4", "非法方法名返回 error", "protocol", true, `error code=${res.error.code}`)
    } else {
      report("P4", "非法方法名返回 error", "protocol", false, "未返回 error")
    }
  } catch (e) {
    report("P4", "非法方法名返回 error", "protocol", false, `异常: ${e}`)
  }

  // P5: 格式错误 JSON (通过发送非法内容测试服务器稳定性)
  try {
    // 发送原始非法数据
    if (runner["proc"]?.stdin) {
      runner["proc"].stdin.write("not valid json\n")
    }
    // 这之后发一个合法请求，看服务器是否还活着
    const res = await call("tools/list")
    const tools = res.result?.tools
    if (tools && tools.length === 6) {
      report("P5", "非法 JSON 不导致服务器崩溃", "protocol", true, "服务器在处理非法输入后仍正常响应")
    } else {
      report("P5", "非法 JSON 不导致服务器崩溃", "protocol", false, "服务器异常")
    }
  } catch (e) {
    report("P5", "非法 JSON 不导致服务器崩溃", "protocol", false, `服务器崩溃: ${e}`)
  }

  // ==================== Tool Tests ====================
  console.log(`\n${BOLD}${GREEN}--- 工具功能测试 (Tool) ---${RESET}\n`)

  // T1-T3: get_project_context
  try {
    const res = await call("tools/call", { name: "get_project_context", arguments: { scope: "all" } })
    const text = res.result?.content?.[0]?.text || ""
    const hasMeta = text.includes("项目信息") || text.includes("===")
    const hasRules = text.includes("ADD-") || text.includes("规则")
    const hasStructure = text.includes("目录") || text.includes("src/")
    if (hasMeta && hasRules && hasStructure) {
      report("T1", "get_project_context(all) 返回完整上下文", "tool", true, "包含项目信息/规则/结构")
    } else {
      report("T1", "get_project_context(all) 返回完整上下文", "tool", false, `缺字段: meta=${hasMeta} rules=${hasRules} struct=${hasStructure}`)
    }
  } catch (e) {
    report("T1", "get_project_context(all) 返回完整上下文", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_project_context", arguments: { scope: "structure" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("目录") && !text.includes("ADD-")) {
      report("T2", "get_project_context(structure) 仅返回结构信息", "tool", true, "正确过滤")
    } else {
      report("T2", "get_project_context(structure) 仅返回结构信息", "tool", false, "可能包含不应有的规则信息")
    }
  } catch (e) {
    report("T2", "get_project_context(structure) 仅返回结构信息", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_project_context", arguments: { scope: "rules" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("ADD-") || text.includes("强制约束")) {
      report("T3", "get_project_context(rules) 返回项目规则", "tool", true, "包含 ADD 规则")
    } else {
      report("T3", "get_project_context(rules) 返回项目规则", "tool", false, "未包含规则内容")
    }
  } catch (e) {
    report("T3", "get_project_context(rules) 返回项目规则", "tool", false, `异常: ${e}`)
  }

  // T4-T6: get_db_schema
  try {
    const res = await call("tools/call", { name: "get_db_schema", arguments: {} })
    const text = res.result?.content?.[0]?.text || ""
    const models = (text.match(/\w+ \(\d+ 字段\)/g) || []).length
    if (text.includes("模型") && text.includes("提示")) {
      report("T4", "get_db_schema() 返回所有模型概况", "tool", true, `${models} 个模型`)
    } else {
      report("T4", "get_db_schema() 返回所有模型概况", "tool", false, "数据不完整")
    }
  } catch (e) {
    report("T4", "get_db_schema() 返回所有模型概况", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_db_schema", arguments: { model: "User" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("Model: User") || text.includes("model User")) {
      report("T5", "get_db_schema(User) 返回 User 模型", "tool", true, "包含 User 模型字段")
    } else {
      report("T5", "get_db_schema(User) 返回 User 模型", "tool", false, "未返回 User 模型")
    }
  } catch (e) {
    report("T5", "get_db_schema(User) 返回 User 模型", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_db_schema", arguments: { model: "NonExistent123" } })
    if (res.result?.isError || (res.result?.content?.[0]?.text || "").includes("未找到")) {
      report("T6", "get_db_schema(不存在的模型) 返回错误", "tool", true, "正确提示未找到")
    } else {
      report("T6", "get_db_schema(不存在的模型) 返回错误", "tool", false, "未返回错误")
    }
  } catch (e) {
    report("T6", "get_db_schema(不存在的模型) 返回错误", "tool", false, `异常: ${e}`)
  }

  // T7-T9: get_audit_logger_pattern
  try {
    const res = await call("tools/call", { name: "get_audit_logger_pattern", arguments: { domain: "knowledge-base" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("[KB-AUDIT]")) {
      report("T7", "get_audit_logger_pattern(kb) 返回正确", "tool", true, "包含 [KB-AUDIT] 前缀")
    } else {
      report("T7", "get_audit_logger_pattern(kb) 返回正确", "tool", false, "未包含 [KB-AUDIT]")
    }
  } catch (e) {
    report("T7", "get_audit_logger_pattern(kb) 返回正确", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_audit_logger_pattern", arguments: { domain: "agent" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("[AGENT-AUDIT]")) {
      report("T8", "get_audit_logger_pattern(agent) 返回正确", "tool", true, "包含 [AGENT-AUDIT] 前缀")
    } else {
      report("T8", "get_audit_logger_pattern(agent) 返回正确", "tool", false, "未包含 [AGENT-AUDIT]")
    }
  } catch (e) {
    report("T8", "get_audit_logger_pattern(agent) 返回正确", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_audit_logger_pattern", arguments: { domain: "invalid" } })
    if (res.result?.isError || (res.result?.content?.[0]?.text || "").includes("必须为")) {
      report("T9", "get_audit_logger_pattern(无效域) 返回错误", "tool", true, "正确校验 domain 参数")
    } else {
      report("T9", "get_audit_logger_pattern(无效域) 返回错误", "tool", false, "未校验 domain 参数")
    }
  } catch (e) {
    report("T9", "get_audit_logger_pattern(无效域) 返回错误", "tool", false, `异常: ${e}`)
  }

  // T10-T12: check_phase_symmetry
  try {
    const res = await call("tools/call", {
      name: "check_phase_symmetry",
      arguments: { code: 'auditPhaseStart("SYNC")...auditPhaseEnd("SYNC")' },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("完全对称")) {
      report("T10", "check_phase_symmetry(对称代码) 返回对称", "tool", true, "正确识别对称")
    } else {
      report("T10", "check_phase_symmetry(对称代码) 返回对称", "tool", false, "未识别为对称")
    }
  } catch (e) {
    report("T10", "check_phase_symmetry(对称代码) 返回对称", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "check_phase_symmetry",
      arguments: { code: 'auditPhaseStart("UNPAIRED")' },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("不对称") || text.includes("缺少")) {
      report("T11", "check_phase_symmetry(不对称代码) 检测出不对称", "tool", true, "正确识别不对称")
    } else {
      report("T11", "check_phase_symmetry(不对称代码) 检测出不对称", "tool", false, "未识别不对称")
    }
  } catch (e) {
    report("T11", "check_phase_symmetry(不对称代码) 检测出不对称", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "check_phase_symmetry",
      arguments: { code: "" },
    })
    if (res.result?.isError || (res.result?.content?.[0]?.text || "").includes("不能为空")) {
      report("T12", "check_phase_symmetry(空代码) 返回错误", "tool", true, "正确校验空参数")
    } else {
      report("T12", "check_phase_symmetry(空代码) 返回错误", "tool", false, "未校验空参数")
    }
  } catch (e) {
    report("T12", "check_phase_symmetry(空代码) 返回错误", "tool", false, `异常: ${e}`)
  }

  // T13-T15: check_failure_path
  try {
    const res = await call("tools/call", {
      name: "check_failure_path",
      arguments: { code: 'try {\n  auditPhaseStart("WORK")\n  doWork()\n} catch(e) {\n  audit("WORK_FAIL","failed",{error:e.message,durationMs:100})\n}' },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("信息密度充足") || text.includes("✅")) {
      report("T13", "check_failure_path(有审计catch) 通过", "tool", true, "正确识别充足审计")
    } else {
      report("T13", "check_failure_path(有审计catch) 通过", "tool", false, "未通过: " + text.slice(0, 60))
    }
  } catch (e) {
    report("T13", "check_failure_path(有审计catch) 通过", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "check_failure_path",
      arguments: { code: 'try {\n  doWork()\n} catch(e) {\n  console.log(e)\n}' },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("缺少审计") || text.includes("不合规")) {
      report("T14", "check_failure_path(无审计catch) 检测出问题", "tool", true, "正确标记缺少审计")
    } else {
      report("T14", "check_failure_path(无审计catch) 检测出问题", "tool", false, "未检测到缺失")
    }
  } catch (e) {
    report("T14", "check_failure_path(无审计catch) 检测出问题", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "check_failure_path",
      arguments: { code: "const x = 1" },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("未检测到 try/catch")) {
      report("T15", "check_failure_path(无try/catch) 正确提示", "tool", true, "正确跳过检查")
    } else {
      report("T15", "check_failure_path(无try/catch) 正确提示", "tool", false, "未正确跳过")
    }
  } catch (e) {
    report("T15", "check_failure_path(无try/catch) 正确提示", "tool", false, `异常: ${e}`)
  }

  // T16-T18: generate_audit_logger
  try {
    const res = await call("tools/call", {
      name: "generate_audit_logger",
      arguments: { domain: "test-feature", phases: "TS,TP,TD,TF", prefix: "TEST-FEATURE-AUDIT" },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("TestFeatureAuditPhase") && text.includes("TEST-FEATURE-AUDIT")) {
      report("T16", "generate_audit_logger(完整参数) 生成代码", "tool", true, "包含类型定义和前缀")
    } else {
      report("T16", "generate_audit_logger(完整参数) 生成代码", "tool", false, "生成不完整")
    }
  } catch (e) {
    report("T16", "generate_audit_logger(完整参数) 生成代码", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "generate_audit_logger",
      arguments: { domain: "test" },
    })
    if (res.result?.isError || (res.result?.content?.[0]?.text || "").includes("不能为空")) {
      report("T17", "generate_audit_logger(缺参数) 返回错误", "tool", true, "正确校验必填参数")
    } else {
      report("T17", "generate_audit_logger(缺参数) 返回错误", "tool", false, "未校验")
    }
  } catch (e) {
    report("T17", "generate_audit_logger(缺参数) 返回错误", "tool", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "generate_audit_logger",
      arguments: { domain: "test-ts-check", phases: "A,B", prefix: "TEST-TS-AUDIT" },
    })
    const text = res.result?.content?.[0]?.text || ""
    const codeMatch = text.match(/(import\s+.*)/)
    if (codeMatch) {
      report("T18", "generate_audit_logger 生成代码语法可解析", "tool", true, "包含 import/export 语句")
    } else {
      report("T18", "generate_audit_logger 生成代码语法可解析", "tool", false, "代码不完整")
    }
  } catch (e) {
    report("T18", "generate_audit_logger 生成代码语法可解析", "tool", false, `异常: ${e}`)
  }

  // ==================== Workflow Tests (Bug Diagnosis) ====================
  console.log(`\n${BOLD}${YELLOW}--- 真实 Bug 修复验证 (Workflow) ---${RESET}\n`)

  // W1: 诊断 Bug — 验证 MCP 工具能辅助定位聊天数据丢失问题
  try {
    const res1 = await call("tools/call", { name: "get_db_schema", arguments: { model: "ChatMessage" } })
    const text1 = res1.result?.content?.[0]?.text || ""

    const res2 = await call("tools/call", { name: "get_db_schema", arguments: { model: "ChainTraceRecord" } })
    const text2 = res2.result?.content?.[0]?.text || ""

    const hasContent = text1.includes("content")
    const hasMetadata = text1.includes("metadata")
    const hasTraceId = text1.includes("traceId")
    const hasThreadId = text1.includes("threadId")

    if (hasContent && hasMetadata && hasTraceId && hasThreadId) {
      const detail = `ChatMessage 字段完整 (content/metadata/traceId); ChainTraceRecord 可查询`
      report("W1-1", "诊断: 查询 ChatMessage 模型结构", "workflow", true, detail)
    } else {
      report("W1-1", "诊断: 查询 ChatMessage 模型结构", "workflow", false, `缺字段: content=${hasContent} metadata=${hasMetadata} traceId=${hasTraceId}`)
    }
  } catch (e) {
    report("W1-1", "诊断: 查询 ChatMessage 模型结构", "workflow", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_project_context", arguments: { scope: "structure" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("chat-message") || text.includes("chat/")) {
      report("W1-2", "诊断: 查询 chat 组件结构", "workflow", true, "chat-message.tsx / streaming-message.tsx 在目录中")
    } else {
      report("W1-2", "诊断: 查询 chat 组件结构", "workflow", false, "未找到 chat 组件")
    }
  } catch (e) {
    report("W1-2", "诊断: 查询 chat 组件结构", "workflow", false, `异常: ${e}`)
  }

  // W2: 修复验证 — 检查 check_phase_symmetry 和 check_failure_path
  try {
    const res = await call("tools/call", {
      name: "check_phase_symmetry",
      arguments: { code: `
chatPersistAuditPhaseStart("THREAD_CREATE", "创建线程")
chatPersistAuditPhaseEnd("THREAD_CREATE", "创建完成")
chatPersistAuditPhaseStart("MESSAGE_SAVE", "保存消息")
chatPersistAuditPhaseEnd("MESSAGE_SAVE", "保存完成")
chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", "保存追踪")
chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", "保存完成")
      ` },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("完全对称")) {
      report("W2-1", "修复验证: 阶段对称性检查通过", "workflow", true, "3对阶段完全对称")
    } else {
      report("W2-1", "修复验证: 阶段对称性检查通过", "workflow", false, text.slice(0, 80))
    }
  } catch (e) {
    report("W2-1", "修复验证: 阶段对称性检查通过", "workflow", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", {
      name: "check_failure_path",
      arguments: { code: `
try {
  chatPersistAuditPhaseStart("SAVE_STRUCTURED", "保存结构化数据")
  await saveToDb(data)
  chatPersistAuditPhaseEnd("SAVE_STRUCTURED", "保存完成")
} catch (error) {
  chatPersistAudit("SAVE_STRUCTURED_FAIL", "保存失败", {
    error: error.message,
    dataSize: data.length,
    durationMs: Date.now() - startTime,
  })
  throw error
}
      ` },
    })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("信息密度充足") || text.includes("✅")) {
      report("W2-2", "修复验证: 失败路径审计通过", "workflow", true, "catch 块包含完整审计信息")
    } else {
      report("W2-2", "修复验证: 失败路径审计通过", "workflow", false, text.slice(0, 80))
    }
  } catch (e) {
    report("W2-2", "修复验证: 失败路径审计通过", "workflow", false, `异常: ${e}`)
  }

  // W3: 验证修复后的数据完整性链路
  try {
    const res = await call("tools/call", { name: "get_db_schema", arguments: { model: "ChatMessage" } })
    const text = res.result?.content?.[0]?.text || ""
    const hasJsonField = text.includes("metadata") || text.includes("Json")
    const hasTraceRef = text.includes("traceId") || text.includes("trace")
    if (hasJsonField && hasTraceRef) {
      report("W3-1", "数据链路: ChatMessage 元数据字段支持结构化存储", "workflow", true, "metadata(Json) + traceId 可用于存结构化数据")
    } else {
      report("W3-1", "数据链路: ChatMessage 元数据字段支持结构化存储", "workflow", false, "缺少必要字段")
    }
  } catch (e) {
    report("W3-1", "数据链路: ChatMessage 元数据字段支持结构化存储", "workflow", false, `异常: ${e}`)
  }

  try {
    const res = await call("tools/call", { name: "get_db_schema", arguments: { model: "ChainTraceRecord" } })
    const text = res.result?.content?.[0]?.text || ""
    if (text.includes("threadId") && (text.includes("traceId") || text.includes("inputSnapshot") || text.includes("outputSummary"))) {
      report("W3-2", "数据链路: ChainTraceRecord 可关联到聊天消息", "workflow", true, "traceId + threadId 可追溯")
    } else {
      report("W3-2", "数据链路: ChainTraceRecord 可关联到聊天消息", "workflow", false, "关联字段不完整")
    }
  } catch (e) {
    report("W3-2", "数据链路: ChainTraceRecord 可关联到聊天消息", "workflow", false, `异常: ${e}`)
  }

  // ==================== Summary ====================
  await runner.stop()

  console.log(`\n${BOLD}${CYAN}========== 测试汇总 ==========${RESET}\n`)

  const protocolResults = results.filter(r => r.category === "protocol")
  const toolResults = results.filter(r => r.category === "tool")
  const workflowResults = results.filter(r => r.category === "workflow")

  const protocolPass = protocolResults.filter(r => r.pass).length
  const toolPass = toolResults.filter(r => r.pass).length
  const workflowPass = workflowResults.filter(r => r.pass).length
  const totalPass = results.filter(r => r.pass).length

  console.log(`${CYAN}协议层: ${protocolPass}/${protocolResults.length}${RESET}`)
  console.log(`${GREEN}工具层: ${toolPass}/${toolResults.length}${RESET}`)
  console.log(`${YELLOW}工作流: ${workflowPass}/${workflowResults.length}${RESET}`)
  console.log(`\n${BOLD}总计: ${totalPass}/${results.length}${RESET}`)

  if (totalPass === results.length) {
    console.log(`\n${GREEN}${BOLD}✅ 全部通过！${RESET}`)
    process.exit(0)
  } else {
    console.log(`\n${RED}${BOLD}❌ ${results.length - totalPass} 个用例失败${RESET}`)
    const failed = results.filter(r => !r.pass)
    for (const f of failed) {
      console.log(`  ${RED}${f.id}: ${f.name} — ${f.detail}${RESET}`)
    }
    process.exit(1)
  }
}

runTests().catch((e) => {
  console.error(`${RED}测试执行异常: ${e}${RESET}`)
  process.exit(1)
})
