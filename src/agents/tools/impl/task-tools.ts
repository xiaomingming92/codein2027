import { tool } from "@langchain/core/tools"
import { prisma } from "@/lib/prisma"
import {
  TaskCreateSchema,
  TaskUpdateSchema,
  TaskQuerySchema,
  TaskDeleteSchema,
} from "../schemas/task-tools"

export const createTaskTool = tool(
  async ({ name, description, type, priority, projectId, assigneeId, parentId, startDate, endDate, economicTarget }) => {
    try {
      const task = await prisma.task.create({
        data: {
          name,
          description,
          type: type || "OTHER",
          priority: priority || 0,
          projectId,
          assigneeId,
          parentId,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          economicTarget: economicTarget as object | undefined,
          createdById: "system",
        },
      })

      return {
        success: true,
        task,
        message: `任务 "${name}" 创建成功`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "创建任务失败",
      }
    }
  },
  {
    name: "create_task",
    description: "创建一个新任务。需要提供任务名称和项目ID，可选提供描述、类型、优先级等信息。",
    schema: TaskCreateSchema,
  }
)

export const updateTaskTool = tool(
  async ({ id, name, description, status, priority, assigneeId, progress, startDate, endDate }) => {
    try {
      const updateData: Record<string, unknown> = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (status !== undefined) updateData.status = status
      if (priority !== undefined) updateData.priority = priority
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId
      if (progress !== undefined) updateData.progress = progress
      if (startDate !== undefined) updateData.startDate = new Date(startDate)
      if (endDate !== undefined) updateData.endDate = new Date(endDate)

      const task = await prisma.task.update({
        where: { id },
        data: updateData,
      })

      return {
        success: true,
        task,
        message: `任务 #${id} 更新成功`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "更新任务失败",
      }
    }
  },
  {
    name: "update_task",
    description: "更新现有任务的信息。可以更新任务的名称、描述、状态、优先级、进度等字段。",
    schema: TaskUpdateSchema,
  }
)

export const getTasksTool = tool(
  async ({ projectId, status, assigneeId, type, limit = 20, offset = 0 }) => {
    try {
      const where: Record<string, unknown> = {}
      if (projectId) where.projectId = projectId
      if (status) where.status = status
      if (assigneeId) where.assigneeId = assigneeId
      if (type) where.type = type

      const tasks = await prisma.task.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        include: {
          assignee: { select: { id: true, username: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      })

      return {
        success: true,
        count: tasks.length,
        tasks,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "查询任务失败",
      }
    }
  },
  {
    name: "get_tasks",
    description: "查询任务列表。可按项目、状态、指派人、类型等条件筛选，返回符合条件的任务数组。",
    schema: TaskQuerySchema,
  }
)

export const deleteTaskTool = tool(
  async ({ id }) => {
    try {
      await prisma.task.delete({ where: { id } })

      return {
        success: true,
        message: `任务 #${id} 已删除`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "删除任务失败",
      }
    }
  },
  {
    name: "delete_task",
    description: "删除指定的任务。任务删除后将同时删除其子任务和依赖关系。",
    schema: TaskDeleteSchema,
  }
)
