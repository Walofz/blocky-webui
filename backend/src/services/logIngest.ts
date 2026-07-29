import fs from 'fs'
import path from 'path'
import { appendLog, LogEntry } from './logService'

/**
 * logIngest.ts — Real Blocky query log ingestion.
 *
 * Blocky is configured with:
 *   queryLog:
 *     type: csv
 *     target: /app/config/logs      # shared ./config volume → backend sees /config/logs
 *
 * Blocky writes one tab-separated CSV file per day named `YYYY-MM-DD_ALL.log` with columns:
 *   [0] start time "YYYY-MM-DD HH:mm:ss"
 *   [1] client IP
 *   [2] client names (joined by "; ")
 *   [3] duration ms
 *   [4] response reason (e.g. "BLOCKED (ads-basic)", "RESOLVED (upstream ...)", "CACHED")
 *   [5] question (e.g. "A (example.com.)")
 *   [6] answer
 *   [7] response code (e.g. "NOERROR", "NXDOMAIN")
 *
 * This service tails the newest file, parses appended lines and feeds them into the
 * in-memory log buffer + SSE broadcaster (logService.appendLog).
 */

const POLL_INTERVAL_MS = 1000
// On startup only seed from the tail of the current file (avoid replaying a huge day file)
const SEED_BYTES = 64 * 1024

const FILE_PATTERN = /^\d{4}-\d{2}-\d{2}_ALL\.log$/

let pollTimer: ReturnType<typeof setInterval> | null = null
let currentFile: string | null = null
let currentOffset = 0
let partialLine = ''
let firstAttach = true
let skipFirstPartial = false

export function parseBlockyCsvLine(line: string): Omit<LogEntry, 'id'> | null {
  const fields = line.split('\t')
  if (fields.length < 6) return null

  const [time, clientIP, , durationMs, reason, question] = fields

  // question format: "A (example.com.)"
  const qMatch = question.match(/^\S+\s+\(([^)]+)\)/)
  if (!qMatch) return null
  const domain = qMatch[1].replace(/\.$/, '')

  const blocked = reason.toUpperCase().startsWith('BLOCKED')
  const listMatch = blocked ? reason.match(/\(([^)]+)\)/) : null

  const timestamp = new Date(time.replace(' ', 'T'))

  return {
    timestamp: isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString(),
    clientIP: clientIP || 'unknown',
    domain,
    action: blocked ? 'block' : 'allow',
    matchedList: listMatch ? listMatch[1] : undefined,
    responseTime: durationMs ? parseInt(durationMs, 10) || 0 : undefined,
  }
}

function findLatestLogFile(logDir: string): string | null {
  let names: string[]
  try {
    names = fs.readdirSync(logDir)
  } catch {
    return null
  }
  const candidates = names.filter((n) => FILE_PATTERN.test(n)).sort()
  if (candidates.length === 0) return null
  return path.join(logDir, candidates[candidates.length - 1])
}

function consumeChunk(chunk: string): void {
  const data = partialLine + chunk
  const lines = data.split('\n')
  partialLine = lines.pop() ?? '' // last element is an incomplete line (or '')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const entry = parseBlockyCsvLine(trimmed)
    if (entry) appendLog(entry)
  }
}

function poll(logDir: string): void {
  const latest = findLatestLogFile(logDir)
  if (!latest) return

  if (latest !== currentFile) {
    // New file (startup or daily rotation)
    currentFile = latest
    partialLine = ''
    skipFirstPartial = false
    currentOffset = 0

    if (firstAttach) {
      // On very first attach, skip old history except the last SEED_BYTES
      firstAttach = false
      let size = 0
      try {
        size = fs.statSync(latest).size
      } catch {
        currentFile = null
        return
      }
      currentOffset = Math.max(0, size - SEED_BYTES)
      // We may land mid-line — drop everything up to the first newline
      skipFirstPartial = currentOffset > 0
    }
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(currentFile)
  } catch {
    currentFile = null
    return
  }

  if (stat.size < currentOffset) {
    // File truncated/rewritten — start over
    currentOffset = 0
    partialLine = ''
  }
  if (stat.size === currentOffset) return

  const length = stat.size - currentOffset
  const buffer = Buffer.alloc(length)
  let fd: number
  try {
    fd = fs.openSync(currentFile, 'r')
  } catch {
    return
  }
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, length, currentOffset)
    currentOffset += bytesRead
    let text = buffer.toString('utf8', 0, bytesRead)
    // If we seeded mid-file, discard the (likely partial) first line
    if (skipFirstPartial) {
      const nl = text.indexOf('\n')
      if (nl === -1) return // still inside the first line — wait for more data
      text = text.slice(nl + 1)
      skipFirstPartial = false
    }
    consumeChunk(text)
  } finally {
    fs.closeSync(fd)
  }
}

export function startLogIngest(logDir?: string): void {
  if (pollTimer) return

  const configDir = process.env.CONFIG_DIR ?? path.join(process.cwd(), '..', 'config')
  const dir = logDir ?? process.env.LOG_DIR ?? path.join(configDir, 'logs')

  // Ensure the directory exists so Blocky's csv writer can create files in it
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore — Blocky may create it itself
  }

  firstAttach = true
  console.log(`[logs] Ingesting Blocky query logs from: ${dir}`)

  pollTimer = setInterval(() => poll(dir), POLL_INTERVAL_MS)
  poll(dir)
}

export function stopLogIngest(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  currentFile = null
  currentOffset = 0
  partialLine = ''
  firstAttach = true
  skipFirstPartial = false
}
