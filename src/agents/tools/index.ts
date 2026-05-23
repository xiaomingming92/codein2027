import type { StructuredTool } from "@langchain/core/tools"

import { searchOnlineDocumentsTool } from "./impl/search-documents"
import { indexDocumentsTool, reindexAllDocumentsTool } from "./impl/index-documents"
import { createTaskTool, updateTaskTool, getTasksTool, deleteTaskTool } from "./impl/task-tools"
import { createProjectTool, getProjectsTool, getProjectTool, updateProjectTool } from "./impl/project-tools"
import { getCurrentUserTool, getTeamMembersTool, assignTaskTool } from "./impl/user-tools"

export const agentTools: StructuredTool[] = [
  searchOnlineDocumentsTool,
  indexDocumentsTool,
  reindexAllDocumentsTool,
  createTaskTool,
  updateTaskTool,
  getTasksTool,
  deleteTaskTool,
  createProjectTool,
  getProjectsTool,
  getProjectTool,
  updateProjectTool,
  getCurrentUserTool,
  getTeamMembersTool,
  assignTaskTool,
]

export {
  searchOnlineDocumentsTool,
  indexDocumentsTool,
  reindexAllDocumentsTool,
  createTaskTool,
  updateTaskTool,
  getTasksTool,
  deleteTaskTool,
  createProjectTool,
  getProjectsTool,
  getProjectTool,
  updateProjectTool,
  getCurrentUserTool,
  getTeamMembersTool,
  assignTaskTool,
}
