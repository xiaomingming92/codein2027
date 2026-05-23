import { NextRequest, NextResponse } from "next/server"
import { canChangeTaskStatus } from "@/lib/transitions"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { fromStatus, toStatus, userRole } = body

    const ability = canChangeTaskStatus(
      fromStatus,
      toStatus,
      userRole || "STAFF"
    )

    if (!ability.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: ability.reason,
          suggestions: ability.suggestions,
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: toStatus,
        previousStatus: fromStatus,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update task status" },
      { status: 500 }
    )
  }
}
