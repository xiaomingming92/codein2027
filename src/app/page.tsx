"use client"

import * as React from "react"
import { useAuthStore } from "@/stores"
import { AuthProvider } from "@/components/providers/auth-provider"
import { LoginForm } from "@/components/auth/login-form"
import { ChatPanel } from "@/components/chat/chat-panel"
import { ProjectPanel } from "@/components/project/project-panel"
import { TaskPanel } from "@/components/task/task-panel"
import { KnowledgeBasePanel } from "@/components/knowledge/knowledge-base-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PanelLeftClose, PanelLeftOpen, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { LAYOUT_CONFIG, getSidebarMaxWidth } from "@/config/layout-config"

export default function HomePage() {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore()
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [sidebarWidth, setSidebarWidth] = React.useState(LAYOUT_CONFIG.sidebar.defaultWidth)
  const [isResizing, setIsResizing] = React.useState(false)
  const sidebarRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = e.clientX
      const maxWidth = getSidebarMaxWidth(window.innerWidth)
      if (newWidth >= LAYOUT_CONFIG.sidebar.minWidth && newWidth <= maxWidth) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  return (
    <AuthProvider>
      {isLoading ? (
        <main className="min-h-screen flex items-center justify-center bg-[var(--background)]">
          <div className="text-muted-foreground">加载中...</div>
        </main>
      ) : !isAuthenticated ? (
        <main className="min-h-screen flex items-center justify-center bg-[var(--background)]">
          <LoginForm />
        </main>
      ) : (
        <main className="h-dvh overflow-hidden bg-[var(--background)] flex flex-col">
          {/* 顶部导航 */}
          <header className="bg-[var(--card)] border-b border-[var(--border)] px-6 py-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                >
                  {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
                <div>
                  <h1 className="text-lg font-bold">团队协同智能体</h1>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  欢迎, {user?.username}
                </p>
                <Badge variant={user?.role === "ROOT" ? "destructive" : "secondary"}>
                  {user?.role === "ROOT" ? "管理员" : "员工"}
                </Badge>
                <Button variant="outline" size="sm" onClick={logout}>
                  退出
                </Button>
              </div>
            </div>
          </header>

          {/* 主内容区 - 左右分屏 */}
          <div className="flex-1 flex overflow-hidden">
            {/* 左侧边栏 - 可收起 + 可调整宽度 */}
            <div
              ref={sidebarRef}
              className={cn(
                "border-r border-[var(--border)] bg-[var(--card)] flex flex-col relative",
                sidebarCollapsed ? "w-0 opacity-0 overflow-hidden" : "opacity-100"
              )}
              style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
            >
              <Tabs defaultValue="project" className="flex-1 flex flex-col">
                {/* Tab导航 */}
                <TabsList className="grid grid-cols-3 mx-4 mt-4">
                  <TabsTrigger value="project">项目</TabsTrigger>
                  <TabsTrigger value="task">任务</TabsTrigger>
                  <TabsTrigger value="knowledge">知识</TabsTrigger>
                </TabsList>

                {/* Tab内容 - overflow-hidden 让子组件自己处理滚动 */}
                <div className="flex-1 overflow-hidden p-4">
                  <TabsContent value="project" className="h-full mt-0">
                    <ProjectPanel />
                  </TabsContent>

                  <TabsContent value="task" className="h-full mt-0">
                    <TaskPanel />
                  </TabsContent>

                  <TabsContent value="knowledge" className="h-full mt-0">
                    <KnowledgeBasePanel />
                  </TabsContent>
                </div>
              </Tabs>

              {/* 拖拽调整宽度的手柄 - 垂直居中 */}
              {!sidebarCollapsed && (
                <div
                  className="absolute right-0 top-[50%] -translate-y-[50%] -mr-3 flex items-center justify-center cursor-col-resize z-10 group"
                  style={{
                    width: LAYOUT_CONFIG.resizeHandle.width,
                    height: LAYOUT_CONFIG.resizeHandle.height,
                  }}
                  onMouseDown={() => setIsResizing(true)}
                >
                  {/* 拖拽按钮 */}
                  <div className="w-full h-full rounded-md bg-muted border border-border flex items-center justify-center group-hover:bg-primary/10 group-hover:border-primary/30 transition-colors shadow-sm">
                    <GripVertical className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              )}
            </div>

            {/* 右侧聊天区域 - 始终占满剩余空间 */}
            <div className="flex-1 flex flex-col min-w-0">
              <ChatPanel className="flex-1" />
            </div>
          </div>
        </main>
      )}
    </AuthProvider>
  )
}
