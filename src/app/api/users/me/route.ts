import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = requireAuth(request)

    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: authResult.user.userId,
          username: authResult.user.username,
          role: authResult.user.role,
          department: authResult.user.department,
        },
      },
    })
  } catch (error) {
    console.error("Get user error:", error)
    return NextResponse.json(
      { success: false, error: "获取用户信息失败" },
      { status: 500 }
    )
  }
}
