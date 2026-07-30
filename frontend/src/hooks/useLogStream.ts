import { useState, useEffect, useCallback } from 'react'
import { LogEntry } from '../api/client'

interface SSEFilters {
  domain?: string
  clientIP?: string
  status?: string
  recordType?: string
  action?: string
}

export function useLogStream(filters: SSEFilters, maxEntries = 500) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (filters.domain) params.set('domain', filters.domain)
    if (filters.clientIP) params.set('clientIP', filters.clientIP)
    if (filters.status) params.set('status', filters.status)
    if (filters.recordType) params.set('recordType', filters.recordType)
    if (filters.action) params.set('action', filters.action)
    const qs = params.toString()
    return `/events/logs${qs ? `?${qs}` : ''}`
  }, [filters.domain, filters.clientIP, filters.status, filters.recordType, filters.action])

  useEffect(() => {
    const url = buildUrl()
    const es = new EventSource(url)

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (evt) => {
      try {
        const entry: LogEntry = JSON.parse(evt.data)
        setLogs((prev) => {
          const next = [entry, ...prev]
          return next.slice(0, maxEntries)
        })
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [buildUrl, maxEntries])

  const clear = useCallback(() => setLogs([]), [])

  return { logs, connected, clear }
}
