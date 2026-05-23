"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useModelConfigStore, useActiveModel, useEnsureModelInitialized } from "@/stores/model-config-store"
import type { ConnectionStatus } from "@/config/model-config"
import { ModelManagerDialog } from "./model-manager-dialog"

function providerBadgeColor(provider: string): string {
  switch (provider) {
    case "cloud":
      return "bg-black-600 text-white dark:bg-blue-900/40 dark:text-pink-200"
    case "ollama":
      return "bg-purple-100 text-black dark:bg-purple-900/40 dark:text-purple-200"
    default:
      return "bg-gray-100 text-black dark:bg-gray-800 dark:text-gray-200"
  }
}

function statusDotClass(status?: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-green-500"
    case "connect_failed":
      return "bg-red-500"
    case "invoke_failed":
      return "bg-yellow-500"
    default:
      return "bg-gray-400"
  }
}

export function ModelSelector() {
  useEnsureModelInitialized()

  const models = useModelConfigStore((s) => s.models)
  const customModels = useModelConfigStore((s) => s.customModels)
  const activeModelId = useModelConfigStore((s) => s.activeModelId)
  const setActiveModel = useModelConfigStore((s) => s.setActiveModel)
  const activeModel = useActiveModel()

  const [managerOpen, setManagerOpen] = React.useState(false)

  const allModels = React.useMemo(() => [...models, ...customModels], [models, customModels])
  const cloudModels = React.useMemo(() => allModels.filter((m) => m.provider === "cloud"), [allModels])
  const ollamaModels = React.useMemo(() => allModels.filter((m) => m.provider === "ollama"), [allModels])
  const customOnlyModels = React.useMemo(() => customModels, [customModels])

  return (
    <>
      <div className="flex items-center gap-1">
        <Select value={activeModelId} onValueChange={setActiveModel}>
          <SelectTrigger className="h-7 text-xs w-auto min-w-[130px] max-w-[200px] gap-1">
            <SelectValue placeholder="选择模型">
              {activeModel && (
                <span className="flex items-center gap-1.5 truncate">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(activeModel.connectionStatus)}`} />
                  <span className="truncate">{activeModel.model}</span>
                  <span className={`text-[10px] px-1 rounded shrink-0 ${providerBadgeColor(activeModel.provider)}`}>
                    {activeModel.providerLabel}
                  </span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">云端模型</SelectLabel>
              {cloudModels.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-xs text-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(model.connectionStatus)}`} />
                    <span className="text-foreground">{model.name}</span>
                    <span className={`text-[10px] px-1 rounded shrink-0 ${providerBadgeColor(model.provider)}`}>
                      {model.providerLabel}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">本地模型</SelectLabel>
              {ollamaModels.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-xs text-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(model.connectionStatus)}`} />
                    <span className="text-foreground">{model.name}</span>
                    <span className={`text-[10px] px-1 rounded shrink-0 ${providerBadgeColor(model.provider)}`}>
                      {model.providerLabel}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
            {customOnlyModels.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">自定义</SelectLabel>
                {customOnlyModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-xs text-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(model.connectionStatus)}`} />
                      <span className="text-foreground">{model.name}</span>
                      <span className={`text-[10px] px-1 rounded shrink-0 ${providerBadgeColor(model.provider)}`}>
                        {model.providerLabel}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-[20px] cursor-pointer"
          onClick={() => setManagerOpen(true)}
          title="模型管理"
        >
          ⚙
        </Button>
      </div>

      <ModelManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  )
}
