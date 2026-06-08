# Agent Tools 实现计划

## 当前状态分析

### 问题清单

1. `src/agents/tools/index.ts` 引用了 `impl/` 目录的模块，但这些实现文件不存在
2. `package.json` 缺少文档解析依赖
3. 工具没有绑定到 LLM
4. 节点（intention, retrieval, response）没有调用工具

### 需要实现的功能

* 文档解析：md, docx, doc, wps, xlsx, xls, csv, et, pdf, 图片(OCR)

* 在线 RAG：Chroma 向量检索

* 离线 RAG：文档索引

* 任务/项目/用户工具

***

## 实现步骤

### Step 1: 安装依赖

```bash
npm install pdf-parse mammoth xlsx papaparse tesseract.js jszip
npm install -D @types/papaparse
```

### Step 2: 创建文档解析服务

**文件**: `src/services/document-parser.ts`

```typescript
// 依赖: pdf-parse, mammoth, xlsx, papaparse, tesseract.js, jszip
// 支持格式:
//   文本: .md, .txt, .markdown
//   Office: .docx (mammoth), .xlsx/.xls (xlsx), .wps (jszip解压xml)
//   PDF: .pdf (pdf-parse)
//   图片: .jpg/.png/.bmp/.webp (tesseract.js OCR)
// 返回: { content: string, metadata: Record<string, any> }
```

### Step 3: 创建文档索引服务

**文件**: `src/services/document-indexer.ts`

```typescript
// 依赖: @langchain/community (Chroma)
// 函数:
//   indexDocument(filePath, metadata) - 单文档索引
//   similaritySearch(query, topK, filter?) - 向量检索
//   reindexAll() - 重建所有索引
```

### Step 4: 创建工具实现

**目录**: `src/agents/tools/impl/`

| 文件                  | 工具                                                                | 功能        |
| ------------------- | ----------------------------------------------------------------- | --------- |
| search-documents.ts | `search_online_documents`                                         | 在线 RAG 检索 |
| index-documents.ts  | `index_documents`, `reindex_all_documents`                        | 离线 RAG 索引 |
| task-tools.ts       | `create_task`, `update_task`, `get_tasks`, `delete_task`          | 任务 CRUD   |
| project-tools.ts    | `create_project`, `get_projects`, `get_project`, `update_project` | 项目 CRUD   |
| user-tools.ts       | `get_current_user`, `get_team_members`, `assign_task`             | 用户操作      |

### Step 5: 绑定工具到 LLM

**文件**: `src/lib/llm.ts`

```typescript
import { agentTools } from "@/agents/tools"

export const llmWithTools = llm.bindTools(agentTools)
```

### Step 6: 修改 Agent 入口

**文件**: `src/agents/index.ts`

```typescript
import { llmWithTools } from "@/lib/llm"

// 在 workflow 中使用 llmWithTools
```

### Step 7: 修改节点使用工具

**intention.ts**: 使用工具解析用户意图
**retrieval.ts**: 调用 search\_online\_documents 工具
**response.ts**: 调用相关工具执行任务

***

## 文件结构

```
src/
├── agents/
│   ├── tools/
│   │   ├── index.ts              # 导出所有工具
│   │   ├── schemas/              # Zod schemas
│   │   │   ├── task-tools.ts
│   │   │   ├── project-tools.ts
│   │   │   ├── document-tools.ts
│   │   │   ├── user-tools.ts
│   │   └── impl/                 # 工具实现
│   │       ├── search-documents.ts
│   │       ├── index-documents.ts
│   │       ├── task-tools.ts
│   │       ├── project-tools.ts
│   │       ├── user-tools.ts
│   │   ├── index.ts                  # 绑定工具到 LLM
│   └── nodes/
│       ├── intention.ts
│       ├── retrieval.ts
│       └── response.ts
├── services/
│   ├── document-parser.ts        # 文档解析
│   └── document-indexer.ts      # Chroma 索引
└── lib/
    └── llm.ts                    # 添加 llmWithTools
```

***

## 验证方式

1. `npm run build` 编译成功
2. `npm run lint` 无错误
3. 工具能正确导出和调用

