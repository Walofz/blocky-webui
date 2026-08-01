import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, FileSpreadsheet, FileJson2, FileText, Eye, X, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { dashboardApi, DashboardData, LogEntry, logsApi } from '../api/client'

interface ReportPayload {
  generatedAt: string
  range: ReportRange
  summary: DashboardData['stats']
  rangeSummary: {
    total: number
    blocked: number
    resolved: number
    blockRate: number
  }
  system: DashboardData['system']
  configSummary: DashboardData['configSummary']
  topBlockedDomains: Array<{ domain: string; count: number }>
  topAllowedDomains: Array<{ domain: string; count: number }>
  topClients: Array<{ ip: string; count: number }>
  recentLogs: LogEntry[]
}

type ReportRange = '1h' | '24h' | '7d' | 'all'
type PdfLanguage = 'en' | 'th'
const REPORT_LANGUAGE_STORAGE_KEY = 'blocky-report-language'
const LOG_CHUNK_SIZE = 2000

export default function Reports() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [range, setRange] = useState<ReportRange>('24h')
  const [pdfLanguage, setPdfLanguage] = useState<PdfLanguage>(() => {
    if (typeof window === 'undefined') return 'en'
    const stored = window.localStorage.getItem(REPORT_LANGUAGE_STORAGE_KEY)
    return stored === 'th' || stored === 'en' ? stored : 'en'
  })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [fetchLimit, setFetchLimit] = useState(LOG_CHUNK_SIZE)
  const [hasMoreLogs, setHasMoreLogs] = useState(true)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const labels = useMemo(() => getUiLabels(pdfLanguage), [pdfLanguage])
  const rangeOptions = useMemo(() => getRangeOptions(pdfLanguage), [pdfLanguage])
  const locale = pdfLanguage === 'th' ? 'th-TH' : 'en-US'

  const load = async (limit = fetchLimit, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError(null)
      const [dashboardData, recentLogs] = await Promise.all([
        dashboardApi.get(),
        logsApi.list({ limit }),
      ])
      setDashboard(dashboardData)
      setLogs(recentLogs)
      setFetchLimit(limit)
      setHasMoreLogs(recentLogs.length >= limit)
    } catch {
      setError(labels.failedToGenerate)
    } finally {
      if (isLoadMore) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    load(LOG_CHUNK_SIZE)
  }, [])

  const loadMoreLogs = async () => {
    const nextLimit = fetchLimit + LOG_CHUNK_SIZE
    await load(nextLimit, true)
  }

  useEffect(() => {
    window.localStorage.setItem(REPORT_LANGUAGE_STORAGE_KEY, pdfLanguage)
  }, [pdfLanguage])

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl)
      }
    }
  }, [pdfPreviewUrl])

  const filteredLogs = useMemo(() => {
    if (range === 'all') return logs

    const now = Date.now()
    const cutoffMs =
      range === '1h'
        ? 60 * 60 * 1000
        : range === '24h'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000

    return logs.filter((entry) => {
      const timestamp = Date.parse(entry.timestamp)
      if (Number.isNaN(timestamp)) return false
      return now - timestamp <= cutoffMs
    })
  }, [logs, range])

  const blockedCount = useMemo(() => filteredLogs.filter((entry) => entry.status === 'BLOCKED').length, [filteredLogs])
  const resolvedCount = useMemo(() => filteredLogs.filter((entry) => entry.status === 'RESOLVED').length, [filteredLogs])
  const totalCount = filteredLogs.length
  const blockRate = useMemo(() => {
    if (totalCount === 0) return 0
    return (blockedCount / totalCount) * 100
  }, [blockedCount, totalCount])

  const logCountByRecordType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of filteredLogs) {
      const type = (entry.recordType || 'UNKNOWN').toUpperCase()
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([type, count]) => ({ type, count }))
  }, [filteredLogs])

  const topBlockedDomainsInRange = useMemo(
    () => buildTopDomainCounts(filteredLogs, (entry) => entry.action === 'block' || entry.status === 'BLOCKED', 10),
    [filteredLogs]
  )

  const topAllowedDomainsInRange = useMemo(
    () => buildTopDomainCounts(filteredLogs, (entry) => entry.action === 'allow' || entry.status === 'RESOLVED' || entry.status === 'CACHED', 10),
    [filteredLogs]
  )

  const topClientsInRange = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of filteredLogs) {
      const key = entry.clientIP?.trim()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }))
  }, [filteredLogs])

  const latencySummary = useMemo(() => {
    const values = filteredLogs
      .map((entry) => entry.responseTime)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      .sort((a, b) => a - b)

    if (values.length === 0) {
      return { samples: 0, p50: null as number | null, p95: null as number | null, p99: null as number | null }
    }

    return {
      samples: values.length,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
    }
  }, [filteredLogs])

  const reportPayload = useMemo<ReportPayload | null>(() => {
    if (!dashboard) return null
    return {
      generatedAt: new Date().toISOString(),
      range,
      summary: dashboard.stats,
      rangeSummary: {
        total: totalCount,
        blocked: blockedCount,
        resolved: resolvedCount,
        blockRate,
      },
      system: dashboard.system,
      configSummary: dashboard.configSummary,
      topBlockedDomains: topBlockedDomainsInRange,
      topAllowedDomains: topAllowedDomainsInRange,
      topClients: topClientsInRange,
      recentLogs: filteredLogs,
    }
  }, [
    dashboard,
    filteredLogs,
    range,
    totalCount,
    blockedCount,
    resolvedCount,
    blockRate,
    topBlockedDomainsInRange,
    topAllowedDomainsInRange,
    topClientsInRange,
  ])

  const exportJson = () => {
    if (!reportPayload) return
    const content = JSON.stringify(reportPayload, null, 2)
    downloadFile(content, `blocky-report-${formatFileDate()}.json`, 'application/json;charset=utf-8')
  }

  const exportCsv = () => {
    const header = ['timestamp', 'clientIP', 'domain', 'status', 'recordType', 'upstream', 'resolvedIP', 'responseTime']
    const rows = filteredLogs.map((entry) => [
      entry.timestamp,
      entry.clientIP,
      entry.domain,
      entry.status,
      entry.recordType ?? '',
      entry.upstream ?? '',
      entry.resolvedIP ?? '',
      entry.responseTime != null ? String(entry.responseTime) : '',
    ])

    const csv = [header, ...rows]
      .map((line) => line.map(escapeCsv).join(','))
      .join('\n')

    downloadFile(csv, `blocky-report-logs-${range}-${formatFileDate()}.csv`, 'text/csv;charset=utf-8')
  }

  const exportPdf = () => {
    if (!dashboard) return
    const doc = buildReportPdf({
      dashboard,
      range,
      totalCount,
      blockedCount,
      resolvedCount,
      blockRate,
      latencySummary,
      logCountByRecordType,
      topBlockedDomainsInRange,
      topAllowedDomainsInRange,
      topClientsInRange,
      language: pdfLanguage,
    })
    doc.save(`blocky-report-${range}-${pdfLanguage}-${formatFileDate()}.pdf`)
  }

  const previewPdf = () => {
    if (!dashboard) return
    const doc = buildReportPdf({
      dashboard,
      range,
      totalCount,
      blockedCount,
      resolvedCount,
      blockRate,
      latencySummary,
      logCountByRecordType,
      topBlockedDomainsInRange,
      topAllowedDomainsInRange,
      topClientsInRange,
      language: pdfLanguage,
    })
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl)
    }
    const blob = doc.output('blob')
    setPdfPreviewUrl(URL.createObjectURL(blob))
  }

  const closePreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl)
    }
    setPdfPreviewUrl(null)
  }

  const printPreview = () => {
    const frameWindow = previewFrameRef.current?.contentWindow
    if (!frameWindow) return
    frameWindow.focus()
    frameWindow.print()
  }

  if (loading && !dashboard) {
    return <div className="p-8 text-gray-500 dark:text-gray-300">{labels.preparingReport}</div>
  }

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>
  }

  if (!dashboard) {
    return <div className="p-8 text-gray-500 dark:text-gray-300">{labels.noReportData}</div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{labels.reportsTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
            {labels.reportsSubtitle}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 w-full xl:w-auto">
          <select
            className="input w-full"
            value={range}
            onChange={(event) => setRange(event.target.value as ReportRange)}
            aria-label={labels.reportTimeRange}
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className="input w-full"
            value={pdfLanguage}
            onChange={(event) => setPdfLanguage(event.target.value as PdfLanguage)}
            aria-label={labels.pdfLanguage}
          >
            <option value="en">{labels.pdfEnglish}</option>
            <option value="th">{labels.pdfThai}</option>
          </select>
          <button className="btn-secondary w-full justify-center" onClick={() => load(fetchLimit)} disabled={loading || loadingMore}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {labels.refresh}
          </button>
          <button className="btn-secondary w-full justify-center" onClick={exportJson} disabled={!reportPayload}>
            <FileJson2 size={14} /> {labels.exportJson}
          </button>
          <button className="btn-secondary w-full justify-center" onClick={previewPdf} disabled={!dashboard}>
            <Eye size={14} /> {labels.previewPdf}
          </button>
          <button className="btn-secondary w-full justify-center" onClick={exportPdf} disabled={!dashboard}>
            <FileText size={14} /> {labels.exportPdf}
          </button>
          <button className="btn-primary w-full justify-center sm:col-span-2 lg:col-span-3 xl:col-span-6" onClick={exportCsv} disabled={filteredLogs.length === 0}>
            <FileSpreadsheet size={14} /> {labels.exportCsv}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label={labels.overviewTitle} value={rangeOptions.find((option) => option.value === range)?.label ?? range} />
        <StatCard label={labels.totalInRange} value={totalCount.toLocaleString(locale)} />
        <StatCard label={`${labels.blocked} (${rangeOptions.find((option) => option.value === range)?.label})`} value={blockedCount.toLocaleString(locale)} color="text-red-600" />
        <StatCard label={`${labels.resolved} (${rangeOptions.find((option) => option.value === range)?.label})`} value={resolvedCount.toLocaleString(locale)} color="text-green-600" />
      </div>

      <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-300">
          {labels.loadedLogs}: {logs.length.toLocaleString(locale)}
        </p>
        <button
          className="btn-secondary w-full sm:w-auto justify-center"
          onClick={loadMoreLogs}
          disabled={loading || loadingMore || !hasMoreLogs}
        >
          {loadingMore ? labels.loadingMore : hasMoreLogs ? labels.loadMoreLogs : labels.allLogsLoaded}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.overviewSummary}</h3>
          <dl className="space-y-2 text-sm">
            <Row label={labels.totalInRange} value={totalCount.toLocaleString(locale)} />
            <Row label={labels.blockedInRange} value={blockedCount.toLocaleString(locale)} />
            <Row label={labels.resolvedInRange} value={resolvedCount.toLocaleString(locale)} />
            <Row label={labels.blockRateInRange} value={`${blockRate.toFixed(1)}%`} />
          </dl>
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.context24h}</h3>
          <dl className="space-y-2 text-sm">
            <Row label={labels.totalQueries24h} value={dashboard.stats.totalQueries.toLocaleString(locale)} />
            <Row label={labels.blocked24h} value={dashboard.stats.blocked.toLocaleString(locale)} />
            <Row label={labels.resolved24h} value={dashboard.stats.allowed.toLocaleString(locale)} />
            <Row label={labels.blockRate24h} value={`${dashboard.stats.blockRate.toFixed(1)}%`} />
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topBlockedByType}</h3>
          {logCountByRecordType.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noRecordTypeData}</p>
          ) : (
            <ul className="space-y-1">
              {logCountByRecordType.map((item) => (
                <li key={item.type} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{item.type}</span>
                  <span className="text-sm font-semibold text-red-600">{item.count.toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.latencyPercentiles}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-300 mb-3">{labels.latencyHelp}</p>
          <dl className="space-y-2 text-sm">
            <Row label={labels.samples} value={latencySummary.samples.toLocaleString(locale)} />
            <Row label="p50" value={formatMs(latencySummary.p50)} />
            <Row label="p95" value={formatMs(latencySummary.p95)} />
            <Row label="p99" value={formatMs(latencySummary.p99)} />
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Download size={16} className="text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{labels.reportSnapshot}</h2>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <Row label={labels.generatedAt} value={new Date().toLocaleString(locale)} />
          <Row label={labels.blockyStatus} value={dashboard.system.up ? labels.online : labels.offline} />
          <Row label={labels.configVersion} value={`v${dashboard.system.configVersion}`} />
          <Row label={labels.adsProfiles} value={dashboard.configSummary.adsProfileCount.toLocaleString(locale)} />
          <Row label={labels.groups} value={dashboard.configSummary.groupCount.toLocaleString(locale)} />
          <Row label={labels.dnsRecords} value={dashboard.configSummary.dnsRecordCount.toLocaleString(locale)} />
        </dl>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topBlockedDomains}</h3>
          {topBlockedDomainsInRange.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noDataYet}</p>
          ) : (
            <ul className="space-y-1">
              {topBlockedDomainsInRange.map((item) => (
                <li key={item.domain} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{item.domain}</span>
                  <span className="text-sm font-semibold text-red-600">{item.count.toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topAllowedDomains}</h3>
          {topAllowedDomainsInRange.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noDataYet}</p>
          ) : (
            <ul className="space-y-1">
              {topAllowedDomainsInRange.map((item) => (
                <li key={item.domain} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{item.domain}</span>
                  <span className="text-sm font-semibold text-green-600">{item.count.toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topClients}</h3>
          {topClientsInRange.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noDataYet}</p>
          ) : (
            <ul className="space-y-1">
              {topClientsInRange.map((item) => (
                <li key={item.ip} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{item.ip}</span>
                  <span className="text-sm font-semibold text-blue-600">{item.count.toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8">
          <div className="mx-auto h-full max-w-5xl rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{labels.pdfPreview}</h3>
              <div className="flex items-center gap-2">
                <button className="btn-secondary px-2 py-1" onClick={printPreview}>
                  <Printer size={14} /> {labels.print}
                </button>
                <button className="btn-secondary px-2 py-1" onClick={closePreview}>
                  <X size={14} /> {labels.close}
                </button>
              </div>
            </div>
            <iframe ref={previewFrameRef} title={labels.pdfPreview} src={pdfPreviewUrl} className="h-[calc(100%-56px)] w-full rounded-b-lg" />
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-300">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
      <dt className="text-gray-500 dark:text-gray-300">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  )
}

function formatMs(value: number | null): string {
  if (value == null) return 'n/a'
  return `${value.toFixed(1)} ms`
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * p) - 1))
  return sortedValues[index]
}

function buildReportPdf(input: {
  dashboard: DashboardData
  range: ReportRange
  totalCount: number
  blockedCount: number
  resolvedCount: number
  blockRate: number
  latencySummary: { samples: number; p50: number | null; p95: number | null; p99: number | null }
  logCountByRecordType: Array<{ type: string; count: number }>
  topBlockedDomainsInRange: Array<{ domain: string; count: number }>
  topAllowedDomainsInRange: Array<{ domain: string; count: number }>
  topClientsInRange: Array<{ ip: string; count: number }>
  language: PdfLanguage
}) {
  const {
    dashboard,
    range,
    totalCount,
    blockedCount,
    resolvedCount,
    blockRate,
    latencySummary,
    logCountByRecordType,
    topBlockedDomainsInRange,
    topAllowedDomainsInRange,
    topClientsInRange,
    language,
  } = input
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const labels = getPdfLabels(language)
  const locale = language === 'th' ? 'th-TH' : 'en-US'
  const generatedAt = new Date().toLocaleString(locale)
  const rangeLabels = getRangeOptions(language)
  const rangeLabel = rangeLabels.find((option) => option.value === range)?.label ?? range

  const margin = 14
  const pageWidth = 210
  const contentWidth = pageWidth - margin * 2

  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 36, 'F')
  doc.setFillColor(30, 64, 175)
  doc.rect(0, 30, pageWidth, 6, 'F')

  doc.setFillColor(255, 255, 255)
  doc.roundedRect(margin, 8, 14, 14, 2, 2, 'F')
  doc.setTextColor(30, 64, 175)
  doc.setFontSize(12)
  doc.text('B', margin + 7, 16.9, { align: 'center' })

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(17)
  doc.text(labels.title, margin + 18, 14)
  doc.setFontSize(10)
  doc.text(`${labels.generated} ${generatedAt}`, margin + 18, 21)
  doc.text(`${labels.range}: ${rangeLabel}`, pageWidth - margin, 21, { align: 'right' })

  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85)
  doc.text(`${labels.blocky}: ${dashboard.system.up ? labels.online : labels.offline}`, margin, 45)
  doc.text(`${labels.config}: v${dashboard.system.configVersion}`, margin + 62, 45)
  doc.text(`${labels.samples}: ${latencySummary.samples.toLocaleString(locale)}`, pageWidth - margin, 45, { align: 'right' })

  const cardY = 50
  const cardGap = 3
  const cardWidth = (contentWidth - cardGap * 3) / 4
  const cardHeight = 23

  drawKpiCard(doc, {
    x: margin,
    y: cardY,
    w: cardWidth,
    h: cardHeight,
    label: labels.totalInRange,
    value: totalCount.toLocaleString(locale),
    accent: [37, 99, 235],
  })
  drawKpiCard(doc, {
    x: margin + cardWidth + cardGap,
    y: cardY,
    w: cardWidth,
    h: cardHeight,
    label: labels.blockedInRange,
    value: blockedCount.toLocaleString(locale),
    accent: [220, 38, 38],
  })
  drawKpiCard(doc, {
    x: margin + (cardWidth + cardGap) * 2,
    y: cardY,
    w: cardWidth,
    h: cardHeight,
    label: labels.resolvedInRange,
    value: resolvedCount.toLocaleString(locale),
    accent: [185, 28, 28],
  })
  drawKpiCard(doc, {
    x: margin + (cardWidth + cardGap) * 3,
    y: cardY,
    w: cardWidth,
    h: cardHeight,
    label: labels.blockRateInRange,
    value: `${blockRate.toFixed(1)}%`,
    accent: [22, 163, 74],
  })

  const panelY1 = 79
  const panelGap = 4
  const panelWidth = (contentWidth - panelGap) / 2
  const panelHeight = 52

  drawDataPanel(doc, {
    x: margin,
    y: panelY1,
    w: panelWidth,
    h: panelHeight,
    title: labels.latency,
    accent: [37, 99, 235],
    rows: [
      { left: 'p50', right: formatMs(latencySummary.p50) },
      { left: 'p95', right: formatMs(latencySummary.p95) },
      { left: 'p99', right: formatMs(latencySummary.p99) },
      { left: labels.samples, right: latencySummary.samples.toLocaleString(locale) },
    ],
  })

  drawDataPanel(doc, {
    x: margin + panelWidth + panelGap,
    y: panelY1,
    w: panelWidth,
    h: panelHeight,
    title: labels.topBlockedByType,
    accent: [220, 38, 38],
    rows: (logCountByRecordType.length === 0
      ? [{ left: labels.noData, right: '-' }]
      : logCountByRecordType.slice(0, 6).map((item) => ({
          left: item.type,
          right: item.count.toLocaleString(locale),
        }))),
  })

  const panelY2 = panelY1 + panelHeight + 5
  const listPanelHeight = 70

  drawDataPanel(doc, {
    x: margin,
    y: panelY2,
    w: panelWidth,
    h: listPanelHeight,
    title: labels.topBlockedDomains,
    accent: [185, 28, 28],
    rows: (topBlockedDomainsInRange.length === 0
      ? [{ left: labels.noData, right: '-' }]
      : topBlockedDomainsInRange.slice(0, 10).map((item, index) => ({
          left: `${index + 1}. ${item.domain}`,
          right: item.count.toLocaleString(locale),
        }))),
  })

  drawDataPanel(doc, {
    x: margin + panelWidth + panelGap,
    y: panelY2,
    w: panelWidth,
    h: listPanelHeight,
    title: labels.topAllowedDomains,
    accent: [22, 163, 74],
    rows: (topAllowedDomainsInRange.length === 0
      ? [{ left: labels.noData, right: '-' }]
      : topAllowedDomainsInRange.slice(0, 10).map((item, index) => ({
          left: `${index + 1}. ${item.domain}`,
          right: item.count.toLocaleString(locale),
        }))),
  })

  const panelY3 = panelY2 + listPanelHeight + 5
  drawDataPanel(doc, {
    x: margin,
    y: panelY3,
    w: contentWidth,
    h: 60,
    title: labels.topClients,
    accent: [37, 99, 235],
    rows: (topClientsInRange.length === 0
      ? [{ left: labels.noData, right: '-' }]
      : topClientsInRange.slice(0, 10).map((item, index) => ({
          left: `${index + 1}. ${item.ip}`,
          right: item.count.toLocaleString(locale),
        }))),
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, 286, pageWidth - margin, 286)
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(9)
    doc.text('Blocky WebUI', margin, 291)
    doc.text(generatedAt, margin + 36, 291)
    doc.text(`${page}/${pageCount}`, pageWidth - margin, 291, { align: 'right' })
  }

  return doc
}

function drawKpiCard(doc: jsPDF, options: {
  x: number
  y: number
  w: number
  h: number
  label: string
  value: string
  accent: [number, number, number]
}) {
  const { x, y, w, h, label, value, accent } = options
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(x, y, w, 2.3, 'F')

  doc.setTextColor(71, 85, 105)
  doc.setFontSize(8)
  doc.text(fitText(doc, label, w - 4), x + 2, y + 8)

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(12)
  doc.text(fitText(doc, value, w - 4), x + 2, y + 16.5)
}

function drawDataPanel(doc: jsPDF, options: {
  x: number
  y: number
  w: number
  h: number
  title: string
  accent: [number, number, number]
  rows: Array<{ left: string; right: string }>
}) {
  const { x, y, w, h, title, accent, rows } = options
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(x, y, w, 8, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9.5)
  doc.text(fitText(doc, title, w - 4), x + 2, y + 5.6)

  doc.setTextColor(30, 41, 59)
  doc.setFontSize(9)
  const startY = y + 13
  const rowHeight = 4.4
  const visibleRows = Math.max(1, Math.floor((h - 14) / rowHeight))

  rows.slice(0, visibleRows).forEach((row, index) => {
    const rowY = startY + index * rowHeight
    if (index > 0) {
      doc.setDrawColor(241, 245, 249)
      doc.line(x + 1.5, rowY - 2.4, x + w - 1.5, rowY - 2.4)
    }

    doc.text(fitText(doc, row.left, w - 33), x + 2, rowY)
    doc.text(fitText(doc, row.right, 27), x + w - 2, rowY, { align: 'right' })
  })
}

function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text

  let trimmed = text
  while (trimmed.length > 0 && doc.getTextWidth(`${trimmed}...`) > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }

  return trimmed.length > 0 ? `${trimmed}...` : '...'
}

function buildTopDomainCounts(
  logs: LogEntry[],
  predicate: (entry: LogEntry) => boolean,
  limit: number
): Array<{ domain: string; count: number }> {
  const counts = new Map<string, number>()

  for (const entry of logs) {
    if (!predicate(entry)) continue
    const domain = entry.domain?.trim().toLowerCase()
    if (!domain) continue
    counts.set(domain, (counts.get(domain) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }))
}

function getPdfLabels(language: PdfLanguage) {
  if (language === 'th') {
    return {
      title: 'รายงาน Blocky WebUI',
      generated: 'สร้างเมื่อ',
      range: 'ช่วงเวลา',
      blocky: 'สถานะ Blocky',
      config: 'เวอร์ชันคอนฟิก',
      online: 'ออนไลน์',
      offline: 'ออฟไลน์',
      summary: 'สรุปภาพรวม',
      totalQueries24h: 'คำขอทั้งหมด (24 ชม.)',
      blocked24h: 'บล็อกแล้ว (24 ชม.)',
      filteredBlocked: 'บล็อกจากข้อมูลกรอง',
      filteredResolved: 'ผ่านการแก้ไขจากข้อมูลกรอง',
      latency: 'เปอร์เซ็นไทล์ความหน่วง',
      samples: 'จำนวนตัวอย่าง',
      topBlockedDomains: 'โดเมนที่ถูกบล็อกสูงสุด',
      topAllowedDomains: 'โดเมนที่อนุญาตสูงสุด',
      topBlockedByType: 'การบล็อกสูงสุดตามชนิดเรคคอร์ด',
      topClients: 'ไคลเอนต์สูงสุด',
      noData: 'ไม่มีข้อมูล',
      totalInRange: 'คำขอในช่วงเวลา',
      blockedInRange: 'บล็อกในช่วงเวลา',
      resolvedInRange: 'ผ่านการแก้ไขในช่วงเวลา',
      blockRateInRange: 'อัตราบล็อกในช่วงเวลา',
    }
  }

  return {
    title: 'Blocky WebUI Report',
    generated: 'Generated',
    range: 'Range',
    blocky: 'Blocky',
    config: 'Config',
    online: 'Online',
    offline: 'Offline',
    summary: 'Summary',
    totalQueries24h: 'Total Queries (24h)',
    blocked24h: 'Blocked (24h)',
    filteredBlocked: 'Filtered Blocked Logs',
    filteredResolved: 'Filtered Resolved Logs',
    latency: 'Latency Percentiles',
    samples: 'Samples',
    topBlockedDomains: 'Top Blocked Domains',
    topAllowedDomains: 'Top Allowed Domains',
    topBlockedByType: 'Top Blocked by Record Type',
    topClients: 'Top Clients',
    noData: 'No data',
    totalInRange: 'Total In Range',
    blockedInRange: 'Blocked In Range',
    resolvedInRange: 'Resolved In Range',
    blockRateInRange: 'Block Rate In Range',
  }
}

function getRangeOptions(language: PdfLanguage): Array<{ value: ReportRange; label: string }> {
  if (language === 'th') {
    return [
      { value: '1h', label: 'ย้อนหลัง 1 ชม.' },
      { value: '24h', label: 'ย้อนหลัง 24 ชม.' },
      { value: '7d', label: 'ย้อนหลัง 7 วัน' },
      { value: 'all', label: 'ทั้งหมดที่โหลด' },
    ]
  }

  return [
    { value: '1h', label: 'Last 1h' },
    { value: '24h', label: 'Last 24h' },
    { value: '7d', label: 'Last 7d' },
    { value: 'all', label: 'All loaded' },
  ]
}

function getUiLabels(language: PdfLanguage) {
  if (language === 'th') {
    return {
      failedToGenerate: 'สร้างข้อมูลรายงานไม่สำเร็จ',
      preparingReport: 'กำลังเตรียมรายงาน...',
      noReportData: 'ยังไม่มีข้อมูลรายงาน',
      reportsTitle: 'รายงาน',
      reportsSubtitle: 'ส่งออกภาพรวมจากสถิติแดชบอร์ดและบันทึกคำขอล่าสุดได้ทันที',
      reportTimeRange: 'ช่วงเวลารายงาน',
      pdfLanguage: 'ภาษา PDF',
      pdfEnglish: 'PDF: English',
      pdfThai: 'PDF: ไทย',
      refresh: 'รีเฟรช',
      loadingMore: 'กำลังโหลดเพิ่ม...',
      loadMoreLogs: 'โหลด log เพิ่ม',
      allLogsLoaded: 'โหลดครบเท่าที่มีแล้ว',
      loadedLogs: 'จำนวน log ที่โหลด',
      exportJson: 'ส่งออก JSON',
      previewPdf: 'พรีวิว PDF',
      exportPdf: 'ส่งออก PDF',
      exportCsv: 'ส่งออก CSV Logs',
      overviewTitle: 'ภาพรวม',
      overviewSummary: 'ภาพรวมตามช่วงเวลาที่เลือก',
      context24h: 'บริบท 24 ชั่วโมงล่าสุด',
      totalInRange: 'คำขอในช่วงเวลา',
      blockedInRange: 'บล็อกในช่วงเวลา',
      resolvedInRange: 'ผ่านการแก้ไขในช่วงเวลา',
      blockRateInRange: 'อัตราบล็อกในช่วงเวลา',
      totalQueries24h: 'คำขอทั้งหมด (24 ชม.)',
      blocked24h: 'บล็อกแล้ว (24 ชม.)',
      resolved24h: 'ผ่านการแก้ไข (24 ชม.)',
      blockRate24h: 'อัตราบล็อก (24 ชม.)',
      blocked: 'บล็อก',
      resolved: 'ผ่านการแก้ไข',
      topBlockedByType: 'การบล็อกสูงสุดตามชนิดเรคคอร์ด',
      noRecordTypeData: 'ไม่มีข้อมูลชนิดเรคคอร์ดในช่วงเวลาที่เลือก',
      latencyPercentiles: 'เปอร์เซ็นไทล์ความหน่วง',
      latencyHelp: 'p50 = 50% ของคำขอตอบได้เร็วกว่า/เท่าค่านี้, p95 = 95% เร็วกว่า/เท่าค่านี้, p99 = 99% เร็วกว่า/เท่าค่านี้',
      samples: 'จำนวนตัวอย่าง',
      reportSnapshot: 'สแนปช็อตรายงาน',
      generatedAt: 'สร้างเมื่อ',
      blockyStatus: 'สถานะ Blocky',
      configVersion: 'เวอร์ชันคอนฟิก',
      adsProfiles: 'โปรไฟล์โฆษณา',
      groups: 'กลุ่ม',
      dnsRecords: 'ระเบียน DNS',
      online: 'ออนไลน์',
      offline: 'ออฟไลน์',
      topBlockedDomains: 'โดเมนที่ถูกบล็อกสูงสุด',
      topAllowedDomains: 'โดเมนที่อนุญาตสูงสุด',
      topClients: 'ไคลเอนต์สูงสุด',
      noDataYet: 'ยังไม่มีข้อมูล',
      pdfPreview: 'พรีวิว PDF',
      print: 'พิมพ์',
      close: 'ปิด',
    }
  }

  return {
    failedToGenerate: 'Failed to generate report data',
    preparingReport: 'Preparing report...',
    noReportData: 'No report data available',
    reportsTitle: 'Reports',
    reportsSubtitle: 'Export quick snapshots from dashboard metrics and recent query logs.',
    reportTimeRange: 'Report time range',
    pdfLanguage: 'PDF language',
    pdfEnglish: 'PDF: English',
    pdfThai: 'PDF: ไทย',
    refresh: 'Refresh',
    loadingMore: 'Loading more...',
    loadMoreLogs: 'Load more logs',
    allLogsLoaded: 'All available logs loaded',
    loadedLogs: 'Loaded logs',
    exportJson: 'Export JSON',
    previewPdf: 'Preview PDF',
    exportPdf: 'Export PDF',
    exportCsv: 'Export Logs CSV',
    overviewTitle: 'Overview',
    overviewSummary: 'Overview by Selected Range',
    context24h: 'Last 24h Context',
    totalInRange: 'Total In Range',
    blockedInRange: 'Blocked In Range',
    resolvedInRange: 'Resolved In Range',
    blockRateInRange: 'Block Rate In Range',
    totalQueries24h: 'Total Queries (24h)',
    blocked24h: 'Blocked (24h)',
    resolved24h: 'Resolved (24h)',
    blockRate24h: 'Block Rate (24h)',
    blocked: 'Blocked',
    resolved: 'Resolved',
    topBlockedByType: 'Top Blocked By Record Type',
    noRecordTypeData: 'No record type data in selected range',
    latencyPercentiles: 'Latency Percentiles',
    latencyHelp: 'p50 = 50% of requests are this fast or faster, p95 = 95% are this fast or faster, p99 = 99% are this fast or faster.',
    samples: 'Samples',
    reportSnapshot: 'Report Snapshot',
    generatedAt: 'Generated At',
    blockyStatus: 'Blocky Status',
    configVersion: 'Config Version',
    adsProfiles: 'Ads Profiles',
    groups: 'Groups',
    dnsRecords: 'DNS Records',
    online: 'Online',
    offline: 'Offline',
    topBlockedDomains: 'Top Blocked Domains',
    topAllowedDomains: 'Top Allowed Domains',
    topClients: 'Top Clients',
    noDataYet: 'No data yet',
    pdfPreview: 'PDF Preview',
    print: 'Print',
    close: 'Close',
  }
}

function formatFileDate(): string {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function escapeCsv(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
