"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useModelConfigStore,
  useActiveModel,
} from "@/stores/model-config-store"
import type { ModelInfo, ConnectionStatus } from "@/config/model-config"

function connectionStatusColor(status?: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
    case "connect_failed":
      return "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
    case "invoke_failed":
      return "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.6)]"
    default:
      return "bg-gray-400"
  }
}

function connectionStatusLabel(status?: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "已连接"
    case "connect_failed":
      return "连接失败"
    case "invoke_failed":
      return "调用失败"
    default:
      return "未测试"
  }
}

function StatusIndicator({ status, testing }: { status?: ConnectionStatus; testing: boolean }) {
  if (testing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-400 animate-pulse" />
        <span className="text-xs text-muted-foreground">测试中...</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${connectionStatusColor(status)}`} />
      <span className="text-xs text-muted-foreground">{connectionStatusLabel(status)}</span>
    </span>
  )
}

interface ModelFormState {
  name: string
  provider: "cloud" | "ollama"
  providerLabel: string
  baseURL: string
  model: string
  apiKey: string
  temperature: string
  maxTokens: string
  multimodal: boolean
}

interface ModelManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelManagerDialog({ open, onOpenChange }: ModelManagerDialogProps) {
  const models = useModelConfigStore((s) => s.models)
  const customModels = useModelConfigStore((s) => s.customModels)
  const testingModelId = useModelConfigStore((s) => s.testingModelId)
  const ollamaTemplates = useModelConfigStore((s) => s.ollamaTemplates)
  const ollamaDefaults = useModelConfigStore((s) => s.ollamaDefaults)
  const addCustomModel = useModelConfigStore((s) => s.addCustomModel)
  const removeCustomModel = useModelConfigStore((s) => s.removeCustomModel)
  const updateCustomModel = useModelConfigStore((s) => s.updateCustomModel)
  const testModelConnection = useModelConfigStore((s) => s.testModelConnection)

  const defaultFormState: ModelFormState = React.useMemo(() => ({
    name: "",
    provider: "ollama",
    providerLabel: "Ollama",
    baseURL: ollamaDefaults.baseURL,
    model: "",
    apiKey: "",
    temperature: String(ollamaDefaults.temperature),
    maxTokens: String(ollamaDefaults.maxTokens),
    multimodal: ollamaDefaults.multimodal,
  }), [ollamaDefaults])

  const [showAddForm, setShowAddForm] = React.useState(false)
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null)
  const [formState, setFormState] = React.useState<ModelFormState>(defaultFormState)
  const [formError, setFormError] = React.useState<string | null>(null)

  const cloudModels = React.useMemo(
    () => models.map((m) => ({ ...m, isBuiltin: true })),
    [models]
  )
  const localModels = React.useMemo(
    () => customModels.map((m) => ({ ...m, isBuiltin: false })),
    [customModels]
  )

  function resetForm() {
    setFormState(defaultFormState)
    setFormError(null)
    setShowAddForm(false)
    setEditingModelId(null)
  }

  function startAddModel() {
    setFormState(defaultFormState)
    setFormError(null)
    setShowAddForm(true)
    setEditingModelId(null)
  }

  function startAddFromTemplate(template: { model: string; name: string; providerLabel: string; multimodal?: boolean }) {
    setFormState({
      name: template.name,
      provider: "ollama",
      providerLabel: template.providerLabel,
      baseURL: ollamaDefaults.baseURL,
      model: template.model,
      apiKey: "",
      temperature: String(ollamaDefaults.temperature),
      maxTokens: String(ollamaDefaults.maxTokens),
      multimodal: template.multimodal ?? ollamaDefaults.multimodal,
    })
    setFormError(null)
    setShowAddForm(true)
    setEditingModelId(null)
  }

  function startEditModel(model: ModelInfo & { isBuiltin?: boolean }) {
    if (model.isBuiltin) return
    setEditingModelId(model.id)
    setShowAddForm(true)
    setFormState({
      name: model.name,
      provider: model.provider,
      providerLabel: model.providerLabel,
      baseURL: model.baseURL,
      model: model.model,
      apiKey: model.apiKey || "",
      temperature: String(model.temperature),
      maxTokens: String(model.maxTokens),
      multimodal: model.multimodal,
    })
    setFormError(null)
  }

  function handleProviderChange(provider: "cloud" | "ollama") {
    const updates: Partial<ModelFormState> = { provider }
    if (provider === "ollama") {
      updates.providerLabel = "Ollama"
      updates.baseURL = ollamaDefaults.baseURL
      updates.temperature = String(ollamaDefaults.temperature)
      updates.maxTokens = String(ollamaDefaults.maxTokens)
    } else {
      updates.providerLabel = "云端模型"
      updates.baseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    }
    setFormState((prev) => ({ ...prev, ...updates }))
  }

  function handleSubmit() {
    if (!formState.name.trim()) {
      setFormError("请输入模型名称")
      return
    }
    if (!formState.baseURL.trim()) {
      setFormError("请输入服务地址")
      return
    }
    if (!formState.model.trim()) {
      setFormError("请输入模型标识")
      return
    }

    const temperature = parseFloat(formState.temperature)
    const maxTokens = parseInt(formState.maxTokens, 10)

    if (isNaN(temperature) || temperature < 0 || temperature > 2) {
      setFormError("Temperature 必须在 0~2 之间")
      return
    }
    if (isNaN(maxTokens) || maxTokens < 1) {
      setFormError("Max Tokens 必须为正整数")
      return
    }

    if (editingModelId) {
      updateCustomModel(editingModelId, {
        name: formState.name.trim(),
        provider: formState.provider,
        providerLabel: formState.providerLabel,
        baseURL: formState.baseURL.trim(),
        model: formState.model.trim(),
        apiKey: formState.provider === "cloud" ? formState.apiKey || undefined : undefined,
        temperature,
        maxTokens,
        multimodal: formState.multimodal,
        connectionStatus: "unknown",
      })
    } else {
      const id = `custom-${formState.provider}-${formState.model.trim()}-${Date.now()}`
      addCustomModel({
        id,
        name: formState.name.trim(),
        provider: formState.provider,
        providerLabel: formState.providerLabel,
        baseURL: formState.baseURL.trim(),
        model: formState.model.trim(),
        apiKey: formState.provider === "cloud" ? formState.apiKey || undefined : undefined,
        temperature,
        maxTokens,
        multimodal: formState.multimodal,
        connectionStatus: "unknown",
      })
    }

    resetForm()
  }

  async function handleTest(model: ModelInfo) {
    await testModelConnection(model)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>模型管理</DialogTitle>
          <DialogDescription>
            管理云端和本地模型服务。本地模型可自由添加、编辑和测试连通性。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              云端模型
              <span className="text-[10px] font-normal text-muted-foreground">
                (配置来源: model.toml)
              </span>
            </h3>
            {cloudModels.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                暂无云端模型。请在 src/config/model.toml 中配置 [[cloud]] 条目。
              </p>
            ) : (
              <div className="space-y-2">
                {cloudModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-black dark:bg-blue-900/40 dark:text-blue-200 shrink-0">
                        {m.providerLabel}
                      </span>
                      {m.multimodal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-black dark:bg-amber-900/40 dark:text-amber-200 shrink-0">
                          多模态
                        </span>
                      )}
                      <StatusIndicator
                        status={m.connectionStatus}
                        testing={testingModelId === m.id}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 ml-2"
                      disabled={testingModelId === m.id}
                      onClick={() => handleTest(m)}
                    >
                      {testingModelId === m.id ? "测试中..." : "测试"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              本地模型
            </h3>
            {localModels.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                暂无本地模型。从下方模板快速添加，或手动填写。
              </p>
            ) : (
              <div className="space-y-2">
                {localModels.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div
                      className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                      onClick={() => startEditModel(m)}
                    >
                      <span className="text-sm font-medium truncate">{m.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-black dark:bg-purple-900/40 dark:text-purple-200 shrink-0">
                        {m.providerLabel}
                      </span>
                      {m.multimodal && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-black dark:bg-amber-900/40 dark:text-amber-200 shrink-0">
                          多模态
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground truncate">
                        {m.baseURL}
                      </span>
                      <StatusIndicator
                        status={m.connectionStatus}
                        testing={testingModelId === m.id}
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={testingModelId === m.id}
                        onClick={() => handleTest(m)}
                      >
                        {testingModelId === m.id ? "测试中..." : "测试"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeCustomModel(m.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ollamaTemplates.length > 0 && !showAddForm && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">快捷添加 (来自 model.toml 模板):</p>
                <div className="flex flex-wrap gap-2">
                  {ollamaTemplates.map((t) => (
                    <Button
                      key={t.model}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => startAddFromTemplate(t)}
                    >
                      + {t.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {!showAddForm && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={startAddModel}
              >
                + 手动添加模型
              </Button>
            )}
          </div>

          {showAddForm && (
            <div className="border rounded-md p-4 space-y-4 bg-muted/30">
              <h4 className="text-sm font-semibold">
                {editingModelId ? "编辑模型" : "添加模型"}
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">模型类型</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={formState.provider === "ollama" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleProviderChange("ollama")}
                    >
                      Ollama
                    </Button>
                    <Button
                      variant={formState.provider === "cloud" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleProviderChange("cloud")}
                    >
                      云端 API
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">供应商名称</Label>
                  <Input
                    value={formState.providerLabel}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, providerLabel: e.target.value }))
                    }
                    placeholder="如: Ollama, vLLM"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">模型名称</Label>
                  <Input
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="如: Qwen 2.5 7B"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">模型标识</Label>
                  <Input
                    value={formState.model}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, model: e.target.value }))
                    }
                    placeholder="如: qwen2.5, llama3"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">服务地址</Label>
                <Input
                  value={formState.baseURL}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, baseURL: e.target.value }))
                  }
                  placeholder={
                    formState.provider === "ollama"
                      ? ollamaDefaults.baseURL
                      : "https://api.openai.com/v1"
                  }
                  className="h-8 text-xs"
                />
              </div>

              {formState.provider === "cloud" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  <Input
                    type="password"
                    value={formState.apiKey}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, apiKey: e.target.value }))
                    }
                    placeholder="sk-..."
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={formState.temperature}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, temperature: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Tokens</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formState.maxTokens}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, maxTokens: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="multimodal-toggle"
                  checked={formState.multimodal}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, multimodal: e.target.checked }))
                  }
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <Label htmlFor="multimodal-toggle" className="text-xs cursor-pointer">
                  多模态 (支持图片输入)
                </Label>
              </div>

              {formError && (
                <p className="text-xs text-destructive">{formError}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  取消
                </Button>
                <Button size="sm" onClick={handleSubmit}>
                  {editingModelId ? "保存" : "添加"}
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1 align-middle" />
              绿灯 = 连接成功，模型可正常调用
            </p>
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1 align-middle" />
              红灯 = 无法连接，请检查服务地址和网络
            </p>
            <p>
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 mr-1 align-middle" />
              黄灯 = 已连接但调用失败，请检查模型名称和参数
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
