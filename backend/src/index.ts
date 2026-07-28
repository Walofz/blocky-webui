import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import adsProfilesRouter from './routes/adsProfiles'
import groupsRouter from './routes/groups'
import dnsRouter from './routes/dns'
import logsRouter from './routes/logs'
import dashboardRouter from './routes/dashboard'
import { loadCustomConfig } from './config/loader'
import { startDemoLogs } from './services/logService'

const app = express()
const PORT = process.env.PORT ?? 4000

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }))
app.use(express.json())

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

// ─── Config export (read-only snapshot of custom.yaml) ───────────────────────
app.get('/api/config', (_req, res) => {
  const config = loadCustomConfig()
  res.json(config)
})

// ─── Routers ──────────────────────────────────────────────────────────────────
app.use('/api/ads-profiles', adsProfilesRouter)
app.use('/api/groups', groupsRouter)
app.use('/api/dns', dnsRouter)
app.use('/api/logs', logsRouter)
app.use('/api/dashboard', dashboardRouter)

// SSE logs stream is also accessible at /events/logs for convenience
app.get('/events/logs', (req, res) => {
  const { domain, clientIP, group, action } = req.query as Record<string, string>
  const { streamLogsSSE } = require('./services/logService')
  streamLogsSSE(res, {
    domain,
    clientIP,
    group,
    action: action === 'allow' || action === 'block' ? action : undefined,
  })
})

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Blocky WebUI backend running on http://localhost:${PORT}`)
  console.log(`  Config dir: ${process.env.CONFIG_DIR ?? '../config'}`)
  if (!process.env.BLOCKY_URL) {
    console.log('  [demo mode] BLOCKY_URL not set — using demo data')
    startDemoLogs()
  }
})

export default app
