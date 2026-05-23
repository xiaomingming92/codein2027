import { tool } from "@langchain/core/tools"
import { prisma } from "@/lib/prisma"
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectQuerySchema,
  ProjectGetSchema,
} from "../schemas/project-tools"

export const createProjectTool = tool(
  async ({ name, description, config }) => {
    try {
      const project = await prisma.project.create({
        data: {
          name,
          description,
          config: config as object | undefined,
          createdBy: "system",
        },
      })

      return {
        success: true,
        project,
        message: `项目 "${name}" 创建成功`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "创建项目失败",
      }
    }
  },
  {
    name: "create_project",
    description: "创建一个新项目。需要提供项目名称，可选提供描述和配置信息。",
    schema: ProjectCreateSchema,
  }
)

export const getProjectsTool = tool(
  async ({ status, search, limit = 20, offset = 0 }) => {
    try {
      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ]
      }

      const projects = await prisma.project.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { tasks: true, documents: true },
          },
        },
      })

      return {
        success: true,
        count: projects.length,
        projects,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "查询项目失败",
      }
    }
  },
  {
    name: "get_projects",
    description: "查询项目列表。可按状态筛选，支持名称搜索，返回项目数组。",
    schema: ProjectQuerySchema,
  }
)

export const getProjectTool = tool(
  async ({ id }) => {
    try {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          tasks: {
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
              assignee: { select: { id: true, username: true } },
            },
          },
          milestones: {
            take: 5,
            orderBy: { targetDate: "asc" },
          },
          _count: {
            select: { tasks: true, documents: true },
          },
        },
      })

      if (!project) {
        return {
          success: false,
          error: "项目不存在",
        }
      }

      return {
        success: true,
        project,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "查询项目失败",
      }
    }
  },
  {
    name: "get_project",
    description: "获取指定项目的详细信息，包括任务、里程碑、文档统计等。",
    schema: ProjectGetSchema,
  }
)

export const updateProjectTool = tool(
  async ({ id, name, description, status, config }) => {
    try {
      const updateData: Record<string, unknown> = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (status !== undefined) updateData.status = status
      if (config !== undefined) updateData.config = config

      const project = await prisma.project.update({
        where: { id },
        data: updateData,
      })

      return {
        success: true,
        project,
        message: `项目 #${id} 更新成功`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "更新项目失败",
      }
    }
  },
  {
    name: "update_project",
    description: "更新项目信息。可更新名称、描述、状态、配置等字段。",
    schema: ProjectUpdateSchema,
  }
)
