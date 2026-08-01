import fs from 'fs'
import yaml from 'js-yaml'
import { Router, Request, Response, NextFunction } from 'express'
import { CustomConfigSchema } from '../config/schema'
import { CUSTOM_YAML, loadCustomConfig, saveCustomConfig } from '../config/loader'
import { triggerBlockyReload } from '../services/blockyService'

const router = Router()

// GET /api/config
router.get('/', (_req: Request, res: Response) => {
  const config = loadCustomConfig()
  res.json(config)
})

// GET /api/config/export
router.get('/export', (_req: Request, res: Response) => {
  const fileName = 'custom.yaml'
  const content = fs.existsSync(CUSTOM_YAML)
    ? fs.readFileSync(CUSTOM_YAML, 'utf8')
    : yaml.dump(loadCustomConfig(), { lineWidth: 120, quotingType: '"' })

  res.setHeader('Content-Type', 'application/x-yaml; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  res.send(content)
})

// POST /api/config/import
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content : ''
    if (!content.trim()) {
      res.status(400).json({ error: 'Import payload must include non-empty YAML content' })
      return
    }

    const parsed = yaml.load(content)
    const config = CustomConfigSchema.parse(parsed)

    saveCustomConfig(config)
    const reload = await triggerBlockyReload()

    res.json({ imported: true, reload })
  } catch (err) {
    next(err)
  }
})

export default router
