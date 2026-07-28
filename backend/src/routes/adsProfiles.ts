import { Router, Request, Response, NextFunction } from 'express'
import { loadCustomConfig, saveCustomConfig } from '../config/loader'
import { AdsProfileSchema } from '../config/schema'
import { triggerBlockyReload } from '../services/blockyService'

const router = Router()

// GET /api/ads-profiles
router.get('/', (_req: Request, res: Response) => {
  const config = loadCustomConfig()
  res.json(config.adsProfiles)
})

// GET /api/ads-profiles/:name
router.get('/:name', (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadCustomConfig()
    const profile = config.adsProfiles.find((p) => p.name === req.params.name)
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' })
      return
    }
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

// POST /api/ads-profiles
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = AdsProfileSchema.parse(req.body)
    const config = loadCustomConfig()

    if (config.adsProfiles.some((p) => p.name === profile.name)) {
      res.status(409).json({ error: `Profile "${profile.name}" already exists` })
      return
    }

    config.adsProfiles.push(profile)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.status(201).json({ profile, reload })
  } catch (err) {
    next(err)
  }
})

// PUT /api/ads-profiles/:name
router.put('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = AdsProfileSchema.parse(req.body)
    const config = loadCustomConfig()
    const idx = config.adsProfiles.findIndex((p) => p.name === req.params.name)

    if (idx === -1) {
      res.status(404).json({ error: 'Profile not found' })
      return
    }

    // Allow renaming: profile.name may differ from req.params.name
    if (profile.name !== req.params.name) {
      // Update all groups that reference the old name
      for (const g of config.groups) {
        if (g.adsProfile === req.params.name) g.adsProfile = profile.name
      }
    }

    config.adsProfiles[idx] = profile
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ profile, reload })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/ads-profiles/:name
router.delete('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = loadCustomConfig()
    const idx = config.adsProfiles.findIndex((p) => p.name === req.params.name)

    if (idx === -1) {
      res.status(404).json({ error: 'Profile not found' })
      return
    }

    // Check if any group still references this profile
    const dependents = config.groups.filter((g) => g.adsProfile === req.params.name)
    if (dependents.length > 0) {
      res.status(409).json({
        error: `Cannot delete: profile is used by groups: ${dependents.map((g) => g.name).join(', ')}`,
      })
      return
    }

    config.adsProfiles.splice(idx, 1)
    saveCustomConfig(config)
    const reload = await triggerBlockyReload()
    res.json({ deleted: req.params.name, reload })
  } catch (err) {
    next(err)
  }
})

export default router
