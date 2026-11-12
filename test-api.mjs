import {readFileSync} from 'node:fs'

const BASE = 'http://localhost:3001'
const results = []
let token = ''

const call = async (name, method, path, {body, auth = true, raw = false} = {}) => {
  const headers = {}
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let payload
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, {method, headers, body: payload})
  const text = await res.text()
  let data = text
  try { data = JSON.parse(text) } catch (e) {}
  results.push({name, status: res.status, ok: res.ok, data: raw ? String(data).slice(0, 120) : data})
  return {res, data}
}

const email = `test${Date.now()}@shenghua.local`
let canvasId = null
let publicId = null
let assetUrl = null
let libraryId = null

await call('health', 'GET', '/api/health', {auth: false})

const reg = await call('register', 'POST', '/api/auth/register', {auth: false, body: {email, password: '123456', nickname: '测试画师'}})
token = reg.data.token
await call('me', 'GET', '/api/auth/me')
await call('login', 'POST', '/api/auth/login', {auth: false, body: {email, password: '123456'}})
await call('login-wrong', 'POST', '/api/auth/login', {auth: false, body: {email, password: 'wrong'}})
await call('unauthorized', 'GET', '/api/canvases', {auth: false})

const created = await call('create-canvas', 'POST', '/api/canvases', {body: {name: '生花测试画布', background: '#fdf0f2'}})
canvasId = created.data.canvas.id

await call('save-elements', 'PUT', `/api/canvases/${canvasId}`, {body: {
  elements: [
    {id: 1, type: 'rect', x: 10, y: 20, w: 100, h: 80, stroke: '#1e1e1e', background: 'transparent', fillStyle: 'solid', strokeWidth: 2.5, corners: 'round', opacity: 100},
    {id: 2, type: 'text', x: 20, y: 40, text: '妙笔生花', size: 20, font: 'normal', align: 'left', color: '#1e1e1e'}
  ],
  name: '生花测试画布-改'
}})
await call('get-canvas', 'GET', `/api/canvases/${canvasId}`)
await call('list-canvases', 'GET', '/api/canvases')
const dup = await call('duplicate', 'POST', `/api/canvases/${canvasId}/duplicate`)
const dupId = dup.data.canvas.id
await call('share-on', 'POST', `/api/canvases/${canvasId}/share`, {body: {isPublic: true}})
const share = await call('public-get', 'GET', `/api/share/${canvasId}`, {auth: false})
publicId = canvasId
await call('public-list', 'GET', '/api/share', {auth: false})

const form = new FormData()
const fileBuffer = readFileSync('D:/Painting surface/paintingSurface/src/assets/hero.png')
form.append('file', new Blob([fileBuffer], {type: 'image/png'}), 'hero.png')
const uploaded = await call('upload', 'POST', '/api/uploads', {body: form})
assetUrl = uploaded.data.asset?.url
if (assetUrl) {
  const res = await fetch(BASE + assetUrl)
  results.push({name: 'fetch-upload', status: res.status, ok: res.ok, data: res.headers.get('content-type')})
}

await call('library-create', 'POST', '/api/library', {body: {name: '我的矩形', data: {type: 'rect', w: 100, h: 80}}})
const lib = await call('library-list', 'GET', '/api/library')
libraryId = lib.data.items?.[0]?.id
await call('library-delete', 'DELETE', `/api/library/${libraryId}`)

await call('delete-dup', 'DELETE', `/api/canvases/${dupId}`)
await call('delete-canvas', 'DELETE', `/api/canvases/${canvasId}`)
await call('get-deleted', 'GET', `/api/canvases/${canvasId}`)

const bad = results.filter(r => r.status >= 500)
console.log(JSON.stringify(results, null, 2))
console.log('SERVER_ERRORS', bad.length)
