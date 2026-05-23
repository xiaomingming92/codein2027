import { NextRequest, NextResponse } from "next/server"

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
      { success: false, error: "Failed to fetch tasks" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId,
      name,
      description,
      type,
      priority,
      assigneeId,
      startDate,
      endDate,
    } = body

    const task = {
      id: crypto.randomUUID(),
      projectId,
      name,
      description,
      type: type || "OTHER",
      status: "PENDING",
      priority: priority || 0,
      assigneeId,
      startDate,
      endDate,
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      data: task,
    })
  } catch (error) {
    console.error("Task creation error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create task" },
      { status: 500 }
    )
  }
}
