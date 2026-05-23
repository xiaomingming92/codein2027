"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { getTaskStatusColor } from "@/lib/transitions"
import type { TaskStatus } from "@/lib/transitions"

interface Task {
  id: string
  name: string
  description?: string
  status: TaskStatus
  priority: number
  progress: number
  type: string
  assignee?: {
    username: string
  }
}

interface TaskCardProps {
  task: Task
  onClick?: (task: Task) => void
  className?: string
}

export function TaskCard({ task, onClick, className }: TaskCardProps) {
  return (
    <Card
      className={cn("cursor-pointer transition-shadow hover:shadow-md", className)}
      onClick={() => onClick?.(task)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={getTaskStatusColor(task.status)}>
            {task.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            优先级: {task.priority}
          </span>
        </div>
        <CardTitle className="text-base">{task.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>进度</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={task.progress} className="h-1.5" />
        </div>
        {task.assignee && (
          <div className="text-xs text-muted-foreground">
            负责人: {task.assignee.username}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface TaskListProps {
  tasks: Task[]
  onTaskClick?: (task: Task) => void
  className?: string
}

export function TaskList({ tasks, onTaskClick, className }: TaskListProps) {
  return (
    <div className={cn("grid gap-4", className)}>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onClick={onTaskClick} />
      ))}
      {tasks.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          暂无任务
        </div>
      )}
    </div>
  )
}
