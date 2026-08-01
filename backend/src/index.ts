import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import { requireAuth, isAuthEnabled } from './middleware/auth'
import adsProfilesRouter from './routes/adsProfiles'
import groupsRouter from './routes/groups'
import dnsRouter from './routes/dns'
import logsRouter from './routes/logs'
import dashboardRouter from './routes/dashboard'
import listFilesRouter from './routes/listFiles'
import { loadCustomConfig } from './config/loader'
import { startDemoLogs } from './services/logService'
import { startLogIngest } from './services/logIngest'

const app = express()
const PORT = process.env.PORT ?? 4000

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000' }))
app.use(express.json())

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

app.use('/api', requireAuth)
app.use('/events', requireAuth)

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
app.use('/api/list-files', listFilesRouter)

// SSE logs stream is also accessible at /events/logs for convenience
app.get('/events/logs', (req, res) => {
  const { domain, clientIP, status, recordType, action } = req.query as Record<string, string>
  const { streamLogsSSE } = require('./services/logService')
  streamLogsSSE(res, {
    domain,
    clientIP,
    status,
    recordType,
    action: action === 'allow' || action === 'block' ? action : undefined,
  })
})

// ─── Error handler (must be last) ────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Blocky WebUI backend running on http://localhost:${PORT}`)
  console.log(`  Config dir: ${process.env.CONFIG_DIR ?? '../config'}`)
  if (isAuthEnabled()) {
    console.log('  Auth: enabled (token-based)')
  } else {
    console.log('  Auth: disabled')
  }
  if (!process.env.BLOCKY_URL) {
    console.log('  [demo mode] BLOCKY_URL not set — using demo data')
    startDemoLogs()
  } else {
    // Real mode: tail Blocky's CSV query log (queryLog.type=csv in config.yaml)
    startLogIngest()
  }
})

export default app
