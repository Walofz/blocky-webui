import { Router, Request, Response } from 'express'
import { getRecentLogs, streamLogsSSE } from '../services/logService'

const router = Router()

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
