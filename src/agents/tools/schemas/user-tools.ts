import { z } from "zod"

export const GetCurrentUserSchema = z.object({})

export const GetTeamMembersSchema = z.object({
  projectId: z.string().describe("项目ID"),
  limit: z.number().min(1).max(100).default(20).describe("返回数量"),
  offset: z.number().min(0).default(0).describe("偏移量"),
})

export const AssignTaskSchema = z.object({
  taskId: z.string().describe("任务ID"),
  assigneeId: z.string().describe("指派人ID"),
  reason: z.string().optional().describe("指派原因"),
})

export type GetCurrentUserInput = z.infer<typeof GetCurrentUserSchema>
export type GetTeamMembersInput = z.infer<typeof GetTeamMembersSchema>
export type AssignTaskInput = z.infer<typeof AssignTaskSchema>
