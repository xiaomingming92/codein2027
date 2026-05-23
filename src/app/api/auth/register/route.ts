import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  createAuthResponse,
  createErrorResponse,
  hashPassword,
} from "@/lib/auth-utils"
import { validateRegisterInput } from "@/lib/auth-validation"

export async function POST(request: NextRequest) {
  try {
    const { username, password, email } = await request.json()

    const validation = validateRegisterInput(username, password, email)
    if (!validation.valid) {
      return createErrorResponse(validation.error!, 400)
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : []),
        ],
      },
    })

    if (existingUser) {
      return createErrorResponse("用户名或邮箱已存在", 409)
    }

    const hashedPassword = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        username,
        email: email || `${username}@example.com`,
        password: hashedPassword,
        role: "STAFF",
      },
    })

    return createAuthResponse(user)
  } catch (error) {
    console.error("Register error:", error)
    return createErrorResponse("注册失败", 500)
  }
}
