export interface ValidationResult {
  valid: boolean
  error?: string
}

export function validateUsername(username: unknown): ValidationResult {
  if (!username || typeof username !== "string") {
    return { valid: false, error: "用户名必填" }
  }

  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: "用户名长度必须在 3-20 个字符之间" }
  }

  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
    return { valid: false, error: "用户名只能包含字母、数字、下划线和中文" }
  }

  return { valid: true }
}

export function validatePassword(password: unknown): ValidationResult {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "密码必填" }
  }

  if (password.length < 6) {
    return { valid: false, error: "密码长度至少 6 个字符" }
  }

  if (password.length > 50) {
    return { valid: false, error: "密码长度不能超过 50 个字符" }
  }

  return { valid: true }
}

export function validateEmail(email: unknown): ValidationResult {
  if (!email) {
    return { valid: true }
  }

  if (typeof email !== "string") {
    return { valid: false, error: "邮箱格式不正确" }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: "邮箱格式不正确" }
  }

  return { valid: true }
}

export function validateLoginInput(
  username: unknown,
  password: unknown
): ValidationResult {
  const usernameResult = validateUsername(username)
  if (!usernameResult.valid) return usernameResult

  const passwordResult = validatePassword(password)
  if (!passwordResult.valid) return passwordResult

  return { valid: true }
}

export function validateRegisterInput(
  username: unknown,
  password: unknown,
  email?: unknown
): ValidationResult {
  const loginResult = validateLoginInput(username, password)
  if (!loginResult.valid) return loginResult

  if (email !== undefined) {
    const emailResult = validateEmail(email)
    if (!emailResult.valid) return emailResult
  }

  return { valid: true }
}
