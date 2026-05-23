"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface Milestone {
  id: string
  name: string
  targetDate: string
  status: string
  progress?: number
  tasks?: number
}

interface MilestoneTimelineProps {
  milestones: Milestone[]
  onMilestoneCreate?: (milestone: Partial<Milestone>) => void
  className?: string
}

export function MilestoneTimeline({
  milestones,
  onMilestoneCreate,
  className,
}: MilestoneTimelineProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-500"
      case "IN_PROGRESS":
        return "bg-blue-500"
      case "PENDING":
        return "bg-gray-400"
      default:
        return "bg-gray-400"
    }
  }

  const getDaysRemaining = (targetDate: string) => {
    const target = new Date(targetDate)
    const now = new Date()
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">里程碑时间线</h3>
        <Button size="sm" variant="outline" onClick={() => onMilestoneCreate?.({})}>
          <Plus className="h-4 w-4 mr-1" />
          添加里程碑
        </Button>
      </div>

      {milestones.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          暂无里程碑
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6 pl-12">
            {milestones.map((milestone) => {
              const daysRemaining = getDaysRemaining(milestone.targetDate)
              const isOverdue = daysRemaining < 0
              const isSoon = daysRemaining >= 0 && daysRemaining <= 7

              return (
                <div key={milestone.id} className="relative">
                  <div
                    className={cn(
                      "absolute -left-8 w-4 h-4 rounded-full border-2 border-background",
                      getStatusColor(milestone.status)
                    )}
                  />

                  <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{milestone.name}</CardTitle>
                        <Badge
                          variant={isOverdue ? "destructive" : isSoon ? "warning" : "secondary"}
                        >
                          {isOverdue
                            ? `逾期 ${Math.abs(daysRemaining)} 天`
                            : daysRemaining === 0
                            ? "今天"
                            : `${daysRemaining} 天后`}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>目标日期: {new Date(milestone.targetDate).toLocaleDateString()}</span>
                        <span>状态: {milestone.status}</span>
                      </div>
                      {milestone.progress !== undefined && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>进度</span>
                            <span>{milestone.progress}%</span>
                          </div>
                          <Progress value={milestone.progress} className="h-1.5" />
                        </div>
                      )}
                      {milestone.tasks !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          关联任务: {milestone.tasks} 个
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
