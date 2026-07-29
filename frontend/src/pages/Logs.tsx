import React, { useEffect, useState } from 'react'
import { Wifi, WifiOff, Eraser, ShieldCheck, ShieldOff } from 'lucide-react'
import clsx from 'clsx'
import { useLogStream } from '../hooks/useLogStream'
import { logsApi, LogEntry, dnsApi } from '../api/client'

interface Filters {
  domain: string
  clientIP: string
  group: string
  action: string
}

export default function Logs() {
  const [filters, setFilters] = useState<Filters>({ domain: '', clientIP: '', group: '', action: '' })
  const [liveMode, setLiveMode] = useState(true)
  const [staticLogs, setStaticLogs] = useState<LogEntry[]>([])
  const [loadingStatic, setLoadingStatic] = useState(false)

  const { logs: streamLogs, connected, clear } = useLogStream(
    liveMode ? filters : { domain: '', clientIP: '', group: '', action: '' }
  )

  const loadStatic = async () => {
    try {
      setLoadingStatic(true)
      setStaticLogs(await logsApi.list({
        domain: filters.domain || undefined,
        clientIP: filters.clientIP || undefined,
        group: filters.group || undefined,
        action: filters.action || undefined,
        limit: 200,
      }))
    } finally {
      setLoadingStatic(false)
    }
  }

  useEffect(() => {
    if (!liveMode) loadStatic()
  }, [liveMode, filters])

  const displayLogs = liveMode ? streamLogs : staticLogs

  const handleAllowlist = async (domain: string) => {
    try {
      await dnsApi.quickAllowlist(domain)
      alert(`Allowlist action triggered for: ${domain}`)
    } catch {
      alert('Failed to trigger allowlist action')
    }
  }

  const setFilter = (key: keyof Filters, val: string) =>
    setFilters((f) => ({ ...f, [key]: val }))

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
          placeholder="Filter group…"
          value={filters.group}
          onChange={(e) => setFilter('group', e.target.value)}
        />
        <select
          className="input text-sm"
          value={filters.action}
          onChange={(e) => setFilter('action', e.target.value)}
        >
          <option value="">All actions</option>
          <option value="allow">Allow</option>
          <option value="block">Block</option>
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
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Action</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Matched List</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">Group</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-500">ms</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayLogs.map((log) => (
                <tr
                  key={log.id}
                  className={clsx(
                    'hover:bg-gray-50',
                    log.action === 'block' ? 'bg-red-50/30' : ''
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
                    {log.action === 'block' ? (
                      <span className="badge-red flex items-center gap-1">
                        <ShieldOff size={10} /> Block
                      </span>
                    ) : (
                      <span className="badge-green flex items-center gap-1">
                        <ShieldCheck size={10} /> Allow
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{log.matchedList ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500">{log.matchedGroup ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-400">
                    {log.responseTime != null ? log.responseTime : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => handleAllowlist(log.domain)}
                      className="text-xs text-primary-600 hover:underline whitespace-nowrap"
                      title="Quick allowlist"
                    >
                      Allowlist
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {liveMode && (
        <p className="text-xs text-gray-400 mt-2">
          Showing latest {displayLogs.length} events · SSE stream
        </p>
      )}
    </div>
  )
}
