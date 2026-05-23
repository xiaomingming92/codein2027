import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { getAuditLogs, type AuditAction, type TargetType } from "@/services/audit-log"

export async function GET(request: NextRequest) {
  try {
    const authResult = requireRole(request, ["ROOT", "STAFF"])

    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)

    const filters = {
      userId: searchParams.get("userId") || undefined,
      action: searchParams.get("action") as AuditAction | undefined,
      targetType: searchParams.get("targetType") as TargetType | undefined,
      targetId: searchParams.get("targetId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    }

    const logs = await getAuditLogs(filters)

    return NextResponse.json({
      success: true,
      data: logs,
    })
  } catch (error) {
    console.error("Get audit logs error:", error)
    return NextResponse.json(
      { success: false, error: "获取审计日志失败" },
      { status: 500 }
    )
  }
}
