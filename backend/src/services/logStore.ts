import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import type { LogEntry } from './logService'

type LogRow = {
  log_id: string
  timestamp: string
  client_ip: string
  domain: string
  upstream: string | null
  resolved_ip: string | null
  status: string
  record_type: string | null
  action: 'allow' | 'block'
  response_time: number | null
}

let dbPromise: Promise<Database> | null = null

function getDbPath(): string {
  const configDir = process.env.CONFIG_DIR ?? path.join(process.cwd(), '..', 'config')
  return process.env.LOG_DB_PATH ?? path.join(configDir, 'logs.sqlite')
}

export async function initLogStore(): Promise<void> {
  if (dbPromise) {
    await dbPromise
    return
  }

  const dbPath = getDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  dbPromise = open({
    filename: dbPath,
    driver: sqlite3.Database,
  })

  const db = await dbPromise
  await db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      client_ip TEXT NOT NULL,
      domain TEXT NOT NULL,
      upstream TEXT,
      resolved_ip TEXT,
      status TEXT NOT NULL,
      record_type TEXT,
      action TEXT NOT NULL,
      response_time INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain);
    CREATE INDEX IF NOT EXISTS idx_logs_client_ip ON logs(client_ip);
    CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
  `)

  console.log(`[logs] SQLite enabled at: ${dbPath}`)
}

export function persistLog(entry: LogEntry): void {
  if (!dbPromise) return

  void dbPromise
    .then((db) => db.run(
      `
        INSERT INTO logs (
          log_id, timestamp, client_ip, domain,
          upstream, resolved_ip, status, record_type, action, response_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      entry.id,
      entry.timestamp,
      entry.clientIP,
      entry.domain,
      entry.upstream ?? null,
      entry.resolvedIP ?? null,
      entry.status,
      entry.recordType ?? null,
      entry.action,
      entry.responseTime ?? null
    ))
    .catch((err) => {
      console.error('[logs] Failed to persist log entry:', err instanceof Error ? err.message : String(err))
    })
}

export async function queryPersistedLogs(opts: {
  limit?: number
  domain?: string
  clientIP?: string
  status?: string
  recordType?: string
  action?: 'allow' | 'block'
}): Promise<LogEntry[]> {
  if (!dbPromise) return []

  const db = await dbPromise
  const where: string[] = []
  const params: unknown[] = []

  if (opts.domain) {
    where.push('LOWER(domain) LIKE ?')
    params.push(`%${opts.domain.toLowerCase()}%`)
  }
  if (opts.clientIP) {
    where.push('client_ip LIKE ?')
    params.push(`%${opts.clientIP}%`)
  }
  if (opts.status) {
    where.push('status = ?')
    params.push(opts.status)
  }
  if (opts.recordType) {
    where.push('UPPER(COALESCE(record_type, \"\")) = ?')
    params.push(opts.recordType.toUpperCase())
  }
  if (opts.action) {
    where.push('action = ?')
    params.push(opts.action)
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 200, 5000))
  const sql = `
    SELECT log_id, timestamp, client_ip, domain, upstream, resolved_ip, status, record_type, action, response_time
    FROM logs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ?
  `

  const rows = await db.all<LogRow[]>(sql, ...params, limit)
  return rows.map((row) => ({
    id: row.log_id,
    timestamp: row.timestamp,
    clientIP: row.client_ip,
    domain: row.domain,
    upstream: row.upstream ?? undefined,
    resolvedIP: row.resolved_ip ?? undefined,
    status: row.status,
    recordType: row.record_type ?? undefined,
    action: row.action,
    responseTime: row.response_time ?? undefined,
  }))
}

export async function clearPersistedLogs(): Promise<number> {
  if (!dbPromise) return 0
  const db = await dbPromise
  const result = await db.run('DELETE FROM logs')
  return result.changes ?? 0
}
