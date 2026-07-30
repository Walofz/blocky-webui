import { Router, Request, Response, NextFunction } from 'express'
import { ListFileNameSchema, ListFilePayloadSchema } from '../config/schema'
import { CONFIG_DIR } from '../config/loader'
import { listSavedListFiles, readSavedListFile, saveListFile } from '../services/listFileService'

const router = Router()

// GET /api/list-files
router.get('/', (_req: Request, res: Response) => {
  const files = listSavedListFiles(CONFIG_DIR)
  res.json(files)
})

// GET /api/list-files/:name
router.get('/:name', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fileName = ListFileNameSchema.parse(req.params.name)
    const file = readSavedListFile(CONFIG_DIR, fileName)
    res.json(file)
  } catch (err) {
    if (err instanceof Error && (err.message === 'List file not found' || err.message === 'Invalid file path')) {
      res.status(err.message === 'List file not found' ? 404 : 400).json({ error: err.message })
      return
    }
    next(err)
  }
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
