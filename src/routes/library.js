import {Router} from 'express'
import {query} from '../db.js'
import {requireAuth} from '../auth.js'
import {asyncHandler, httpError, parseJson} from '../utils.js'

const router = Router()
router.use(requireAuth)

const mapItem = (row) => ({
  id: row.id,
  name: row.name,
  data: parseJson(row.data, null),
  createdAt: row.created_at
})

router.get('/', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT * FROM library_items WHERE user_id = ? ORDER BY id DESC LIMIT 200',
    [req.auth.sub]
  )
  res.json({items: rows.map(mapItem)})
}))

router.post('/', asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (name.length > 160) throw httpError(400, '素材名称过长')
  if (req.body.data === undefined) throw httpError(400, '缺少素材数据')

  const result = await query(
    'INSERT INTO library_items (user_id, name, data) VALUES (?, ?, ?)',
    [req.auth.sub, name, JSON.stringify(req.body.data)]
  )
  const rows = await query('SELECT * FROM library_items WHERE id = ? LIMIT 1', [result.insertId])
  res.status(201).json({item: mapItem(rows[0])})
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT id FROM library_items WHERE id = ? AND user_id = ? LIMIT 1',
    [req.params.id, req.auth.sub]
  )
  if (!rows.length) throw httpError(404, '素材不存在')
  await query('DELETE FROM library_items WHERE id = ?', [rows[0].id])
  res.json({ok: true})
}))

export default router
