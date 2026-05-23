"use client"

import * as React from "react"
import { useTaskStore, useProjectStore } from "@/stores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TaskForm } from "@/components/task/task-form"
import { TaskList } from "@/components/task/task-card"
import { Plus } from "lucide-react"
import { getTaskStatusColor } from "@/lib/transitions"

interface TaskPanelProps {
  className?: string
}

interface TaskFormData {
  name: string
  description?: string
  type: string
  priority: number
  assigneeId?: string
  startDate?: string
  endDate?: string
  parentId?: string
}

export function TaskPanel({ className }: TaskPanelProps) {
  const { tasks, isLoading, addTask, updateTask } = useTaskStore()
  const { currentProject } = useProjectStore()

  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [editingTask, setEditingTask] = React.useState<TaskFormData & { id?: string } | null>(null)

  const projectTasks = React.useMemo(() => {
    if (!currentProject) return tasks
    return tasks.filter((t) => t.projectId === currentProject.id)
  }, [tasks, currentProject])

  const tasksByStatus = React.useMemo(() => ({
    PENDING: projectTasks.filter((t) => t.status === "PENDING"),
    IN_PROGRESS: projectTasks.filter((t) => t.status === "IN_PROGRESS"),
    BLOCKED: projectTasks.filter((t) => t.status === "BLOCKED"),
    COMPLETED: projectTasks.filter((t) => t.status === "COMPLETED"),
    CANCELLED: projectTasks.filter((t) => t.status === "CANCELLED"),
  }), [projectTasks])

  const handleCreateTask = async (data: TaskFormData) => {
    try {
      const response = await fetch("/api/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          projectId: currentProject?.id,
        }),
      })

      const result = await response.json()

      if (result.success) {
        addTask(result.data)
        setIsFormOpen(false)
      }
    } catch (error) {
      console.error("Create task error:", error)
    }
  }

  const handleUpdateTask = async (data: TaskFormData) => {
    if (!editingTask?.id) return

    try {
      const response = await fetch(`/api/task/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (result.success) {
        updateTask(editingTask.id, result.data)
        setEditingTask(null)
      }
    } catch (error) {
      console.error("Update task error:", error)
    }
  }

  const handleTaskClick = (task: { id: string }) => {
    const original = tasks.find((t) => t.id === task.id)
    if (original) {
      setEditingTask({
        id: original.id,
        name: original.name,
        description: original.description,
        type: original.type,
        priority: original.priority,
        assigneeId: original.assigneeId,
        startDate: original.startDate,
        endDate: original.endDate,
      })
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">任务管理</CardTitle>
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            新建任务
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="PENDING">待处理</TabsTrigger>
            <TabsTrigger value="IN_PROGRESS">进行中</TabsTrigger>
            <TabsTrigger value="BLOCKED">阻塞</TabsTrigger>
            <TabsTrigger value="COMPLETED">已完成</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <div className="space-y-4">
              {(["PENDING", "IN_PROGRESS", "BLOCKED"] as const).map((status) => (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getTaskStatusColor(status)}>
                      {status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {tasksByStatus[status].length} 个任务
                    </span>
                  </div>
                  <TaskList
                    tasks={tasksByStatus[status]}
                    onTaskClick={handleTaskClick}
                  />
                </div>
              ))}
            </div>
          </TabsContent>

          {(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED"] as const).map((status) => (
            <TabsContent key={status} value={status} className="mt-4">
              <TaskList
                tasks={tasksByStatus[status]}
                onTaskClick={handleTaskClick}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <TaskForm
        open={isFormOpen || !!editingTask}
        onOpenChange={(open) => {
          if (!open) {
            setIsFormOpen(false)
            setEditingTask(null)
          }
        }}
        onSubmit={editingTask?.id ? handleUpdateTask : handleCreateTask}
        initialData={editingTask || undefined}
      />
    </Card>
  )
}
