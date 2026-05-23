import { NextResponse } from "next/server"
import { DEFAULT_MODELS, OLLAMA_TEMPLATES, OLLAMA_DEFAULTS } from "@/config/model-config"

export async function GET() {
  return NextResponse.json({
    models: DEFAULT_MODELS,
    ollamaTemplates: OLLAMA_TEMPLATES,
    ollamaDefaults: OLLAMA_DEFAULTS,
  })
}
