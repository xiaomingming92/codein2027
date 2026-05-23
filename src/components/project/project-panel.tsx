"use client"

import * as React from "react"
import { useProjectStore } from "@/stores"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"

interface ProjectPanelProps {
  className?: string
}

export function ProjectPanel({ className }: ProjectPanelProps) {
  const {
    projects,
    currentProject,
    isLoading,
    setCurrentProject,
    addProject,
    setLoading,
  } = useProjectStore()

  const [isCreating, setIsCreating] = React.useState(false)
  const [newProjectName, setNewProjectName] = React.useState("")

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return

    setLoading(true)
    try {
      const response = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      })

      const data = await response.json()

      if (data.success) {
        addProject(data.data)
        setNewProjectName("")
        setIsCreating(false)
      }
    } catch (error) {
      console.error("Create project error:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-500"
      case "COMPLETED":
        return "bg-blue-500"
      case "ARCHIVED":
        return "bg-gray-500"
      default:
        return "bg-gray-400"
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">项目列表</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreating(!isCreating)}
          >
            <Plus className="h-4 w-4 mr-1" />
            新建
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCreating && (
          <div className="flex gap-2">
            <Input
              placeholder="项目名称..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
            />
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim()}>
              创建
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">加载中...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无项目</p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  currentProject?.id === project.id
                    ? "bg-primary/10 border border-primary"
                    : "bg-muted hover:bg-muted/80"
                }`}
                onClick={() => setCurrentProject(project)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{project.name}</span>
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(project.status)}`} />
                </div>
                {project.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {project.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {currentProject && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">当前项目</span>
              <Badge variant="outline">{currentProject.name}</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
