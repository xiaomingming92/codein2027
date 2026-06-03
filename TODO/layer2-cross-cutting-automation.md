# Layer 2 运行时审计横切关注点自动化

## 背景

当前 farm-agent 的 Layer 2 运行时审计依赖**手动调用** `recordXxxAudit()`：

```typescript
// 现状：每个 API Route / Service 都要手动调用
export async function POST(request: NextRequest) {
  const result = await documentService.upload(file)
  
  // 开发者必须记得这行，否则审计缺失
  await recordDocAudit({
    action: "DOC_UPLOADED",
    entityId: result.id,
    detail: { fileName: file.name }
  })
  
  return NextResponse.json(result)
}
```

**问题**：
1. 遗漏风险：开发者可能忘记调用
2. 不一致：不同文件调用方式不同
3. 维护成本：每个新功能都要手写审计代码

**milktea 的贡献（核心洞见）**：在 Node RuoYi (Express) 中证明了"Layer 2 运行时审计可以完全自动记录"——通过中间件覆盖 `res.json()` 拦截 POST/PUT/DELETE 请求，自动写入 `pro_add_log` 表，开发者零感知。这是一个**可能性的证明**，不是代码移植模板。

**farm-agent 的目标**：延续"自动记录"的洞见，适配 Next.js 架构，构建**不绑定 Web 框架、从请求级向函数内横切可演进的通用机制**。本轮落地为高阶函数包装器 + 路径注册表 + 脱敏工具的三件套。

---

## 目标

```
┌─────────────────────────────────────────────────────────────────────────┐
│  目标态：开发者不需要手动调用 recordXxxAudit()                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  开发者写的代码：                                                        │
│                                                                         │
│    export const POST = async (request) => {                             │
│      const file = await request.formData()                              │
│      return processDocument(file)                                       │
│    }                                                                     │
│                                                                         │
│    ↑ 纯业务逻辑，零审计代码                                              │
│                                                                         │
│  Layer 2 自动记录（通过横切机制）：                                      │
│                                                                         │
│    POST /api/knowledge/upload → DOC_UPLOADED { fileName, fileSize }     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 候选方案

### 方案 A：高阶函数包装器（推荐，Phase 1）

```typescript
// src/lib/audit-wrapper.ts
import { prisma } from "./prisma"

export function withRuntimeAudit<T extends (...args: any[]) => any>(
  config: {
    action: string
    targetType: string
    extractTargetId?: (result: Awaited<ReturnType<T>>) => string
    extractDetail?: (result: Awaited<ReturnType<T>>) => Record<string, unknown>
  },
  fn: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now()
    try {
      const result = await fn(...args)

      await prisma.auditLog.create({
        data: {
          action: config.action,
          targetType: config.targetType,
          targetId: config.extractTargetId?.(result) ?? "unknown",
          detail: {
            durationMs: Date.now() - startTime,
            ...config.extractDetail?.(result),
          },
          timestamp: new Date(),
        },
      })

      return result
    } catch (error) {
      await prisma.auditLog.create({
        data: {
          action: `${config.action}_FAILED`,
          targetType: config.targetType,
          targetId: "unknown",
          detail: {
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          },
          timestamp: new Date(),
        },
      })
      throw error
    }
  }) as T
}
```

**使用方式**：

```typescript
// API Route - 完全自动
export const POST = withRuntimeAudit({
  action: "DOC_UPLOADED",
  targetType: "DOCUMENT",
  extractTargetId: (result) => result.id,
  extractDetail: (result) => ({ fileName: result.name, fileSize: result.size }),
}, async (request: NextRequest) => {
  const file = await request.formData()
  return documentService.upload(file)
})
```

**优点**：
- ✅ TypeScript 类型安全，返回值类型自动推断
- ✅ 适用于普通函数（API Route）
- ✅ 实现简单，无魔法
- ✅ 明确标识哪些函数有审计

**缺点**：
- ❌ 需要显式包装每个函数
- ❌ 包装器嵌套可能影响可读性
- ❌ 只能审计函数级别，无法进入函数内部

---

### 方案 B：类方法装饰器（推荐，Phase 2）

```typescript
// src/lib/audit-decorator.ts
export function RuntimeAudit(config: {
  action: string
  targetType: string
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now()
      try {
        const result = await originalMethod.apply(this, args)

        await recordAudit({
          action: config.action,
          targetType: config.targetType,
          detail: { durationMs: Date.now() - startTime },
        })

        return result
      } catch (error) {
        await recordAudit({
          action: `${config.action}_FAILED`,
          targetType: config.targetType,
          detail: {
            durationMs: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
          },
        })
        throw error
      }
    }

    return descriptor
  }
}
```

**使用方式**：

```typescript
class DocumentService {
  @RuntimeAudit({ action: "DOC_UPLOADED", targetType: "DOCUMENT" })
  async upload(file: File) {
    return processDocument(file)
  }

  @RuntimeAudit({ action: "DOC_DELETED", targetType: "DOCUMENT" })
  async delete(docId: string) {
    return deleteDocument(docId)
  }
}
```

**优点**：
- ✅ 声明式，一眼看出哪些方法有审计
- ✅ 适用于 Service 类方法
- ✅ TypeScript 实验性装饰器

**缺点**：
- ❌ 只能作用于类方法
- ❌ Next.js API Route 是普通函数，不适用
- ❌ TypeScript 装饰器仍为实验性特性

---

### 方案 C：Next.js middleware（受限方案）

```typescript
// src/middleware.ts (Next.js Edge Middleware)
export function middleware(request: NextRequest) {
  // 只能拦截请求级别的信息
  // 无法获取响应体
  // 无法获取业务数据
  // → 不适合做 Layer 2 审计
}
```

**结论**：❌ 不推荐。Next.js middleware 运行在 Edge Runtime，无法访问 Prisma/DB，无法获取响应体。

---

### 方案 D：Proxy 全自动（不推荐）

```typescript
const documentService = createAuditProxy(new DocumentService(), "DOC")
// 所有方法调用自动带审计
```

**结论**：❌ 不推荐。黑魔法，调试困难，性能有损，类型推断可能丢失。

---

## 方案对比

| 方案 | 适用场景 | 自动化程度 | 类型安全 | 调试友好 | 推荐度 |
|------|---------|-----------|---------|---------|--------|
| **A: 高阶函数** | API Route、普通函数 | 半自动 | ✅ | ✅ | ⭐⭐⭐ |
| **B: 装饰器** | Service 类方法 | 声明式 | ✅ | ✅ | ⭐⭐⭐ |
| **C: Next.js middleware** | HTTP 请求级 | 全自动 | — | ❌ | ⭐ |
| **D: Proxy** | 对象方法 | 全自动 | ⚠️ | ❌ | ⭐ |

---

## 推荐混合方案

```
┌─────────────────────────────────────────────────────────────────────────┐
│  场景 → 方案 映射                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  API Route（普通函数）→ 方案 A: 高阶函数包装器                            │
│  Service 类方法       → 方案 B: @RuntimeAudit 装饰器                     │
│  Agent 节点（复杂逻辑）→ 保留手动调用（循环内审计）                       │
│                                                                         │
│  export const POST = withRuntimeAudit({...}, async (req) => {...})      │
│                                                                         │
│  class DocumentService {                                                │
│    @RuntimeAudit({...})                                                 │
│    async upload(file) {...}                                             │
│  }                                                                      │
│                                                                         │
│  // Agent 节点：保留手动调用，因为需要记录每个 token/证据                 │
│  async function reasoningNode(state) {                                  │
│    for (const step of steps) {                                          │
│      await recordAgentAudit({...}) // 手动，每个步骤都要记录             │
│    }                                                                    │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 延续与拓展：从 milktea 的 Express 实践到 farm-agent 的 Next.js 实现

milktea 的中间件证明了 Layer 2 自动记录是可行的——这是不可替代的贡献。farm-agent 延续这一核心洞见，根据 Next.js 技术栈做了相应的拓展：

| 维度 | milktea（Express 实践） | farm-agent（Next.js 实现） |
|------|----------------------|------------------------|
| **运行环境** | Express / req-res 管线 | Next.js API Route，不绑定特定 Web 框架 |
| **适用场景** | HTTP POST/PUT/DELETE | API Route + Service 类 + 后台脚本 |
| **消费者** | DB（pro_add_log） | AuditLog + console + file（ADD-4 三通道） |
| **粒度演进** | 请求级 | 请求级起点 → 装饰器 → 函数内横切（可演进） |
| **失败路径** | 中间件 catch | 等价信息密度（durationMs + error）（ADD-6） |

**共同目标**：开发者不需要手动写审计代码

---

## 实施计划

### Phase 1: 基础包装器（S）

- [ ] 创建 `src/lib/audit-wrapper.ts`
- [ ] 实现 `withRuntimeAudit()` 通用包装器
- [ ] 在 1 个 API Route 试点（如 `POST /api/knowledge/documents`）
- [ ] 验证类型推断正确
- [ ] 验证 AuditLog 表写入正确

### Phase 2: 装饰器（M）

- [ ] 创建 `src/lib/audit-decorator.ts`
- [ ] 实现 `@RuntimeAudit()` 类方法装饰器
- [ ] 在 DocumentService 试点
- [ ] 验证与 Prisma 事务的兼容性

### Phase 3: 迁移现有手动调用（L）

- [ ] 列出所有现有 `recordXxxAudit()` 调用点
- [ ] 逐个迁移到包装器/装饰器
- [ ] 删除冗余的手动调用代码
- [ ] 保留 Agent 节点的手动调用（复杂逻辑需要）

### Phase 4: 验证（M）

- [ ] 端到端测试：上传文档 → 检查 AuditLog 表
- [ ] 端到端测试：删除文档 → 检查 AuditLog 表
- [ ] 失败路径测试：模拟错误 → 检查 FAILED 记录
- [ ] 前端查询：审计日志列表正常展示

---

## 验收标准

| 场景 | 验收标准 |
|------|---------|
| 新开发者写 API Route | 不需要写任何 `recordXxxAudit()`，Layer 2 自动记录 |
| 新开发者写 Service 方法 | 加 `@RuntimeAudit()` 装饰器即可 |
| 审计日志完整性 | 所有 API Route 的调用都有对应的 AuditLog 记录 |
| 失败路径 | 异常时自动记录 FAILED，detail 包含错误信息 |
| 前端查询 | 审计日志列表正常展示，操作历史可追溯 |

---

## 关联文档

- `.trae/reviews/farm-agent-layer2-cross-cutting-review-v1.md` — 本 TODO 的 Review
- `TODO/add-compliance-automation.md` — ADD 合规自动化体系（三层模型）
- `TODO/crossenv-platform-abstraction.md` — 跨平台环境统一
- milteaa 项目 `src/middlewares/audit.js` — Layer 2 自动记录的首个实现，[node_livid](https://github.com/Milkycoffees/node_livid)
