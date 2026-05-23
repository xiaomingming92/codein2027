import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  createAuthResponse,
  createErrorResponse,
  verifyPassword,
} from "@/lib/auth-utils"
import { validateLoginInput } from "@/lib/auth-validation"

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    const validation = validateLoginInput(username, password)
    if (!validation.valid) {
      return createErrorResponse(validation.error!, 400)
    }

    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      return createErrorResponse("用户不存在", 401)
    }

    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      return createErrorResponse("密码错误", 401)
    }

    return createAuthResponse(user)
  } catch (error) {
    console.error("Login error:", error)
    return createErrorResponse("登录失败", 500)
  }
}
