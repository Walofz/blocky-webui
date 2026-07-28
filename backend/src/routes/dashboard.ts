import { Router, Request, Response } from 'express'
import { loadCustomConfig } from '../config/loader'
import { getBlockyStatus } from '../services/blockyService'
import { getRecentLogs } from '../services/logService'

const router = Router()

// GET /api/dashboard
router.get('/', async (_req: Request, res: Response) => {
  const config = loadCustomConfig()
  const status = await getBlockyStatus()
  const allLogs = getRecentLogs({ limit: 1000 })

  // ─── Stats ────────────────────────────────────────────────────────────────
  const totalQueries = allLogs.length
  const blocked = allLogs.filter((l) => l.action === 'block').length
  const allowed = allLogs.filter((l) => l.action === 'allow').length
  const blockRate = totalQueries > 0 ? Math.round((blocked / totalQueries) * 100) : 0

  // ─── Top blocked domains ──────────────────────────────────────────────────
  const domainCounts: Record<string, number> = {}
  for (const log of allLogs.filter((l) => l.action === 'block')) {
    domainCounts[log.domain] = (domainCounts[log.domain] ?? 0) + 1
  }
  const topBlockedDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }))

  // ─── Top clients ──────────────────────────────────────────────────────────
  const clientCounts: Record<string, number> = {}
  for (const log of allLogs) {
    clientCounts[log.clientIP] = (clientCounts[log.clientIP] ?? 0) + 1
  }
  const topClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }))

  // ─── Timeline buckets ─────────────────────────────────────────────────────
  const now = Date.now()
  const oneHour = 60 * 60 * 1000
  const timelines = {
    '1h': buildTimeline(allLogs, now - oneHour, now, 12),
    '24h': buildTimeline(allLogs, now - 24 * oneHour, now, 24),
    '7d': buildTimeline(allLogs, now - 7 * 24 * oneHour, now, 28),
  }

  // ─── Groups health ────────────────────────────────────────────────────────
  const groupsHealth = config.groups.map((g) => ({
    name: g.name,
    adsProfile: g.adsProfile,
    clientCount: g.clients.length,
    profile: config.adsProfiles.find((p) => p.name === g.adsProfile),
  }))

  res.json({
    stats: { totalQueries, blocked, allowed, blockRate },
    topBlockedDomains,
    topClients,
    timelines,
    groupsHealth,
    system: status,
    configSummary: {
      adsProfileCount: config.adsProfiles.length,
      groupCount: config.groups.length,
      dnsRecordCount: config.dnsRecords.length,
    },
  })
})

function buildTimeline(
  logs: ReturnType<typeof getRecentLogs>,
  from: number,
  to: number,
  buckets: number
): Array<{ time: string; blocked: number; allowed: number }> {
  const bucketSize = (to - from) / buckets
  const result: Array<{ time: string; blocked: number; allowed: number }> = []

  for (let i = 0; i < buckets; i++) {
    const start = from + i * bucketSize
    const end = start + bucketSize
    const inBucket = logs.filter((l) => {
      const t = new Date(l.timestamp).getTime()
      return t >= start && t < end
    })
    result.push({
      time: new Date(start).toISOString(),
      blocked: inBucket.filter((l) => l.action === 'block').length,
      allowed: inBucket.filter((l) => l.action === 'allow').length,
    })
  }

  return result
}

export default router
