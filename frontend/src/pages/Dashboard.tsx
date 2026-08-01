import React, { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { RefreshCw, ShieldOff, ShieldCheck, Activity, Database } from 'lucide-react'
import { dashboardApi, DashboardData } from '../api/client'
import clsx from 'clsx'

type TimeRange = '1h' | '24h' | '7d'

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={clsx('text-3xl font-bold', color ?? 'text-gray-900')}>{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<TimeRange>('1h')
  const [error, setError] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  const countFormatter = new Intl.NumberFormat()
  const percentFormatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })

  const formatCount = (value: number) => countFormatter.format(value)
  const formatPercent = (value: number) => `${percentFormatter.format(value)}%`

  const load = async () => {
    try {
      setLoading(true)
      setData(await dashboardApi.get())
      setError(null)
    } catch (e) {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDarkMode(root.classList.contains('dark'))
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  if (loading && !data) return (
    <div className="p-8 text-gray-500">Loading dashboard…</div>
  )

  if (error) return (
    <div className="p-8 text-red-600">{error}</div>
  )

  const d = data!
  const timelineData = d.timelines[range]
  const chartGridColor = isDarkMode ? '#334155' : '#f0f0f0'
  const chartTickColor = isDarkMode ? '#cbd5e1' : '#334155'
  const tooltipBackground = isDarkMode ? '#0f172a' : '#ffffff'
  const tooltipText = isDarkMode ? '#e2e8f0' : '#0f172a'
  const blockedFill = isDarkMode ? '#7f1d1d' : '#fee2e2'
  const allowedFill = isDarkMode ? '#14532d' : '#dcfce7'

  const formatTime = (iso: string) => {
    const dt = new Date(iso)
    if (range === '7d') return dt.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
    return dt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className={clsx(
            'flex items-center gap-1 text-sm font-medium',
            d.system.up ? 'text-green-600' : 'text-red-600'
          )}>
            <Activity size={16} />
            {d.system.up ? 'Blocky Online' : 'Blocky Offline'}
          </span>
          <button onClick={load} className="btn-secondary w-full sm:w-auto justify-center" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Queries" value={formatCount(d.stats.totalQueries)} sub="last 24h" />
        <StatCard
          label="Blocked"
          value={formatCount(d.stats.blocked)}
          color="text-red-600"
          sub="queries blocked in last 24h"
        />
        <StatCard
          label="Allowed"
          value={formatCount(d.stats.allowed)}
          color="text-green-600"
          sub="queries allowed in last 24h"
        />
        <StatCard
          label="Block Rate"
          value={formatPercent(d.stats.blockRate)}
          color={d.stats.blockRate > 50 ? 'text-orange-600' : 'text-blue-600'}
          sub="last 24h"
        />
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Query Timeline</h2>
          <div className="flex flex-wrap gap-1">
            {(['1h', '24h', '7d'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={clsx(
                  'px-3 py-1 rounded text-sm font-medium transition-colors min-w-[3rem]',
                  range === r
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
            <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 11, fill: chartTickColor }} />
            <YAxis tick={{ fontSize: 11, fill: chartTickColor }} />
            <Tooltip
              labelFormatter={(l) => formatTime(String(l))}
              formatter={(v: number, name: string) => [v, name === 'blocked' ? 'Blocked' : 'Allowed']}
              contentStyle={{
                backgroundColor: tooltipBackground,
                borderColor: chartGridColor,
                color: tooltipText,
              }}
              labelStyle={{ color: tooltipText }}
              itemStyle={{ color: tooltipText }}
            />
            <Legend />
            <Area type="monotone" dataKey="blocked" stackId="1" stroke="#ef4444" fill={blockedFill} name="blocked" />
            <Area type="monotone" dataKey="allowed" stackId="1" stroke="#22c55e" fill={allowedFill} name="allowed" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top domains + clients */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldOff size={18} className="text-red-500" /> Top Blocked Domains
          </h2>
          {d.topBlockedDomains.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.topBlockedDomains.map(({ domain, count }) => (
                  <tr key={domain} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <td className="py-1.5 text-gray-700 dark:text-gray-200 font-mono text-xs">{domain}</td>
                    <td className="py-1.5 text-right font-semibold text-red-600">{formatCount(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Database size={18} className="text-blue-500" /> Top Clients
          </h2>
          {d.topClients.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.topClients.map(({ ip, count }) => (
                  <tr key={ip} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <td className="py-1.5 font-mono text-xs text-gray-700 dark:text-gray-200">{ip}</td>
                    <td className="py-1.5 text-right font-semibold text-blue-600">{formatCount(count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Groups health + system status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-green-500" /> Groups Health
          </h2>
          {d.groupsHealth.length === 0 ? (
            <p className="text-sm text-gray-400">No groups configured</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left pb-1">Group</th>
                  <th className="text-left pb-1">Profile</th>
                  <th className="text-right pb-1">Clients</th>
                </tr>
              </thead>
              <tbody>
                {d.groupsHealth.map((g) => (
                  <tr key={g.name} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <td className="py-1.5 font-medium text-gray-900 dark:text-gray-100">{g.name}</td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-300">{g.adsProfile}</td>
                    <td className="py-1.5 text-right text-gray-500 dark:text-gray-300">{formatCount(g.clientCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">System Status</h2>
          <div className="space-y-2 text-sm">
            <Row label="Blocky Status" value={
              <span className={d.system.up ? 'badge-green' : 'badge-red'}>
                {d.system.up ? 'Online' : 'Offline'}
              </span>
            } />
            <Row label="Last Reload" value={d.system.lastReloadAt
              ? new Date(d.system.lastReloadAt).toLocaleString()
              : 'Never'} />
            <Row label="Reload Status" value={
              <span className={d.system.lastReloadStatus === 'ok' ? 'badge-green' : d.system.lastReloadStatus === 'error' ? 'badge-red' : 'badge-gray'}>
                {d.system.lastReloadStatus}
              </span>
            } />
            <Row label="Config Version" value={`v${d.system.configVersion}`} />
            <Row label="Ads Profiles" value={formatCount(d.configSummary.adsProfileCount)} />
            <Row label="Groups" value={formatCount(d.configSummary.groupCount)} />
            <Row label="DNS Records" value={formatCount(d.configSummary.dnsRecordCount)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0 last:pb-0">
      <span className="text-gray-500 dark:text-gray-300">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
