import { Router, Request, Response, NextFunction } from 'express'
import { loadCustomConfig, saveCustomConfig } from '../config/loader'
import { DnsRecordSchema } from '../config/schema'
import { triggerBlockyReload } from '../services/blockyService'

const router = Router()

// GET /api/dns
router.get('/', (req: Request, res: Response) => {
  const config = loadCustomConfig()
  let records = config.dnsRecords

  if (req.query.type) {
    records = records.filter((r) => r.type === String(req.query.type).toUpperCase())
  }
  if (req.query.domain) {
    const q = String(req.query.domain).toLowerCase()
    records = records.filter((r) => r.domain.toLowerCase().includes(q))
  }

  res.json(records)
})

// POST /api/dns
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = DnsRecordSchema.parse(req.body)
    const config = loadCustomConfig()

    // Check for duplicate
    const exists = config.dnsRecords.some(
      (r) => r.type === record.type && r.domain === record.domain
    )
    if (exists) {
      res.status(409).json({ error: `DNS ${record.type} record for "${record.domain}" already exists` })
      return
    }

    config.dnsRecords.push(record)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.status(201).json({ record, reload })
  } catch (err) {
    next(err)
  }
})

// PUT /api/dns/:type/:domain — update a specific record
router.put('/:type/:domain', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = DnsRecordSchema.parse(req.body)
    const config = loadCustomConfig()

    const type = req.params.type.toUpperCase()
    const domain = req.params.domain

    const idx = config.dnsRecords.findIndex((r) => r.type === type && r.domain === domain)
    if (idx === -1) {
      res.status(404).json({ error: 'DNS record not found' })
      return
    }

    config.dnsRecords[idx] = record
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ record, reload })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/dns/:type/:domain
router.delete('/:type/:domain', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadCustomConfig()
    const type = req.params.type.toUpperCase()
    const domain = req.params.domain

    const idx = config.dnsRecords.findIndex((r) => r.type === type && r.domain === domain)
    if (idx === -1) {
      res.status(404).json({ error: 'DNS record not found' })
      return
    }

    config.dnsRecords.splice(idx, 1)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ deleted: { type, domain }, reload })
  } catch (err) {
    next(err)
  }
})

// POST /api/dns/quick-allowlist
router.post('/quick-allowlist', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { domain } = req.body as { domain?: string }
    if (!domain) {
      res.status(400).json({ error: 'domain is required' })
      return
    }
    // Stub: In a real integration this would add to Blocky's allowlist
    // For now, we record as a CNAME to itself (placeholder action)
    res.json({
      ok: true,
      message: `Quick allowlist for "${domain}" — integrate with Blocky allowlist API to implement fully`,
    })
  } catch (err) {
    next(err)
  }
})

export default router
