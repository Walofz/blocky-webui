/**
 * Smoke test for logIngest.ts — run with: npm run test:ingest
 *
 * Simulates Blocky writing a CSV query log file and verifies that the
 * ingest service tails it, parses entries and feeds them into logService.
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseBlockyCsvLine, startLogIngest, stopLogIngest } from '../logIngest'
import { getRecentLogs } from '../logService'

function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function csvLine(time: string, ip: string, reason: string, question: string): string {
  return [time, ip, '', '12', reason, question, '0.0.0.0', 'NOERROR'].join('\t') + '\n'
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  // ── Unit: parser ────────────────────────────────────────────────────────────
  const blocked = parseBlockyCsvLine(
    ['2026-07-29 13:00:01', '192.168.1.50', '', '3', 'BLOCKED (ads-basic)', 'A (ads.google.com.)', '0.0.0.0', 'NOERROR'].join('\t'),
  )
  assert(blocked, 'blocked line should parse')
  assert.strictEqual(blocked!.action, 'block')
  assert.strictEqual(blocked!.domain, 'ads.google.com')
  assert.strictEqual(blocked!.matchedList, 'ads-basic')
  assert.strictEqual(blocked!.clientIP, '192.168.1.50')
  assert.strictEqual(blocked!.responseTime, 3)

  const allowed = parseBlockyCsvLine(
    ['2026-07-29 13:00:02', '10.0.0.5', 'laptop', '25', 'RESOLVED (upstream 8.8.8.8)', 'AAAA (github.com.)', '2606::1', 'NOERROR'].join('\t'),
  )
  assert(allowed, 'allowed line should parse')
  assert.strictEqual(allowed!.action, 'allow')
  assert.strictEqual(allowed!.domain, 'github.com')
  assert.strictEqual(allowed!.matchedList, undefined)

  const commaSeparated = parseBlockyCsvLine(
    '"2026-07-29 13:00:05","10.0.0.6","pc-1","9","BLOCKED (ads-pro)","A (analytics.google.com.)","0.0.0.0","NOERROR"',
  )
  assert(commaSeparated, 'comma-separated line should parse')
  assert.strictEqual(commaSeparated!.action, 'block')
  assert.strictEqual(commaSeparated!.domain, 'analytics.google.com')
  assert.strictEqual(commaSeparated!.matchedList, 'ads-pro')

  const semiSeparated = parseBlockyCsvLine(
    '2026-07-29 13:00:06;10.0.0.7;pc-2;5;RESOLVED (upstream);AAAA (example.org.);::1;NOERROR',
  )
  assert(semiSeparated, 'semicolon-separated line should parse')
  assert.strictEqual(semiSeparated!.action, 'allow')
  assert.strictEqual(semiSeparated!.domain, 'example.org')

  assert.strictEqual(parseBlockyCsvLine('garbage line'), null, 'garbage should not parse')
  assert.strictEqual(parseBlockyCsvLine(''), null, 'empty should not parse')

  // ── Integration: tail a growing file ────────────────────────────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocky-ingest-'))
  const file = path.join(dir, `${today()}_ALL.log`)

  // Pre-existing history (should be seeded)
  fs.writeFileSync(file, csvLine('2026-07-29 12:59:00', '192.168.1.10', 'CACHED', 'A (example.com.)'))

  startLogIngest(dir)
  await sleep(1500)

  // Append new entries after ingest started (realtime path)
  fs.appendFileSync(file, csvLine('2026-07-29 13:00:03', '192.168.1.20', 'BLOCKED (ads-strict)', 'A (doubleclick.net.)'))
  fs.appendFileSync(file, csvLine('2026-07-29 13:00:04', '192.168.1.20', 'RESOLVED (upstream)', 'A (news.ycombinator.com.)'))
  await sleep(1500)

  stopLogIngest()

  const logs = getRecentLogs({ limit: 100 })
  const domains = logs.map((l) => l.domain)
  assert(domains.includes('example.com'), 'seeded history entry should be ingested')
  assert(domains.includes('doubleclick.net'), 'appended blocked entry should be ingested')
  assert(domains.includes('news.ycombinator.com'), 'appended allowed entry should be ingested')

  const dbl = logs.find((l) => l.domain === 'doubleclick.net')!
  assert.strictEqual(dbl.action, 'block')
  assert.strictEqual(dbl.matchedList, 'ads-strict')

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('logIngest smoke test: ALL PASSED')
  process.exit(0)
}

main().catch((err) => {
  console.error('logIngest smoke test FAILED:', err)
  process.exit(1)
})
