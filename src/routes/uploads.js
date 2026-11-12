import {Router} from 'express'
import multer from 'multer'
import {randomUUID} from 'node:crypto'
import {existsSync, mkdirSync, unlinkSync} from 'node:fs'
import {extname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {query} from '../db.js'
import {requireAuth} from '../auth.js'
import {asyncHandler, httpError} from '../utils.js'

const router = Router()
router.use(requireAuth)

const rootDir = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const uploadDir = resolve(rootDir, process.env.UPLOAD_DIR || 'uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, {recursive: true})

const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = extname(file.originalname || '').toLowerCase().slice(0, 10)
    cb(null, `${Date.now()}-${randomUUID()}${ext || '.png'}`)
  }
})

const upload = multer({
  storage,
  limits: {fileSize: 10 * 1024 * 1024},
  fileFilter: (req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(httpError(400, '仅支持 PNG/JPEG/WebP/GIF/SVG 图片'))
    }
    cb(null, true)
  }
})

const mapAsset = (row) => ({
  id: row.id,
  url: `/uploads/${row.filename}`,
  filename: row.filename,
  originalName: row.original_name,
  mime: row.mime,
  size: row.size,
  createdAt: row.created_at
})

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return next(err.status ? err : httpError(400, err.message || '上传失败'))
    next()
  })
}, asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, '请选择要上传的图片')
  const result = await query(
    'INSERT INTO assets (user_id, filename, original_name, mime, size) VALUES (?, ?, ?, ?, ?)',
    [req.auth.sub, req.file.filename, req.file.originalname || req.file.filename, req.file.mimetype, req.file.size]
  )
  const rows = await query('SELECT * FROM assets WHERE id = ? LIMIT 1', [result.insertId])
  res.status(201).json({asset: mapAsset(rows[0])})
}))

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM assets WHERE user_id = ? ORDER BY id DESC LIMIT 200', [req.auth.sub])
  res.json({items: rows.map(mapAsset)})
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT * FROM assets WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.auth.sub]
  )
  if (!rows.length) throw httpError(404, '图片不存在')
  const filePath = join(uploadDir, rows[0].filename)
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch (err) {}
  }
  await query('DELETE FROM assets WHERE id = ?', [rows[0].id])
  res.json({ok: true})
}))

export default router
