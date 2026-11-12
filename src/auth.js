import jwt from 'jsonwebtoken'
import {httpError} from './utils.js'

const secret = () => process.env.JWT_SECRET || 'shenghua-dev-secret'

export const signToken = (user) => jwt.sign(
  {sub: user.id, email: user.email},
  secret(),
  {expiresIn: process.env.JWT_EXPIRES_IN || '7d'}
)

export const verifyToken = (token) => jwt.verify(token, secret())

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return next(httpError(401, '未登录'))
  try {
    req.auth = verifyToken(token)
    next()
  } catch (err) {
    next(httpError(401, '登录已过期，请重新登录'))
  }
}

export const signShareToken = (canvasId, permission) => jwt.sign(
  {share: canvasId, perm: permission},
  secret(),
  {expiresIn: '12h'}
)

export const requireShare = (req, res, next) => {
  const token = req.headers['x-share-token'] || ''
  if (!token) return next(httpError(401, '缺少分享凭证，请重新输入分享码'))
  try {
    const payload = jwt.verify(token, secret())
    if (!payload.share) throw new Error('invalid share token')
    req.share = payload
    next()
  } catch (err) {
    next(httpError(401, '分享凭证已失效，请重新输入分享码'))
  }
}
