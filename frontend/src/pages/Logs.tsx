import React, { useEffect, useState } from 'react'
import { Wifi, WifiOff, Eraser, ShieldCheck, ShieldOff } from 'lucide-react'
import clsx from 'clsx'
import { useLogStream } from '../hooks/useLogStream'
import { logsApi, LogEntry } from '../api/client'

interface Filters {
  domain: string
  clientIP: string
  status: string
  recordType: string
}

export default function Logs() {
  const [filters, setFilters] = useState<Filters>({ domain: '', clientIP: '', status: '', recordType: '' })
  const [liveMode, setLiveMode] = useState(true)
  const [staticLogs, setStaticLogs] = useState<LogEntry[]>([])
  const [loadingStatic, setLoadingStatic] = useState(false)
  const [upstreams, setUpstreams] = useState<string[]>([])
  const [customUpstream, setCustomUpstream] = useState('')
  const [savingUpstreams, setSavingUpstreams] = useState(false)
  const [clearingLogs, setClearingLogs] = useState(false)

  const UPSTREAM_PRESETS = ['1.1.1.1', '8.8.8.8', '9.9.9.9', '208.67.222.222', '94.140.14.14']

  const { logs: streamLogs, connected, clear } = useLogStream(
    liveMode ? filters : { domain: '', clientIP: '', status: '', recordType: '' }
  )

  const loadStatic = async () => {
    try {
      setLoadingStatic(true)
      setStaticLogs(await logsApi.list({
        domain: filters.domain || undefined,
        clientIP: filters.clientIP || undefined,
        status: filters.status || undefined,
        recordType: filters.recordType || undefined,
        limit: 200,
      }))
    } finally {
      setLoadingStatic(false)
    }
  }

  useEffect(() => {
    if (!liveMode) loadStatic()
  }, [liveMode, filters])

  useEffect(() => {
    logsApi.getUpstreams().then(setUpstreams).catch(() => undefined)
  }, [])

  const displayLogs = liveMode ? streamLogs : staticLogs

  const setFilter = (key: keyof Filters, val: string) =>
    setFilters((f) => ({ ...f, [key]: val }))

  const togglePreset = (ip: string) => {
    setUpstreams((prev) => {
      if (prev.includes(ip)) return prev.filter((v) => v !== ip)
      if (prev.length >= 5) return prev
      return [...prev, ip]
    })
  }

  const addCustomUpstream = () => {
    const next = customUpstream.trim()
    if (!next) return
    setUpstreams((prev) => {
      if (prev.includes(next) || prev.length >= 5) return prev
      return [...prev, next]
    })
    setCustomUpstream('')
  }

  const saveUpstreams = async () => {
    try {
      setSavingUpstreams(true)
      const saved = await logsApi.saveUpstreams(upstreams)
      setUpstreams(saved)
      alert('Saved upstreams')
    } catch {
      alert('Save upstreams failed')
    } finally {
      setSavingUpstreams(false)
    }
  }

  const clearBackendLogs = async (clearFiles: boolean) => {
    try {
      setClearingLogs(true)
      await logsApi.clear(clearFiles)
      clear()
      if (!liveMode) await loadStatic()
      alert(clearFiles ? 'Cleared memory + log files' : 'Cleared memory logs')
    } catch {
      alert('Clear logs failed')
    } finally {
      setClearingLogs(false)
    }
  }

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-0px)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Realtime Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Live DNS query stream with filters</p>
        </div>
        <div className="flex items-center gap-3">
          {liveMode && (
            <span className={clsx(
              'flex items-center gap-1 text-sm font-medium',
              connected ? 'text-green-600' : 'text-gray-400'
            )}>
              {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
              {connected ? 'Connected' : 'Connecting…'}
            </span>
          )}
          <button
            className={clsx(
              'btn',
              liveMode ? 'btn-primary' : 'btn-secondary'
            )}
            onClick={() => setLiveMode(true)}
          >
            Live
          </button>
          <button
            className={clsx(
              'btn',
              !liveMode ? 'btn-primary' : 'btn-secondary'
            )}
            onClick={() => setLiveMode(false)}
          >
            History
          </button>
          {liveMode && (
            <button className="btn-secondary" onClick={clear}>
              <Eraser size={14} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Upstreams ({upstreams.length}/5)</h2>
          <button className="btn btn-primary" onClick={saveUpstreams} disabled={savingUpstreams || upstreams.length > 5}>
            {savingUpstreams ? 'Saving…' : 'Save Upstreams'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {UPSTREAM_PRESETS.map((ip) => (
            <button
              key={ip}
              className={clsx('btn btn-secondary text-xs', upstreams.includes(ip) && 'ring-2 ring-primary-500')}
              onClick={() => togglePreset(ip)}
              type="button"
            >
              {ip}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input text-sm"
            placeholder="Custom upstream e.g. tcp+udp:1.1.1.1"
            value={customUpstream}
            onChange={(e) => setCustomUpstream(e.target.value)}
          />
          <button className="btn btn-secondary" type="button" onClick={addCustomUpstream} disabled={upstreams.length >= 5}>
            Add
          </button>
        </div>
        {upstreams.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {upstreams.map((item) => (
              <button key={item} className="badge-blue" onClick={() => setUpstreams((prev) => prev.filter((v) => v !== item))}>
                {item} ×
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <input
          className="input text-sm"
          placeholder="Filter domain…"
          value={filters.domain}
          onChange={(e) => setFilter('domain', e.target.value)}
        />
        <input
          className="input text-sm"
          placeholder="Filter client IP…"
          value={filters.clientIP}
          onChange={(e) => setFilter('clientIP', e.target.value)}
        />
        <input
          className="input text-sm"
          placeholder="Type (A, AAAA, CNAME...)"
          value={filters.recordType}
          onChange={(e) => setFilter('recordType', e.target.value.toUpperCase())}
        />
        <select
          className="input text-sm"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="BLOCKED">BLOCKED</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CACHED">CACHED</option>
        </select>
      </div>

      {/* Log table */}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-200 bg-white">
        {loadingStatic ? (
          <div className="p-6 text-gray-400 text-center">Loading…</div>
        ) : displayLogs.length === 0 ? (
          <div className="p-6 text-gray-400 text-center">
            {liveMode ? 'Waiting for log events…' : 'No logs found'}
          </div>
        ) : (
          <table className="w-full text-xs min-w-[1000px]">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Time</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Client</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Domain</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Upstream</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Resolved IP</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">ms</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayLogs.map((log) => (
                <tr
                  key={log.id}
                  className={clsx(
                    'hover:bg-gray-50',
                    log.status === 'BLOCKED' ? 'bg-red-50/30' : ''
                  )}
                >
                  <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{log.clientIP}</td>
                  <td className="px-3 py-1.5 font-mono">{log.domain}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{log.upstream ?? '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{log.resolvedIP ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {log.status === 'BLOCKED' ? (
                      <span className="badge-red flex items-center gap-1">
                        <ShieldOff size={10} /> BLOCKED
                      </span>
                    ) : log.status === 'RESOLVED' ? (
                      <span className="badge-green flex items-center gap-1">
                        <ShieldCheck size={10} /> RESOLVED
                      </span>
                    ) : (
                      <span className="badge-blue flex items-center gap-1">
                        <ShieldCheck size={10} /> {log.status || 'UNKNOWN'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{log.recordType ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-400">
                    {log.responseTime != null ? log.responseTime : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {liveMode && (
        <div className="flex items-center justify-between mt-2 gap-2">
          <p className="text-xs text-gray-400">
            Showing latest {displayLogs.length} events · SSE stream
          </p>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => clearBackendLogs(false)} disabled={clearingLogs}>
              Clear Memory Logs
            </button>
            <button className="btn-secondary" onClick={() => clearBackendLogs(true)} disabled={clearingLogs}>
              Clear Log Files
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
