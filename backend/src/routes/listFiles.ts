import { Router, Request, Response, NextFunction } from 'express'
import { ListFilePayloadSchema } from '../config/schema'
import { CONFIG_DIR } from '../config/loader'
import { listSavedListFiles, saveListFile } from '../services/listFileService'

const router = Router()

// GET /api/list-files
router.get('/', (_req: Request, res: Response) => {
  const files = listSavedListFiles(CONFIG_DIR)
  res.json(files)
})

// POST /api/list-files
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = ListFilePayloadSchema.parse(req.body)
    const saved = saveListFile(CONFIG_DIR, payload.fileName, payload.content)
    res.status(201).json(saved)
  } catch (err) {
    if (err instanceof Error && (err.message === 'Invalid file path' || err.message === 'List content is empty')) {
      res.status(400).json({ error: err.message })
      return
    }
    next(err)
  }
})

export default router
