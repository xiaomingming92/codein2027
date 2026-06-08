export const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"

export const CHROMA_PORT = process.env.CHROMA_PORT || "8000"

export const CHROMA_URL = process.env.CHROMA_URL || `http://${CHROMA_HOST}:${CHROMA_PORT}`

export const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || "farm_agent"

export const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

export function getChromaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (CHROMA_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${CHROMA_AUTH_TOKEN}`
  }

  return headers
}

export function getChromaConfigInfo() {
  return {
    url: CHROMA_URL,
    collection: CHROMA_COLLECTION,
    hasAuth: !!CHROMA_AUTH_TOKEN,
  }
}