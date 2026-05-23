import { z } from "zod"

export const ProjectCreateSchema = z.object({
  name: z.string().describe("项目名称"),
  description: z.string().optional().describe("项目描述"),
  config: z
    .object({
      mode: z.enum(["AGILE", "WATERFALL", "ITERATIVE"]).optional(),
      reviewCycle: z.number().optional().describe("评审周期(天)"),
    })
    .optional()
    .describe("项目配置"),
})

export const ProjectUpdateSchema = z.object({
  id: z.string().describe("项目ID"),
  name: z.string().optional().describe("项目名称"),
  description: z.string().optional().describe("项目描述"),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional().describe("项目状态"),
  config: z
    .object({
      mode: z.enum(["AGILE", "WATERFALL", "ITERATIVE"]).optional(),
      reviewCycle: z.number().optional(),
    })
    .optional()
    .describe("项目配置"),
})

export const ProjectQuerySchema = z.object({
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional().describe("项目状态"),
  search: z.string().optional().describe("搜索关键词"),
  limit: z.number().min(1).max(100).default(20).describe("返回数量"),
  offset: z.number().min(0).default(0).describe("偏移量"),
})

export const ProjectGetSchema = z.object({
  id: z.string().describe("项目ID"),
})

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>
export type ProjectQueryInput = z.infer<typeof ProjectQuerySchema>
export type ProjectGetInput = z.infer<typeof ProjectGetSchema>
