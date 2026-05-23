import jwt from "jsonwebtoken"
import { NextRequest } from "next/server"

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key"

export interface JWTPayload {
  userId: string
  username: string
  role: "ROOT" | "STAFF"
  department?: string
  iat?: number
  exp?: number
}

export function generateToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export function extractTokenFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization")
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }
  return null
}

export function getUserFromRequest(request: NextRequest): JWTPayload | null {
  const token = extractTokenFromRequest(request)
  if (!token) return null
  return verifyToken(token)
}

export function requireAuth(
  request: NextRequest
): { authorized: true; user: JWTPayload } | { authorized: false; error: string } {
  const token = extractTokenFromRequest(request)

  if (!token) {
    return { authorized: false, error: "未提供认证令牌" }
  }

  const payload = verifyToken(token)

  if (!payload) {
    return { authorized: false, error: "无效或过期的令牌" }
  }

  return { authorized: true, user: payload }
}

export function requireRole(
  request: NextRequest,
  allowedRoles: Array<"ROOT" | "STAFF">
): { authorized: true; user: JWTPayload } | { authorized: false; error: string } {
  const authResult = requireAuth(request)

  if (!authResult.authorized) {
    return authResult
  }

  if (!allowedRoles.includes(authResult.user.role)) {
    return {
      authorized: false,
      error: `需要 ${allowedRoles.join(" 或 ")} 权限`,
    }
  }

  return authResult
}
