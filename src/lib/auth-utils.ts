import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { generateToken } from "./auth"
import type { User } from "@prisma/client"

export function formatUserResponse(user: User) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  }
}

export function createAuthResponse(user: User) {
  const token = generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
  })

  return NextResponse.json({
    success: true,
    data: {
      token,
      user: formatUserResponse(user),
    },
  })
}

export function createSuccessResponse(data: unknown) {
  return NextResponse.json({
    success: true,
    data,
  })
}

export function createErrorResponse(error: string, status: number = 400) {
  return NextResponse.json(
    { success: false, error },
    { status }
  )
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}
