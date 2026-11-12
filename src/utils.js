export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next)

export const httpError = (status, message) => {
  const error = new Error(message)
  error.status = status
  return error
}

export const parseJson = (text, fallback) => {
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch (err) {
    return fallback
  }
}

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const clampLimit = (value, fallback = 20, max = 100) => {
  const parsed = toInt(value, fallback)
  if (parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export const publicUser = (row) => {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const canvasSummary = (row) => ({
  id: row.id,
  name: row.name,
  background: row.background,
  thumbnail: row.thumbnail || null,
  isPublic: !!row.is_public,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const canvasDetail = (row) => ({
  ...canvasSummary(row),
  elements: parseJson(row.content, [])
})
