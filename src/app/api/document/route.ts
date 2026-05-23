import { NextRequest, NextResponse } from "next/server"
import { DOC_STATUS } from "@/constants/doc-status"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get("projectId")

    return NextResponse.json({
      success: true,
      data: [],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, name, type, filePath, tags } = body

    const document = {
      id: crypto.randomUUID(),
      projectId,
      name,
      type,
      filePath,
      tags: tags || [],
      status: DOC_STATUS.PENDING,
      version: 1,
      vectorIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      data: document,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create document" },
      { status: 500 }
    )
  }
}
