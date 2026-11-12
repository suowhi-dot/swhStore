import {Router} from 'express'
import {query} from '../db.js'
import {requireAuth} from '../auth.js'
import {
  asyncHandler, canvasDetail, canvasSummary, clampLimit, httpError, parseJson, toInt
} from '../utils.js'

const router = Router()
router.use(requireAuth)

const ownedCanvas = async (id, userId) => {
  const rows = await query('SELECT * FROM canvases WHERE id = ? AND user_id = ? LIMIT 1', [id, userId])
  if (!rows.length) throw httpError(404, '画布不存在')
  return rows[0]
}

const validateElements = (value) => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw httpError(400, 'elements 必须是数组')
  return value
}

router.get('/', asyncHandler(async (req, res) => {
  const limit = clampLimit(req.query.limit, 20, 100)
  const offset = Math.max(0, toInt(req.query.offset, 0))
  const rows = await query(
    'SELECT id, name, background, thumbnail, is_public, created_at, updated_at FROM canvases WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?',
    [req.auth.sub, limit, offset]
  )
  const countRows = await query('SELECT COUNT(*) AS total FROM canvases WHERE user_id = ?', [req.auth.sub])
  res.json({items: rows.map(canvasSummary), total: countRows[0].total, limit, offset})
}))

router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '未命名画布').trim() || '未命名画布'
  const background = String(req.body.background || '#ffffff').trim() || '#ffffff'
  const elements = validateElements(req.body.elements)
  if (name.length > 160) throw httpError(400, '画布名称过长')

  const result = await query(
    'INSERT INTO canvases (user_id, name, background, content) VALUES (?, ?, ?, ?)',
    [req.auth.sub, name, background, JSON.stringify(elements || [])]
  )
  const rows = await query('SELECT * FROM canvases WHERE id = ? LIMIT 1', [result.insertId])
  res.status(201).json({canvas: canvasDetail(rows[0])})
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)
  res.json({canvas: canvasDetail(row)})
}))

router.put('/:id', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)
  const updates = []
  const params = []

  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim()
    if (!name || name.length > 160) throw httpError(400, '画布名称不合法')
    updates.push('name = ?')
    params.push(name)
  }

  if (req.body.background !== undefined) {
    const background = String(req.body.background || '').trim()
    if (!background || background.length > 32) throw httpError(400, '背景色不合法')
    updates.push('background = ?')
    params.push(background)
  }

  const elements = validateElements(req.body.elements)
  if (elements !== undefined) {
    updates.push('content = ?')
    params.push(JSON.stringify(elements))
  }

  if (req.body.thumbnail !== undefined) {
    const thumbnail = req.body.thumbnail
    if (thumbnail !== null && typeof thumbnail !== 'string') throw httpError(400, '缩略图格式不正确')
    if (thumbnail && thumbnail.length > 4000000) throw httpError(400, '缩略图过大')
    updates.push('thumbnail = ?')
    params.push(thumbnail || null)
  }

  if (req.body.isPublic !== undefined) {
    updates.push('is_public = ?')
    params.push(req.body.isPublic ? 1 : 0)
  }

  if (!updates.length) throw httpError(400, '没有需要更新的字段')

  params.push(row.id)
  await query(`UPDATE canvases SET ${updates.join(', ')} WHERE id = ?`, params)
  const rows = await query('SELECT * FROM canvases WHERE id = ? LIMIT 1', [row.id])
  res.json({canvas: canvasDetail(rows[0])})
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)
  await query('DELETE FROM canvases WHERE id = ?', [row.id])
  res.json({ok: true})
}))

router.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)
  const name = `${row.name} 副本`.slice(0, 160)
  const result = await query(
    'INSERT INTO canvases (user_id, name, background, content, thumbnail, is_public) VALUES (?, ?, ?, ?, ?, 0)',
    [req.auth.sub, name, row.background, row.content, row.thumbnail]
  )
  const rows = await query('SELECT * FROM canvases WHERE id = ? LIMIT 1', [result.insertId])
  res.status(201).json({canvas: canvasDetail(rows[0])})
}))

const SHARE_PERMISSIONS = ['view', 'copy', 'edit']

const randomShareCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

const generateShareCode = async () => {
  for (let i = 0; i < 12; i++) {
    const code = randomShareCode()
    const rows = await query('SELECT id FROM canvases WHERE share_code = ? LIMIT 1', [code])
    if (!rows.length) return code
  }
  throw httpError(500, '生成分享码失败，请重试')
}

router.get('/:id/share', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)
  res.json({
    shared: !!(row.is_public && row.share_code),
    code: row.share_code || null,
    permission: row.share_permission || 'view',
    linkPath: `/s/${row.id}`
  })
}))

router.post('/:id/share', asyncHandler(async (req, res) => {
  const row = await ownedCanvas(req.params.id, req.auth.sub)

  if (req.body.enabled === false || req.body.shared === false) {
    await query('UPDATE canvases SET is_public = 0, share_code = NULL WHERE id = ?', [row.id])
    return res.json({shared: false})
  }

  const permission = req.body.permission || row.share_permission || 'view'
  if (!SHARE_PERMISSIONS.includes(permission)) throw httpError(400, '分享权限不合法')

  let code = String(req.body.code || '').trim().toUpperCase()
  if (code) {
    if (!/^[A-Z0-9]{4,12}$/.test(code)) throw httpError(400, '分享码需为 4-12 位字母或数字')
    const taken = await query('SELECT id FROM canvases WHERE share_code = ? AND id <> ? LIMIT 1', [code, row.id])
    if (taken.length) throw httpError(409, '分享码已被使用，请换一个')
  } else {
    code = row.share_code || await generateShareCode()
  }

  await query(
    'UPDATE canvases SET is_public = 1, share_code = ?, share_permission = ? WHERE id = ?',
    [code, permission, row.id]
  )
  res.json({shared: true, code, permission, linkPath: `/s/${row.id}`})
}))

export default router
