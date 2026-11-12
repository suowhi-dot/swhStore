import {Router} from 'express'
import bcrypt from 'bcryptjs'
import {query} from '../db.js'
import {requireAuth, signToken} from '../auth.js'
import {asyncHandler, httpError, isEmail, normalizeEmail, publicUser} from '../utils.js'

const router = Router()

router.post('/register', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')
  const nickname = String(req.body.nickname || '').trim()

  if (!isEmail(email)) throw httpError(400, '请输入有效的邮箱地址')
  if (password.length < 6 || password.length > 72) throw httpError(400, '密码长度需为 6-72 位')
  if (!nickname) throw httpError(400, '请输入昵称')
  if (nickname.length > 80) throw httpError(400, '昵称过长')

  const existing = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
  if (existing.length) throw httpError(409, '该邮箱已注册')

  const passwordHash = await bcrypt.hash(password, 10)
  const result = await query(
    'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)',
    [email, passwordHash, nickname]
  )
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [result.insertId])
  const user = publicUser(rows[0])
  res.status(201).json({token: signToken(user), user})
}))

router.post('/login', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const password = String(req.body.password || '')
  if (!isEmail(email) || !password) throw httpError(400, '请输入邮箱和密码')

  const rows = await query('SELECT * FROM users WHERE email = ? LIMIT 1', [email])
  if (!rows.length) throw httpError(401, '邮箱或密码不正确')
  const ok = await bcrypt.compare(password, rows[0].password_hash)
  if (!ok) throw httpError(401, '邮箱或密码不正确')

  const user = publicUser(rows[0])
  res.json({token: signToken(user), user})
}))

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.auth.sub])
  if (!rows.length) throw httpError(401, '账号不存在')
  res.json({user: publicUser(rows[0])})
}))

router.put('/me', requireAuth, asyncHandler(async (req, res) => {
  const updates = []
  const params = []

  if (req.body.nickname !== undefined) {
    const nickname = String(req.body.nickname || '').trim()
    if (!nickname || nickname.length > 80) throw httpError(400, '昵称不合法')
    updates.push('nickname = ?')
    params.push(nickname)
  }

  if (req.body.password !== undefined) {
    const password = String(req.body.password || '')
    if (password.length < 6 || password.length > 72) throw httpError(400, '密码长度需为 6-72 位')
    updates.push('password_hash = ?')
    params.push(await bcrypt.hash(password, 10))
  }

  if (!updates.length) throw httpError(400, '没有需要更新的字段')
  params.push(req.auth.sub)
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params)
  const rows = await query('SELECT * FROM users WHERE id = ? LIMIT 1', [req.auth.sub])
  res.json({user: publicUser(rows[0])})
}))

export default router
