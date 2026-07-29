import { Router, Request, Response, NextFunction } from 'express'
import fs from 'fs'
import path from 'path'
import { loadCustomConfig, saveCustomConfig } from '../config/loader'
import { UpstreamSchema } from '../config/schema'
import { getRecentLogs, streamLogsSSE, clearLogs } from '../services/logService'
import { triggerBlockyReload } from '../services/blockyService'

const router = Router()
const LOG_DIR = process.env.LOG_DIR ?? path.join(process.env.CONFIG_DIR ?? path.join(process.cwd(), '..', 'config'), 'logs')

// GET /api/logs — recent logs (with optional filters)
router.get('/', (req: Request, res: Response) => {
  const { domain, clientIP, group, action, limit } = req.query as Record<string, string>

  const logs = getRecentLogs({
    domain,
    clientIP,
    group,
    action: action === 'allow' || action === 'block' ? action : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  })

  res.json(logs)
})

// DELETE /api/logs — clear in-memory logs and optionally clear files in LOG_DIR
router.delete('/', (req: Request, res: Response) => {
  const removedBuffer = clearLogs()
  let removedFiles = 0

  if (req.query.files === 'true' && fs.existsSync(LOG_DIR)) {
    const entries = fs.readdirSync(LOG_DIR)
    for (const name of entries) {
      if (!name.endsWith('.log')) continue
      const fullPath = path.join(LOG_DIR, name)
      fs.truncateSync(fullPath, 0)
      removedFiles++
    }
  }

  res.json({ cleared: true, removedBuffer, removedFiles })
})

// GET /api/logs/upstreams — current upstream list from custom config
router.get('/upstreams', (_req: Request, res: Response) => {
  const config = loadCustomConfig()
  res.json({ upstreams: config.upstreams ?? [] })
})

// PUT /api/logs/upstreams — save upstream list (max 5)
router.put('/upstreams', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upstreams = UpstreamSchema.parse(req.body?.upstreams)
    const config = loadCustomConfig()
    config.upstreams = upstreams
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ upstreams, reload })
  } catch (err) {
    next(err)
  }
})

// GET /events/logs — SSE stream
router.get('/stream', (req: Request, res: Response) => {
  const { domain, clientIP, group, action } = req.query as Record<string, string>

  streamLogsSSE(res, {
    domain,
    clientIP,
    group,
    action: action === 'allow' || action === 'block' ? action : undefined,
  })
})

export default router
