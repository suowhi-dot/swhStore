import {Router} from 'express'
import {query} from '../db.js'
import {requireAuth, requireShare, signShareToken} from '../auth.js'
import {asyncHandler, canvasDetail, httpError} from '../utils.js'

const router = Router()

const attempts = new Map()
const allowAttempt = (key) => {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || now - entry.start > 10 * 60 * 1000) {
    attempts.set(key, {start: now, count: 1})
    return true
  }
  entry.count += 1
  return entry.count <= 20
}

const sharedCanvas = async (id) => {
  const rows = await query(
    `SELECT c.*, u.nickname AS owner_nickname
     FROM canvases c JOIN users u ON u.id = c.user_id
     WHERE c.id = ? AND c.is_public = 1 AND c.share_code IS NOT NULL
     LIMIT 1`,
    [id]
  )
  return rows[0] || null
}

router.post('/:id/access', asyncHandler(async (req, res) => {
  const key = `${req.ip}:${req.params.id}`
  if (!allowAttempt(key)) throw httpError(429, '尝试次数过多，请稍后再试')

  const code = String(req.body.code || '').trim().toUpperCase()
  if (!code) throw httpError(400, '请输入分享码')

  const row = await sharedCanvas(req.params.id)
  if (!row || row.share_code !== code) throw httpError(403, '分享码不正确')

  const permission = row.share_permission || 'view'
  res.json({
    canvas: canvasDetail(row),
    permission,
    owner: {nickname: row.owner_nickname},
    shareToken: signShareToken(row.id, permission)
  })
}))

router.get('/:id/with-token', requireShare, asyncHandler(async (req, res) => {
  if (String(req.share.share) !== String(req.params.id)) throw httpError(403, '分享凭证不匹配')
  const row = await sharedCanvas(req.params.id)
  if (!row) throw httpError(404, '分享已关闭')
  const permission = row.share_permission || 'view'
  res.json({
    canvas: canvasDetail(row),
    permission,
    owner: {nickname: row.owner_nickname}
  })
}))

router.put('/:id', requireShare, asyncHandler(async (req, res) => {
  if (String(req.share.share) !== String(req.params.id)) throw httpError(403, '分享凭证不匹配')
  if (req.share.perm !== 'edit') throw httpError(403, '该分享仅允许查看，不能修改')

  const row = await sharedCanvas(req.params.id)
  if (!row) throw httpError(404, '分享已关闭')

  const updates = []
  const params = []

  if (Array.isArray(req.body.elements)) {
    updates.push('content = ?')
    params.push(JSON.stringify(req.body.elements))
  }
  if (req.body.thumbnail === null || typeof req.body.thumbnail === 'string') {
    if (req.body.thumbnail && req.body.thumbnail.length > 4000000) throw httpError(400, '缩略图过大')
    updates.push('thumbnail = ?')
    params.push(req.body.thumbnail || null)
  }
  if (typeof req.body.background === 'string' && req.body.background.trim()) {
    updates.push('background = ?')
    params.push(req.body.background.trim().slice(0, 32))
  }

  if (!updates.length) throw httpError(400, '没有需要更新的字段')
  params.push(row.id)
  await query(`UPDATE canvases SET ${updates.join(', ')} WHERE id = ?`, params)

  const fresh = await query('SELECT * FROM canvases WHERE id = ? LIMIT 1', [row.id])
  res.json({
    canvas: {
      id: fresh[0].id,
      name: fresh[0].name,
      background: fresh[0].background,
      thumbnail: fresh[0].thumbnail || null,
      updatedAt: fresh[0].updated_at
    }
  })
}))

router.post('/:id/copy', requireAuth, requireShare, asyncHandler(async (req, res) => {
  if (String(req.share.share) !== String(req.params.id)) throw httpError(403, '分享凭证不匹配')
  if (req.share.perm !== 'copy') throw httpError(403, '该分享不允许复制')

  const row = await sharedCanvas(req.params.id)
  if (!row) throw httpError(404, '分享已关闭')

  const name = `${row.name} 副本`.slice(0, 160)
  const result = await query(
    'INSERT INTO canvases (user_id, name, background, content, thumbnail, is_public) VALUES (?, ?, ?, ?, ?, 0)',
    [req.auth.sub, name, row.background, row.content, row.thumbnail]
  )
  const fresh = await query('SELECT * FROM canvases WHERE id = ? LIMIT 1', [result.insertId])
  res.status(201).json({canvas: canvasDetail(fresh[0])})
}))

export default router
