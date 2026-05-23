"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { modelConfigAudit } from "@/lib/model-config-logger"
import type { ModelInfo, ModelProvider, ConnectionStatus, OllamaTemplate } from "@/config/model-config"

export type { ModelInfo, ModelProvider, ConnectionStatus, OllamaTemplate }

interface ModelConfigState {
  models: ModelInfo[]
  activeModelId: string
  customModels: ModelInfo[]
  testingModelId: string | null
  ollamaTemplates: OllamaTemplate[]
  ollamaDefaults: { baseURL: string; temperature: number; maxTokens: number; multimodal: boolean }
  initialized: boolean
  initialize: () => Promise<void>
  setActiveModel: (id: string) => void
  addCustomModel: (model: ModelInfo) => void
  removeCustomModel: (id: string) => void
  updateCustomModel: (id: string, updates: Partial<ModelInfo>) => void
  updateModelStatus: (id: string, status: ConnectionStatus) => void
  testModelConnection: (model: ModelInfo) => Promise<ConnectionStatus>
}

export const useModelConfigStore = create<ModelConfigState>()(
  persist(
    (set, get) => ({
      models: [],
      activeModelId: "",
      customModels: [],
      testingModelId: null,
      ollamaTemplates: [],
      ollamaDefaults: { baseURL: "http://localhost:11434", temperature: 0.3, maxTokens: 4000, multimodal: false },
      initialized: false,

      initialize: async () => {
        if (get().initialized) return

        try {
          const response = await fetch("/api/model/list")
          if (!response.ok) throw new Error(`HTTP ${response.status}`)

          const data = await response.json()
          const serverModels: ModelInfo[] = data.models || []
          const templates: OllamaTemplate[] = data.ollamaTemplates || []
          const defaults = data.ollamaDefaults || { baseURL: "http://localhost:11434", temperature: 0.3, maxTokens: 4000, multimodal: false }

          const currentActiveId = get().activeModelId
          const currentCustom = get().customModels

          const firstModelId = serverModels.length > 0 ? serverModels[0].id : ""

          set({
            models: serverModels,
            activeModelId: currentActiveId || firstModelId,
            ollamaTemplates: templates,
            ollamaDefaults: defaults,
            initialized: true,
          })

          if (currentCustom.length > 0) {
            set({ customModels: currentCustom })
          }

          const allModels = [...serverModels, ...currentCustom]
          if (currentActiveId && !allModels.some((m) => m.id === currentActiveId)) {
            set({ activeModelId: firstModelId })
          }

          modelConfigAudit("MODEL_CONFIG_FETCH", `模型列表初始化完成: ${serverModels.length} 个云端模型`, {
            cloudModelCount: serverModels.length,
            customModelCount: currentCustom.length,
            ollamaTemplateCount: templates.length,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error("[MODEL-CONFIG-STORE] Failed to initialize:", errorMessage)
          set({ initialized: true })
        }
      },

      setActiveModel: (id: string) => {
        const previousId = get().activeModelId
        set({ activeModelId: id })

        const model = [...get().models, ...get().customModels].find((m) => m.id === id)
        const previous = [...get().models, ...get().customModels].find((m) => m.id === previousId)
        modelConfigAudit("MODEL_CONFIG_START", `模型切换: ${previousId} → ${id}`, {
          previousModel: previous?.model || previousId,
          newModel: model?.model || id,
          provider: model?.provider || "unknown",
        })
      },

      addCustomModel: (model: ModelInfo) => {
        set((state) => ({
          customModels: [...state.customModels, model],
        }))
        modelConfigAudit("MODEL_CONFIG_APPLY", `添加自定义模型: ${model.name}`, {
          modelId: model.id,
          model: model.model,
          provider: model.provider,
          baseURL: model.baseURL,
        })
      },

      removeCustomModel: (id: string) => {
        const removed = get().customModels.find((m) => m.id === id)
        set((state) => ({
          customModels: state.customModels.filter((m) => m.id !== id),
        }))

        const allModels = [...get().models, ...get().customModels]
        if (get().activeModelId === id && allModels.length > 0) {
          set({ activeModelId: allModels[0].id })
        }

        modelConfigAudit("MODEL_CONFIG_APPLY", `删除自定义模型: ${removed?.name || id}`, {
          modelId: id,
          model: removed?.model,
          provider: removed?.provider,
        })
      },

      updateCustomModel: (id: string, updates: Partial<ModelInfo>) => {
        set((state) => ({
          customModels: state.customModels.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }))
        modelConfigAudit("MODEL_CONFIG_APPLY", `更新自定义模型: ${id}`, {
          modelId: id,
          updatedFields: Object.keys(updates),
        })
      },

      updateModelStatus: (id: string, status: ConnectionStatus) => {
        const isCustom = get().customModels.some((m) => m.id === id)
        if (isCustom) {
          set((state) => ({
            customModels: state.customModels.map((m) =>
              m.id === id ? { ...m, connectionStatus: status } : m
            ),
          }))
        } else {
          set((state) => ({
            models: state.models.map((m) =>
              m.id === id ? { ...m, connectionStatus: status } : m
            ),
          }))
        }
      },

      testModelConnection: async (model: ModelInfo): Promise<ConnectionStatus> => {
        set({ testingModelId: model.id })
        get().updateModelStatus(model.id, "unknown")

        modelConfigAudit("MODEL_CONFIG_START", `开始模型连通性测试: ${model.provider}/${model.model}`, {
          modelId: model.id,
          provider: model.provider,
          model: model.model,
          baseURL: model.baseURL,
        })

        try {
          const response = await fetch("/api/model/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: model.provider,
              baseURL: model.baseURL,
              model: model.model,
              temperature: model.temperature,
              maxTokens: model.maxTokens,
            }),
          })

          const data = await response.json()
          const status: ConnectionStatus = data.status || "connect_failed"

          get().updateModelStatus(model.id, status)

          modelConfigAudit("MODEL_CONFIG_DONE", `模型连通性测试完成: ${data.message}`, {
            modelId: model.id,
            status,
            latencyMs: data.latencyMs,
            detail: data.detail,
          })

          return status
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          get().updateModelStatus(model.id, "connect_failed")

          modelConfigAudit("MODEL_CONFIG_FAIL", `模型连通性测试异常: ${errorMessage}`, {
            modelId: model.id,
            error: errorMessage,
          })

          return "connect_failed"
        } finally {
          set({ testingModelId: null })
        }
      },
    }),
    {
      name: "model-config-storage",
      partialize: (state) => ({
        activeModelId: state.activeModelId,
        customModels: state.customModels,
      }),
    }
  )
)

export function useActiveModel(): ModelInfo | undefined {
  const models = useModelConfigStore((s) => s.models)
  const customModels = useModelConfigStore((s) => s.customModels)
  const activeModelId = useModelConfigStore((s) => s.activeModelId)
  return [...models, ...customModels].find((m) => m.id === activeModelId)
}

export function useEnsureModelInitialized() {
  const initialized = useModelConfigStore((s) => s.initialized)
  const initialize = useModelConfigStore((s) => s.initialize)

  React.useEffect(() => {
    if (!initialized) {
      initialize()
    }
  }, [initialized, initialize])
}

import * as React from "react"
