import { Request, Response, NextFunction } from 'express'

const configuredToken = process.env.AUTH_TOKEN?.trim() || ''

export function isAuthEnabled(): boolean {
  return configuredToken.length > 0
}

function readToken(req: Request): string | null {
  const authHeader = req.header('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim()
  }

  const apiToken = req.header('x-api-token')
  if (apiToken?.trim()) {
    return apiToken.trim()
  }

  const queryToken = req.query.token
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim()
  }

  return null
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthEnabled()) {
    next()
    return
  }

  const token = readToken(req)
  if (!token || token !== configuredToken) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
