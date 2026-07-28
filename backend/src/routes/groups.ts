import { Router, Request, Response, NextFunction } from 'express'
import { loadCustomConfig, saveCustomConfig } from '../config/loader'
import { GroupSchema } from '../config/schema'
import { triggerBlockyReload } from '../services/blockyService'

const router = Router()

// GET /api/groups
router.get('/', (_req: Request, res: Response) => {
  const config = loadCustomConfig()
  res.json(config.groups)
})

// GET /api/groups/:name
router.get('/:name', (req: Request, res: Response) => {
  const config = loadCustomConfig()
  const group = config.groups.find((g) => g.name === req.params.name)
  if (!group) {
    res.status(404).json({ error: 'Group not found' })
    return
  }
  res.json(group)
})

// POST /api/groups
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = GroupSchema.parse(req.body)
    const config = loadCustomConfig()

    if (config.groups.some((g) => g.name === group.name)) {
      res.status(409).json({ error: `Group "${group.name}" already exists` })
      return
    }

    const profileExists = config.adsProfiles.some((p) => p.name === group.adsProfile)
    if (!profileExists) {
      res.status(400).json({ error: `Ads profile "${group.adsProfile}" does not exist` })
      return
    }

    config.groups.push(group)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.status(201).json({ group, reload })
  } catch (err) {
    next(err)
  }
})

// PUT /api/groups/:name
router.put('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const group = GroupSchema.parse(req.body)
    const config = loadCustomConfig()
    const idx = config.groups.findIndex((g) => g.name === req.params.name)

    if (idx === -1) {
      res.status(404).json({ error: 'Group not found' })
      return
    }

    const profileExists = config.adsProfiles.some((p) => p.name === group.adsProfile)
    if (!profileExists) {
      res.status(400).json({ error: `Ads profile "${group.adsProfile}" does not exist` })
      return
    }

    config.groups[idx] = group
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ group, reload })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/groups/:name
router.delete('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadCustomConfig()
    const idx = config.groups.findIndex((g) => g.name === req.params.name)

    if (idx === -1) {
      res.status(404).json({ error: 'Group not found' })
      return
    }

    config.groups.splice(idx, 1)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ deleted: req.params.name, reload })
  } catch (err) {
    next(err)
  }
})

export default router
