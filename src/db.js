import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'

dotenv.config()

const useSSL = String(process.env.DB_SSL || '').toLowerCase() === 'true'

const sslConfig = () => {
  if (!useSSL) return undefined
  const ssl = {minVersion: 'TLSv1.2'}
  const caPath = process.env.DB_SSL_CA
  if (caPath) {
    const filePath = resolve(caPath)
    if (existsSync(filePath)) {
      try {
        ssl.ca = readFileSync(filePath)
      } catch (err) {}
    }
  }
  return ssl
}

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shenghua',
  ...(useSSL ? {ssl: sslConfig()} : {})
}

export const dbName = config.database

let pool = null

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS canvases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(160) NOT NULL DEFAULT '未命名画布',
    background VARCHAR(32) NOT NULL DEFAULT '#ffffff',
    content LONGTEXT NULL,
    thumbnail LONGTEXT NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    share_code VARCHAR(32) NULL,
    share_permission VARCHAR(16) NOT NULL DEFAULT 'view',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_canvases_user (user_id),
    CONSTRAINT fk_canvases_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS assets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime VARCHAR(120) NOT NULL,
    size INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_assets_user (user_id),
    CONSTRAINT fk_assets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS library_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(160) NOT NULL DEFAULT '',
    data LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_library_user (user_id),
    CONSTRAINT fk_library_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
]

export const initDatabase = async () => {
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    ...(useSSL ? {ssl: sslConfig()} : {})
  })
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await bootstrap.end()

  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: true
  })

  for (const statement of statements) {
    await pool.query(statement)
  }

  const [thumbCols] = await pool.query("SHOW COLUMNS FROM canvases LIKE 'thumbnail'")
  if (!thumbCols.length) {
    await pool.query('ALTER TABLE canvases ADD COLUMN thumbnail LONGTEXT NULL AFTER content')
  }

  const [codeCols] = await pool.query("SHOW COLUMNS FROM canvases LIKE 'share_code'")
  if (!codeCols.length) {
    await pool.query("ALTER TABLE canvases ADD COLUMN share_code VARCHAR(32) NULL AFTER is_public, ADD COLUMN share_permission VARCHAR(16) NOT NULL DEFAULT 'view' AFTER share_code")
  }

  const [codeIdx] = await pool.query("SHOW INDEX FROM canvases WHERE Key_name = 'uk_share_code'")
  if (!codeIdx.length) {
    await pool.query('ALTER TABLE canvases ADD UNIQUE KEY uk_share_code (share_code)')
  }

  return pool
}

export const getPool = () => {
  if (!pool) throw new Error('Database is not initialized')
  return pool
}

export const query = async (sql, params = []) => {
  const [rows] = await getPool().query(sql, params)
  return rows
}
