import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import {existsSync, mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {initDatabase} from './db.js'
import authRoutes from './routes/auth.js'
import canvasRoutes from './routes/canvases.js'
import libraryRoutes from './routes/library.js'
import uploadRoutes from './routes/uploads.js'
import shareRoutes from './routes/share.js'

dotenv.config()

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const uploadDir = resolve(rootDir, process.env.UPLOAD_DIR || 'uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, {recursive: true})

const app = express()
const port = Number(process.env.PORT || 3001)

// 前端可能部署在多个域名（本地、Render、花生壳 gicp.fun 等），且接口使用 Bearer Token 鉴权，
// 因此这里直接回显请求来源，便于任意前端的跨域调用。
app.use(cors({
  origin: true,
  credentials: true
}))

app.use(express.json({limit: '25mb'}))

app.get('/api/health', (req, res) => {
  res.json({ok: true, service: 'shenghua-server', time: new Date().toISOString()})
})

app.use('/uploads', express.static(uploadDir, {maxAge: '7d'}))

app.use('/api/auth', authRoutes)
app.use('/api/canvases', canvasRoutes)
app.use('/api/library', libraryRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/share', shareRoutes)

app.use((req, res) => {
  res.status(404).json({error: '接口不存在'})
})

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({error: '文件不能超过 10MB'})
  }
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({error: err.message || '服务器内部错误'})
})

const start = async () => {
  try {
    await initDatabase()
    app.listen(port, '0.0.0.0', () => {
      console.log(`[shenghua-server] listening on http://0.0.0.0:${port}`)
      console.log(`[shenghua-server] uploads dir: ${uploadDir}`)
    })
  } catch (err) {
    console.error('[shenghua-server] failed to start', err)
    process.exit(1)
  }
}

start()
