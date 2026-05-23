import { tool } from "@langchain/core/tools"
import { prisma } from "@/lib/prisma"
import { GetCurrentUserSchema, GetTeamMembersSchema, AssignTaskSchema } from "../schemas/user-tools"

export const getCurrentUserTool = tool(
  async () => {
    try {
      const users = await prisma.user.findMany({
        take: 1,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          department: true,
        },
      })

      if (users.length === 0) {
        return {
          success: false,
          error: "未找到用户",
        }
      }

      return {
        success: true,
        user: users[0],
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取用户失败",
      }
    }
  },
  {
    name: "get_current_user",
    description: "获取当前系统用户的信息。在没有明确用户上下文时使用，返回默认用户或第一个用户。",
    schema: GetCurrentUserSchema,
  }
)

export const getTeamMembersTool = tool(
  async ({ projectId, limit = 20, offset = 0 }) => {
    try {
      const tasks = await prisma.task.findMany({
        where: { projectId },
        select: { assigneeId: true },
        distinct: ["assigneeId"],
      })

      const assigneeIds = tasks
        .map((t) => t.assigneeId)
        .filter((id): id is string => id !== null)

      const members = await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        take: limit,
        skip: offset,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          department: true,
        },
      })

      return {
        success: true,
        count: members.length,
        members,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "获取团队成员失败",
      }
    }
  },
  {
    name: "get_team_members",
    description: "获取指定项目的团队成员列表。通过查询项目下所有任务的指派人来获取团队成员。",
    schema: GetTeamMembersSchema,
  }
)

export const assignTaskTool = tool(
  async ({ taskId, assigneeId, reason }) => {
    try {
      const task = await prisma.task.update({
        where: { id: taskId },
        data: { assigneeId },
        include: {
          assignee: { select: { id: true, username: true } },
        },
      })

      return {
        success: true,
        task,
        message: `任务已指派给 ${task.assignee?.username || assigneeId}${reason ? `，原因: ${reason}` : ""}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "指派任务失败",
      }
    }
  },
  {
    name: "assign_task",
    description: "将任务指派给指定的用户。可选提供指派原因。",
    schema: AssignTaskSchema,
  }
)
