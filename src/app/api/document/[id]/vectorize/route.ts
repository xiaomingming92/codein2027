import { NextRequest, NextResponse } from "next/server"
import { addDocumentsToCollection } from "@/lib/chroma"
import { DOC_STATUS } from "@/constants/doc-status"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { content, metadata } = body

    if (!content) {
      return NextResponse.json(
        { success: false, error: "Content is required for vectorization" },
        { status: 400 }
      )
    }

    const docId = `doc-${id}-${Date.now()}`
    await addDocumentsToCollection(
      [content],
      [docId],
      [{ docId: id, ...metadata }]
    )

    return NextResponse.json({
      success: true,
      data: {
        documentId: id,
        vectorId: docId,
        status: DOC_STATUS.INDEXED,
      },
    })
  } catch (error) {
    console.error("Vectorization error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to vectorize document" },
      { status: 500 }
    )
  }
}
