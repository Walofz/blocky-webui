import { Response } from 'express'
import { EventEmitter } from 'events'

export interface LogEntry {
  id: string
  timestamp: string
  clientIP: string
  domain: string
  upstream?: string
  resolvedIP?: string
  action: 'allow' | 'block'
  matchedList?: string
  matchedGroup?: string
  responseTime?: number
}

// In-memory ring buffer for recent logs (last 1000 entries)
const MAX_LOG_ENTRIES = 1000
const logBuffer: LogEntry[] = []
const logEmitter = new EventEmitter()
logEmitter.setMaxListeners(50)

let logIdCounter = 1

export function appendLog(entry: Omit<LogEntry, 'id'>): LogEntry {
  const fullEntry: LogEntry = { id: String(logIdCounter++), ...entry }
  logBuffer.push(fullEntry)
  if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift()
  logEmitter.emit('log', fullEntry)
  return fullEntry
}

export function clearLogs(): number {
  const removed = logBuffer.length
  logBuffer.length = 0
  return removed
}

export function getRecentLogs(opts: {
  limit?: number
  domain?: string
  clientIP?: string
  group?: string
  action?: 'allow' | 'block'
}): LogEntry[] {
  let results = [...logBuffer]

  if (opts.domain) {
    const q = opts.domain.toLowerCase()
    results = results.filter((l) => l.domain.toLowerCase().includes(q))
  }
  if (opts.clientIP) {
    results = results.filter((l) => l.clientIP.includes(opts.clientIP!))
  }
  if (opts.group) {
    results = results.filter((l) => l.matchedGroup === opts.group)
  }
  if (opts.action) {
    results = results.filter((l) => l.action === opts.action)
  }

  const limit = opts.limit ?? 200
  return results.slice(-limit).reverse()
}

export function streamLogsSSE(res: Response, filters: {
  domain?: string
  clientIP?: string
  group?: string
  action?: 'allow' | 'block'
}): () => void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (entry: LogEntry) => {
    // Apply filters
    if (filters.domain && !entry.domain.toLowerCase().includes(filters.domain.toLowerCase())) return
    if (filters.clientIP && !entry.clientIP.includes(filters.clientIP)) return
    if (filters.group && entry.matchedGroup !== filters.group) return
    if (filters.action && entry.action !== filters.action) return

    res.write(`data: ${JSON.stringify(entry)}\n\n`)
  }

  logEmitter.on('log', send)

  // Send a heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, 15000)

  const cleanup = () => {
    logEmitter.off('log', send)
    clearInterval(heartbeat)
  }

  res.on('close', cleanup)
  return cleanup
}

// ─── Demo log generator (removes itself after BLOCKY_URL is set) ──────────────
// Generates fake log entries when no real Blocky is connected
let demoInterval: ReturnType<typeof setInterval> | null = null

const DEMO_DOMAINS = [
  'ads.google.com', 'tracking.facebook.com', 'example.com',
  'news.ycombinator.com', 'doubleclick.net', 'github.com',
  'telemetry.microsoft.com', 'api.spotify.com', 'analytics.twitter.com',
]
const DEMO_IPS = ['192.168.1.10', '192.168.1.20', '192.168.1.50', '10.0.0.5']
const DEMO_GROUPS = ['default', 'kids', 'work']
const DEMO_LISTS = ['ads-basic', 'ads-strict', 'tracking']

export function startDemoLogs(): void {
  if (process.env.BLOCKY_URL) return // Don't run demo if real Blocky is configured
  if (demoInterval) return

  demoInterval = setInterval(() => {
    const domain = DEMO_DOMAINS[Math.floor(Math.random() * DEMO_DOMAINS.length)]
    const action: 'allow' | 'block' = Math.random() > 0.4 ? 'block' : 'allow'
    appendLog({
      timestamp: new Date().toISOString(),
      clientIP: DEMO_IPS[Math.floor(Math.random() * DEMO_IPS.length)],
      domain,
      upstream: action === 'allow' ? '1.1.1.1' : undefined,
      resolvedIP: action === 'allow' ? '142.250.66.110' : '0.0.0.0',
      action,
      matchedList: action === 'block' ? DEMO_LISTS[Math.floor(Math.random() * DEMO_LISTS.length)] : undefined,
      matchedGroup: DEMO_GROUPS[Math.floor(Math.random() * DEMO_GROUPS.length)],
      responseTime: Math.floor(Math.random() * 20),
    })
  }, 1200)
}

export function stopDemoLogs(): void {
  if (demoInterval) {
    clearInterval(demoInterval)
    demoInterval = null
  }
}
