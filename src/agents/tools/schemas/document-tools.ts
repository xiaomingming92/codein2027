import { z } from "zod"

export const DocumentSearchSchema = z.object({
  query: z.string().describe("搜索查询内容"),
  topK: z.number().min(1).max(20).default(5).describe("返回结果数量"),
  projectId: z.string().optional().describe("限定项目ID"),
  taskId: z.string().optional().describe("限定任务ID"),
})

export const DocumentIndexSchema = z.object({
  fileName: z.string().describe("文件名"),
  fileType: z.string().describe("文件类型"),
  projectId: z.string().optional().describe("项目ID"),
  taskId: z.string().optional().describe("任务ID"),
  tags: z.array(z.string()).optional().describe("标签"),
})

export const DocumentUploadSchema = z.object({
  projectId: z.string().describe("项目ID"),
  taskId: z.string().optional().describe("任务ID"),
  fileName: z.string().describe("文件名"),
  fileType: z.string().describe("文件类型"),
  content: z.string().describe("文件内容（Base64或原文）"),
  tags: z.array(z.string()).optional().describe("标签"),
})

export const DocumentDeleteSchema = z.object({
  id: z.string().describe("文档ID"),
})

export type DocumentSearchInput = z.infer<typeof DocumentSearchSchema>
export type DocumentIndexInput = z.infer<typeof DocumentIndexSchema>
export type DocumentUploadInput = z.infer<typeof DocumentUploadSchema>
export type DocumentDeleteInput = z.infer<typeof DocumentDeleteSchema>
