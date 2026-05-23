import { create } from "zustand"

interface Task {
  id: string
  projectId: string
  name: string
  description?: string
  type: "DEVELOPMENT" | "DESIGN" | "TESTING" | "DEPLOYMENT" | "REVIEW" | "OTHER"
  status: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED"
  priority: number
  progress: number
  assigneeId?: string
  parentId?: string
  startDate?: string
  endDate?: string
  createdAt: string
  updatedAt: string
}

interface TaskState {
  tasks: Task[]
  selectedTask: Task | null
  isLoading: boolean
  filter: {
    status?: Task["status"]
    type?: Task["type"]
    assigneeId?: string
  }
  setTasks: (tasks: Task[]) => void
  setSelectedTask: (task: Task | null) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  setFilter: (filter: Partial<TaskState["filter"]>) => void
  setLoading: (loading: boolean) => void
  getTasksByStatus: (status: Task["status"]) => Task[]
  getTasksByProject: (projectId: string) => Task[]
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  isLoading: false,
  filter: {},
  setTasks: (tasks) => set({ tasks }),
  setSelectedTask: (selectedTask) => set({ selectedTask }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
      selectedTask:
        state.selectedTask?.id === id
          ? { ...state.selectedTask, ...updates, updatedAt: new Date().toISOString() }
          : state.selectedTask,
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTask: state.selectedTask?.id === id ? null : state.selectedTask,
    })),
  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),
  setLoading: (isLoading) => set({ isLoading }),
  getTasksByStatus: (status) => get().tasks.filter((t) => t.status === status),
  getTasksByProject: (projectId) => get().tasks.filter((t) => t.projectId === projectId),
}))
