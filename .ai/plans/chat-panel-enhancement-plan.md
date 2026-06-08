# 模型配置架构文档

> 本文档描述模型配置系统的完整架构，包括 TOML 配置、安全隔离、连通性测试、多模态支持和状态管理。

---

## 1. 架构总览

```
                          ┌──────────────┐
                          │  model.toml  │  唯一配置来源 (Single Source of Truth)
                          │  云端模型定义  │
                          │  Ollama 模板  │
                          │  默认参数     │
                          └──────┬───────┘
                                 │ 服务端 Node.js 解析 (smol-toml)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          model-config.ts                                │
│  ┌──────────────────┐  ┌─────────────────────┐  ┌──────────────────┐   │
│  │ buildCloudModels │  │ resolveApiKeyForModel│  │ buildOllamaTempl │   │
│  │ TOML → ModelInfo │  │ apiKeyEnv → env 值   │  │ ates             │   │
│  └────────┬─────────┘  └──────────┬──────────┘  └────────┬─────────┘   │
│           │                       │                      │              │
│           ▼                       ▼                      ▼              │
│  DEFAULT_MODELS[]        resolveApiKeyForModel()  OLLAMA_TEMPLATES[]   │
└───────────┬──────────────────────┬──────────────────────┬──────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
   ┌────────────────┐    ┌─────────────────┐    ┌──────────────────┐
   │ /api/model/list │    │ /api/model/test │    │ /api/agent/chat  │
   │ GET 模型列表     │    │ POST 连通性测试  │    │ POST 聊天请求     │
   │ 剔除 apiKey     │    │ 服务端补全 apiKey │    │ 服务端补全 apiKey │
   └────────┬────────┘    └─────────────────┘    └──────────────────┘
            │                      │
            ▼                      ▼
   ┌─────────────────────────────────────────────────────┐
   │              Zustand Store (model-config-store)      │
   │  ┌─────────────┐  ┌───────────────┐  ┌───────────┐ │
   │  │ models[]    │  │ customModels[]│  │ testing... │ │
   │  │ 从API初始化  │  │ 用户自定义     │  │ ModelId   │ │
   │  └─────────────┘  └───────────────┘  └───────────┘ │
   │  ┌─────────────────────────────────────────────┐    │
   │  │ ollamaTemplates[]  ollamaDefaults           │    │
   │  │ 从API初始化         从API初始化              │    │
   │  └─────────────────────────────────────────────┘    │
   │  ┌─────────────────────────────────────────────┐    │
   │  │ useActiveModel() → 当前选中模型             │    │
   │  │ useEnsureModelInitialized() → 首次加载      │    │
   │  └─────────────────────────────────────────────┘    │
   └──────────────────────┬──────────────────────────────┘
                          │ 所有组件从 store 读取，不通过 prop 传递
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
     ModelSelector  ChatContainer  ModelManagerDialog
     下拉选择+状态灯  图片上传控制    添加/编辑/测试
```

---

## 2. TOML 配置文件

**文件**: `src/config/model.toml`

### 2.1 结构说明

```toml
# 云端模型默认值 — 当 [[cloud]] 条目省略某字段时使用
[defaults.cloud]
baseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
apiKeyEnv = "OPENAI_API_KEY"          # 环境变量名，不是密钥本身
temperature = 0.1
maxTokens = 4000
multimodal = false

# 本地模型默认值 — 用户添加本地模型时的表单预填
[defaults.ollama]
baseURL = "http://localhost:11434"
temperature = 0.1
maxTokens = 4000
multimodal = false

# 云端模型列表 — 必填 model，其他可选
[[cloud]]
model = "deepseek-v4-flash"           # 必填
name = "DeepSeek V4 Flash"            # 可选，默认取 model
providerLabel = "DeepSeek"            # 可选，默认 "云端模型"
baseURL = "https://api.deepseek.com/v1"  # 可选，覆盖 defaults
apiKeyEnv = "DEEPSEEK_API_KEY"        # 可选，覆盖 defaults
multimodal = true                     # 可选，覆盖 defaults

# Ollama 模板 — 不自动加载，用户可快捷选择
[[ollama_template]]
model = "qwen2.5"
name = "Qwen 2.5"
multimodal = false
```

### 2.2 支持的字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | ✅ | 模型标识符 (如 `qwen-vl-plus`) |
| `name` | string | 可选 | 显示名称，默认取 model |
| `providerLabel` | string | 可选 | 供应商标签 (如 "阿里云百炼") |
| `baseURL` | string | 可选 | API 地址，默认取 defaults |
| `apiKeyEnv` | string | 可选 | 环境变量名，默认 `OPENAI_API_KEY` |
| `temperature` | number | 可选 | 默认 0.1 |
| `maxTokens` | number | 可选 | 默认 4000 |
| `multimodal` | boolean | 可选 | 是否支持图片输入，默认 false |

---

## 3. 安全隔离设计

### 3.1 API Key 绝不暴露到客户端

```
┌─────────────────────────────────────────────┐
│ .env (服务端独占)                            │
│   OPENAI_API_KEY="sk-xxx"                   │
│   DEEPSEEK_API_KEY="sk-yyy"                 │
│   GLM_API_KEY="xxx.zzz"                     │
└─────────────────────┬───────────────────────┘
                      │ 只在 Node.js 服务端可见
                      ▼
┌─────────────────────────────────────────────┐
│ /api/model/list                              │
│   返回时解构剔除 apiKey:                      │
│   DEFAULT_MODELS.map(({ apiKey: _, ...m })   │
│     => m)                                    │
└─────────────────────┬───────────────────────┘
                      │ 客户端 fetch 获取
                      ▼
┌─────────────────────────────────────────────┐
│ Zustand Store (浏览器)                       │
│   models[] — 无 apiKey 字段                  │
│   customModels[] — 可含用户自填的 apiKey      │
└─────────────────────────────────────────────┘
```

### 3.2 服务端统一补全 API Key

`resolveApiKeyForModel(model)` 函数：
- 若 `model.apiKey` 已有值 → 直接使用
- 若 `model.provider === "ollama"` → 返回 undefined
- 否则 → 从 `process.env.OPENAI_API_KEY` 读取

所有服务端 API 端点 (`/api/agent/chat`, `/api/model/test`) 都使用此函数补全。

---

## 4. 连通性测试

### 4.1 测试流程 (两步走)

```
Step 1: 连通性测试
  cloud:  GET {baseURL}/models
  ollama: GET {baseURL}/api/tags

  ├─ 失败 → 🔴 红灯 (connect_failed)
  └─ 成功 → Step 2

Step 2: 模型调用测试
  cloud:  POST {baseURL}/chat/completions  (发送 "Hello, reply with just 'ok'.")
  ollama: POST {baseURL}/api/chat          (同上)

  ├─ 失败 → 🟡 黄灯 (invoke_failed)
  └─ 成功 → 🟢 绿灯 (connected)
```

### 4.2 状态指示灯

| 灯色 | 状态值 | 含义 |
|------|--------|------|
| 🟢 绿灯 | `connected` | 连接成功，模型可正常调用 |
| 🔴 红灯 | `connect_failed` | 无法连接服务，检查地址和网络 |
| 🟡 黄灯 | `invoke_failed` | 已连接但调用失败，检查模型名和参数 |
| ⚪ 灰灯 | `unknown` | 尚未测试 |

### 4.3 Ollama 特殊逻辑

连通性测试时，会检查 `/api/tags` 返回的模型列表：
- 模型存在 → 继续调用测试
- 模型不存在 → 直接返回黄灯，并列出可用模型名称

---

## 5. 多模态支持

### 5.1 数据流

```
model.toml                    model-config.ts           /api/model/list
multimodal = true  ──解析──→  ModelInfo.multimodal  ──→  传递到客户端
                                                       │
                                                       ▼
                                                  Zustand Store
                                                       │ useActiveModel()
                                                       ▼
                                              ChatContainer
                                        enableImageUpload =
                                          activeModel.multimodal
                                               │
                                               ▼
                                        QuickActionBar
                                    图片上传按钮 显示/隐藏
```

### 5.2 设计原则

- `multimodal` 字段在 `ModelInfo` 中为必填 `boolean`，默认 `false`
- 云端模型通过 TOML 配置 `multimodal = true`
- 用户自定义模型通过表单中的"多模态"复选框设置
- **组件直接从 store 读取 `useActiveModel()?.multimodal`**，不通过 prop 传递
- 模型切换后，图片上传按钮自动出现/隐藏

---

## 6. Zustand Store 设计

**文件**: `src/stores/model-config-store.ts`

### 6.1 State 结构

```typescript
interface ModelConfigState {
  models: ModelInfo[]                // 从 /api/model/list 初始化的云端模型
  activeModelId: string              // 当前选中模型 ID
  customModels: ModelInfo[]          // 用户自定义模型
  testingModelId: string | null      // 正在测试的模型 ID
  ollamaTemplates: OllamaTemplate[]  // Ollama 快捷模板
  ollamaDefaults: {                  // Ollama 表单默认值
    baseURL: string
    temperature: number
    maxTokens: number
    multimodal: boolean
  }
  initialized: boolean               // 是否已从 API 初始化
}
```

### 6.2 持久化策略

仅 `activeModelId` 和 `customModels` 持久化到 localStorage (key: `model-config-storage`)。

`models` 和 `ollamaTemplates` 不持久化——每次启动从 `/api/model/list` 重新获取，确保与 TOML 配置一致。

### 6.3 初始化流程

```typescript
// 在 ModelSelector 中调用
useEnsureModelInitialized()

// 内部实现：
useEffect(() => {
  if (!initialized) {
    initialize()  // fetch /api/model/list
  }
}, [initialized, initialize])
```

### 6.4 核心 Hooks

| Hook | 返回 | 说明 |
|------|------|------|
| `useModelConfigStore()` | 完整 store | 直接访问所有状态和方法 |
| `useActiveModel()` | `ModelInfo \| undefined` | 当前选中模型的完整信息 |
| `useEnsureModelInitialized()` | void | 在组件挂载时触发初始化 |

---

## 7. API 端点

### 7.1 GET /api/model/list

返回不含 apiKey 的模型列表、Ollama 模板和默认值。

**Response**:
```json
{
  "models": [
    {
      "id": "cloud-deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "provider": "cloud",
      "providerLabel": "DeepSeek",
      "baseURL": "https://api.deepseek.com/v1",
      "model": "deepseek-v4-flash",
      "temperature": 0.1,
      "maxTokens": 4000,
      "multimodal": true
    }
  ],
  "ollamaTemplates": [
    { "model": "qwen2.5", "name": "Qwen 2.5", "providerLabel": "Ollama", "multimodal": false }
  ],
  "ollamaDefaults": {
    "baseURL": "http://localhost:11434",
    "temperature": 0.1,
    "maxTokens": 4000,
    "multimodal": false
  }
}
```

### 7.2 POST /api/model/test

测试模型连通性，服务端自动补全 apiKey。

**Request**:
```json
{
  "provider": "cloud",
  "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "model": "qwen-max",
  "temperature": 0.1,
  "maxTokens": 4000
}
```

**Response**:
```json
{
  "status": "connected",
  "message": "模型调用成功",
  "latencyMs": 1234,
  "detail": null
}
```

---

## 8. 审计日志

**文件**: `src/lib/model-config-logger.ts`

### 8.1 审计阶段

```typescript
type ModelConfigAuditPhase =
  | "MODEL_CONFIG_START"          // 流程开始
  | "MODEL_CONFIG_FETCH"          // 模型列表初始化
  | "MODEL_CONFIG_APPLY"          // 配置应用（添加/删除/更新自定义模型）
  | "MODEL_CONFIG_LLM_RESET"      // LLM 实例重建
  | "MODEL_CONFIG_AGENT_INVOKE"   // Agent 调用
  | "MODEL_CONFIG_TEST_CONNECT"   // 连通性测试
  | "MODEL_CONFIG_TEST_INVOKE"    // 模型调用测试
  | "MODEL_CONFIG_DONE"           // 流程完成
  | "MODEL_CONFIG_FAIL"           // 流程失败
```

### 8.2 审计点分布

| 操作 | 阶段标记 | 触发位置 |
|------|----------|----------|
| 模型列表初始化 | FETCH | store.initialize() |
| 模型切换 | START | store.setActiveModel() |
| 添加自定义模型 | APPLY | store.addCustomModel() |
| 删除自定义模型 | APPLY | store.removeCustomModel() |
| 更新自定义模型 | APPLY | store.updateCustomModel() |
| 连通性测试开始 | START | store.testModelConnection() |
| 连通性测试完成 | DONE | store.testModelConnection() |
| 连通性测试失败 | FAIL | store.testModelConnection() / /api/model/test |

---

## 9. 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/config/model.toml` | 配置 | TOML 模型配置文件（唯一来源） |
| `src/config/model-config.ts` | 核心逻辑 | TOML 解析、ModelInfo 类型、apiKey 解析 |
| `src/stores/model-config-store.ts` | 状态管理 | Zustand store、初始化、连通性测试调度 |
| `src/lib/model-config-logger.ts` | 审计 | 模型配置审计日志器 |
| `src/app/api/model/list/route.ts` | API | GET 模型列表（剔除 apiKey） |
| `src/app/api/model/test/route.ts` | API | POST 模型连通性测试（服务端补全 apiKey） |
| `src/components/chat/model-selector.tsx` | UI | 模型选择下拉 + 状态灯 + 管理入口 |
| `src/components/chat/model-manager-dialog.tsx` | UI | 模型管理对话框（添加/编辑/测试/删除） |
| `src/components/chat/chat-container.tsx` | UI | 聊天输入容器（从 store 读取 multimodal） |
| `src/components/chat/quick-action-bar.tsx` | UI | 快捷操作栏（图片上传按钮由 multimodal 控制） |
| `src/components/chat/chat-panel.tsx` | UI | 聊天面板（集成以上组件） |

---

## 10. 如何添加新模型

### 10.1 添加云端模型

编辑 `src/config/model.toml`，新增 `[[cloud]]` 条目：

```toml
[[cloud]]
model = "new-model-id"
name = "显示名称"
providerLabel = "供应商名"
baseURL = "https://api.example.com/v1"
apiKeyEnv = "NEW_MODEL_API_KEY"
multimodal = true
```

然后在 `.env.development` 中添加对应的环境变量：

```bash
NEW_MODEL_API_KEY="sk-your-key-here"
```

重启服务生效。

### 10.2 添加 Ollama 模板

编辑 `src/config/model.toml`，新增 `[[ollama_template]]` 条目：

```toml
[[ollama_template]]
model = "llama3"
name = "Llama 3"
multimodal = false
```

重启后，模板会出现在模型管理对话框的快捷添加区域。

### 10.3 运行时添加自定义模型

用户通过模型管理对话框 (⚙按钮) 直接添加，数据保存在 localStorage，无需重启。
