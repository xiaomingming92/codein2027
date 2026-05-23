import { z } from "zod"

export const TaskCreateSchema = z.object({
  name: z.string().describe("任务名称"),
  description: z.string().optional().describe("任务描述"),
  type: z
    .enum(["DEVELOPMENT", "DESIGN", "TESTING", "DEPLOYMENT", "REVIEW", "OTHER"])
    .optional()
    .describe("任务类型"),
  priority: z.number().min(0).max(100).optional().describe("优先级 0-100"),
  projectId: z.string().describe("所属项目ID"),
  assigneeId: z.string().optional().describe("指派人ID"),
  parentId: z.string().optional().describe("父任务ID"),
  startDate: z.string().optional().describe("开始日期 ISO格式"),
  endDate: z.string().optional().describe("结束日期 ISO格式"),
  economicTarget: z
    .object({
      cost: z.number().optional(),
      benefit: z.number().optional(),
      deadline: z.string().optional(),
    })
    .optional()
    .describe("经济目标"),
})

export const TaskUpdateSchema = z.object({
  id: z.string().describe("任务ID"),
  name: z.string().optional().describe("任务名称"),
  description: z.string().optional().describe("任务描述"),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"])
    .optional()
    .describe("任务状态"),
  priority: z.number().min(0).max(100).optional().describe("优先级 0-100"),
  assigneeId: z.string().optional().describe("指派人ID"),
  progress: z.number().min(0).max(100).optional().describe("进度 0-100"),
  startDate: z.string().optional().describe("开始日期"),
  endDate: z.string().optional().describe("结束日期"),
})

export const TaskQuerySchema = z.object({
  projectId: z.string().optional().describe("项目ID"),
  status: z
    .enum(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"])
    .optional()
    .describe("任务状态"),
  assigneeId: z.string().optional().describe("指派人ID"),
  type: z
    .enum(["DEVELOPMENT", "DESIGN", "TESTING", "DEPLOYMENT", "REVIEW", "OTHER"])
    .optional()
    .describe("任务类型"),
  limit: z.number().min(1).max(100).default(20).describe("返回数量"),
  offset: z.number().min(0).default(0).describe("偏移量"),
})

export const TaskDeleteSchema = z.object({
  id: z.string().describe("任务ID"),
})

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>
export type TaskQueryInput = z.infer<typeof TaskQuerySchema>
export type TaskDeleteInput = z.infer<typeof TaskDeleteSchema>
