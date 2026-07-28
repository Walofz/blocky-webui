import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { ValidationError } from '../config/loader'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      issues: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    })
    return
  }

  if (err instanceof ValidationError) {
    res.status(400).json({
      error: 'Config validation error',
      issues: err.issues,
    })
    return
  }

  if (err instanceof Error) {
    console.error('[error]', err.message)
    res.status(500).json({ error: err.message })
    return
  }

  res.status(500).json({ error: 'Internal server error' })
}
