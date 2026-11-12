# 生花后端服务（shenghua-server）

生花（Painting Surface）前端对应的 Node.js API 服务：Express + MySQL + JWT。

## 快速开始

```bash
cd "D:\Painting surface\server"
npm install
npm run dev        # 开发（node --watch）
npm start          # 生产
```

默认地址：`http://localhost:3001`，健康检查：`GET /api/health`。

首次启动会自动创建数据库 `shenghua` 与全部数据表（utf8mb4）。数据库连接信息在 `.env`
（可从 `.env.example` 复制修改）：

```
PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=shenghua
JWT_SECRET=...
JWT_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5199
UPLOAD_DIR=uploads
```

## 数据表

| 表 | 说明 |
| --- | --- |
| `users` | 账号：email 唯一、bcrypt 密码、昵称 |
| `canvases` | 画布：所属用户、名称、背景色、`content`（元素数组 JSON）、`thumbnail`（前端生成的 SVG data URL 缩略图）、`share_code`（分享码）、`share_permission`（view/copy/edit）、是否公开 |
| `assets` | 上传图片：文件名、原文件名、MIME、大小 |
| `library_items` | 素材库：名称 + 素材数据 JSON |

## 鉴权

除注册/登录接口外，所有者接口需请求头：

```
Authorization: Bearer <token>
```

分享访问接口使用分享码换取分享凭证；可编辑分享写入时另需：

```
X-Share-Token: <shareToken>
```

## 接口一览

### 认证 `/api/auth`

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| POST | `/register` | 注册 | `{email, password, nickname}` |
| POST | `/login` | 登录 | `{email, password}` |
| GET | `/me` | 当前用户 | – |
| PUT | `/me` | 修改昵称/密码 | `{nickname?, password?}` |

注册/登录返回 `{token, user}`；`user = {id, email, nickname, createdAt, updatedAt}`。

### 画布 `/api/canvases`（需登录）

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| GET | `/` | 画布列表（分页） | query: `limit`(默认 20，≤100)、`offset` |
| POST | `/` | 新建画布 | `{name?, background?, elements?}` |
| GET | `/:id` | 画布详情（含 elements） | – |
| PUT | `/:id` | 保存画布（自动保存用） | `{name?, background?, elements?, thumbnail?, isPublic?}` |
| DELETE | `/:id` | 删除画布 | – |
| POST | `/:id/duplicate` | 复制为「xxx 副本」 | – |
| GET | `/:id/share` | 查看分享设置 | – |
| POST | `/:id/share` | 设置/更新分享 | `{permission: 'view'|'copy'|'edit', code?: 'ABCD12'}`；`{enabled:false}` 停止分享 |

列表返回 `{items, total, limit, offset}`；详情返回 `{canvas: {id, name, background, thumbnail, elements, createdAt, updatedAt}}`。
分享设置返回 `{shared, code, permission, linkPath}`；分享码 4-12 位字母数字，留空自动生成，重复会返回 409。

### 分享访问 `/api/share`（凭分享码）

| 方法 | 路径 | 说明 | 请求体/头 |
| --- | --- | --- | --- |
| POST | `/:id/access` | 用分享码进入画布 | `{code}`；返回 `{canvas, permission, owner, shareToken}`，错误码 403；同一 IP 10 分钟最多 20 次 |
| GET | `/:id/with-token` | 凭分享凭证恢复会话 | 头 `X-Share-Token` |
| PUT | `/:id` | 可编辑分享保存内容 | 头 `X-Share-Token`；`{elements?, thumbnail?, background?}`；仅 `edit` 权限可用 |
| POST | `/:id/copy` | 可另存分享：复制到自己的账号 | 头 `X-Share-Token` + `Authorization`；仅 `copy` 权限可用 |

权限含义：`view` 只读查看；`copy` 只读并可复制到自己画布；`edit` 可编辑并保存回该画布。

### 图片上传 `/api/uploads`（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/` | `multipart/form-data`，字段名 `file`；仅 png/jpeg/webp/gif/svg，≤10MB |
| GET | `/` | 我上传过的图片列表 |
| DELETE | `/:id` | 删除记录与文件 |

返回 `{asset: {id, url, filename, originalName, mime, size, createdAt}}`；
`url` 形如 `/uploads/xxx.png`，可用 `http://localhost:3001/uploads/xxx.png` 直接访问（静态托管 7 天缓存）。

### 素材库 `/api/library`（需登录）

| 方法 | 路径 | 说明 | 请求体 |
| --- | --- | --- | --- |
| GET | `/` | 素材列表（最多 200） | – |
| POST | `/` | 添加素材 | `{name?, data}`（data 可为任意元素对象/数组） |
| DELETE | `/:id` | 删除素材 | – |

## 错误格式

所有错误统一返回 `{error: "中文提示"}`，常见状态码：400 参数错误、401 未登录/登录过期、
404 资源不存在、409 邮箱已注册、500 服务端异常。

## 前端对接建议

- 登录/注册页把当前模拟提交换成 `POST /api/auth/login|register`，保存 `token` 与 `user`；
- 画布自动保存：内容变化节流后 `PUT /api/canvases/:id`，body 里放 `elements`；
- 打开画布：`GET /api/canvases/:id` 把 `elements` 灌入编辑器 store；
- 插入图像：先 `POST /api/uploads`，把返回 `url` 拼成完整地址写入图片元素的 `src`；
- 素材库：右键「添加到素材库」→ `POST /api/library`；素材面板读取 `GET /api/library`；
- 分享：`POST /api/canvases/:id/share` 设置权限与分享码，分享页 `/s/:id` 用 `POST /api/share/:id/access` 校验码进入；可编辑分享用 `PUT /api/share/:id` 保存，可另存分享用 `POST /api/share/:id/copy` 复制到登录账号。

## 自测

`test-api.mjs` 覆盖全部接口（注册、登录、画布 CRUD、复制、分享、公开读取、上传、素材库、删除、鉴权失败）：

```bash
node test-api.mjs
```

测试会创建临时账号 `test*@shenghua.local`，如需清理：

```sql
USE shenghua;
DELETE FROM users WHERE email LIKE 'test%@shenghua.local';
```
