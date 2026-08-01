import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, RefreshCw, FileSpreadsheet, FileJson2, FileText, Eye, X, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { dashboardApi, DashboardData, LogEntry, logsApi } from '../api/client'

interface ReportPayload {
  generatedAt: string
  range: ReportRange
  summary: DashboardData['stats']
  system: DashboardData['system']
  configSummary: DashboardData['configSummary']
  topBlockedDomains: DashboardData['topBlockedDomains']
  topClients: DashboardData['topClients']
  recentLogs: LogEntry[]
}

type ReportRange = '1h' | '24h' | '7d' | 'all'
type PdfLanguage = 'en' | 'th'
const REPORT_LANGUAGE_STORAGE_KEY = 'blocky-report-language'

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
  const [error, setError] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const labels = useMemo(() => getUiLabels(pdfLanguage), [pdfLanguage])
  const rangeOptions = useMemo(() => getRangeOptions(pdfLanguage), [pdfLanguage])
  const locale = pdfLanguage === 'th' ? 'th-TH' : 'en-US'

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const [dashboardData, recentLogs] = await Promise.all([
        dashboardApi.get(),
        logsApi.list({ limit: 2000 }),
      ])
      setDashboard(dashboardData)
      setLogs(recentLogs)
    } catch {
      setError(labels.failedToGenerate)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

  const reportPayload = useMemo<ReportPayload | null>(() => {
    if (!dashboard) return null
    return {
      generatedAt: new Date().toISOString(),
      range,
      summary: dashboard.stats,
      system: dashboard.system,
      configSummary: dashboard.configSummary,
      topBlockedDomains: dashboard.topBlockedDomains,
      topClients: dashboard.topClients,
      recentLogs: filteredLogs,
    }
  }, [dashboard, filteredLogs, range])

  const blockedCount = useMemo(() => filteredLogs.filter((entry) => entry.status === 'BLOCKED').length, [filteredLogs])
  const resolvedCount = useMemo(() => filteredLogs.filter((entry) => entry.status === 'RESOLVED').length, [filteredLogs])
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
      blockedCount,
      resolvedCount,
      latencySummary,
      logCountByRecordType,
      language: pdfLanguage,
    })
    doc.save(`blocky-report-${range}-${pdfLanguage}-${formatFileDate()}.pdf`)
  }

  const previewPdf = () => {
    if (!dashboard) return
    const doc = buildReportPdf({
      dashboard,
      range,
      blockedCount,
      resolvedCount,
      latencySummary,
      logCountByRecordType,
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
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{labels.reportsTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">
            {labels.reportsSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="input max-w-[9rem]"
            value={range}
            onChange={(event) => setRange(event.target.value as ReportRange)}
            aria-label={labels.reportTimeRange}
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select
            className="input max-w-[11rem]"
            value={pdfLanguage}
            onChange={(event) => setPdfLanguage(event.target.value as PdfLanguage)}
            aria-label={labels.pdfLanguage}
          >
            <option value="en">{labels.pdfEnglish}</option>
            <option value="th">{labels.pdfThai}</option>
          </select>
          <button className="btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {labels.refresh}
          </button>
          <button className="btn-secondary" onClick={exportJson} disabled={!reportPayload}>
            <FileJson2 size={14} /> {labels.exportJson}
          </button>
          <button className="btn-secondary" onClick={previewPdf} disabled={!dashboard}>
            <Eye size={14} /> {labels.previewPdf}
          </button>
          <button className="btn-secondary" onClick={exportPdf} disabled={!dashboard}>
            <FileText size={14} /> {labels.exportPdf}
          </button>
          <button className="btn-primary" onClick={exportCsv} disabled={filteredLogs.length === 0}>
            <FileSpreadsheet size={14} /> {labels.exportCsv}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label={labels.totalQueries24h} value={dashboard.stats.totalQueries.toLocaleString(locale)} />
        <StatCard label={labels.blocked24h} value={dashboard.stats.blocked.toLocaleString(locale)} color="text-red-600" />
        <StatCard label={`${labels.blocked} (${rangeOptions.find((option) => option.value === range)?.label})`} value={blockedCount.toLocaleString(locale)} color="text-red-600" />
        <StatCard label={`${labels.resolved} (${rangeOptions.find((option) => option.value === range)?.label})`} value={resolvedCount.toLocaleString(locale)} color="text-green-600" />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topBlockedDomains}</h3>
          {dashboard.topBlockedDomains.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noDataYet}</p>
          ) : (
            <ul className="space-y-1">
              {dashboard.topBlockedDomains.slice(0, 10).map((item) => (
                <li key={item.domain} className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-1">
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{item.domain}</span>
                  <span className="text-sm font-semibold text-red-600">{item.count.toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">{labels.topClients}</h3>
          {dashboard.topClients.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-300">{labels.noDataYet}</p>
          ) : (
            <ul className="space-y-1">
              {dashboard.topClients.slice(0, 10).map((item) => (
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
  blockedCount: number
  resolvedCount: number
  latencySummary: { samples: number; p50: number | null; p95: number | null; p99: number | null }
  logCountByRecordType: Array<{ type: string; count: number }>
  language: PdfLanguage
}) {
  const { dashboard, range, blockedCount, resolvedCount, latencySummary, logCountByRecordType, language } = input
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 14
  const lineGap = 6
  const labels = getPdfLabels(language)
  const generatedAt = new Date().toLocaleString(language === 'th' ? 'th-TH' : 'en-US')
  const rangeLabels = getRangeOptions(language)

  doc.setFillColor(29, 78, 216)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(12, 8, 18, 12, 2, 2, 'F')
  doc.setFontSize(10)
  doc.setTextColor(29, 78, 216)
  doc.text('B', 20.2, 16.2, { align: 'center' })
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text(labels.title, 35, 16)
  doc.setFontSize(10)
  doc.text(`${labels.generated} ${generatedAt}`, 35, 22)

  y = 36
  doc.setTextColor(15, 23, 42)
  doc.setFontSize(11)
  doc.text(`${labels.range}: ${rangeLabels.find((option) => option.value === range)?.label ?? range}`, 14, y)
  doc.text(`${labels.blocky}: ${dashboard.system.up ? labels.online : labels.offline}`, 75, y)
  doc.text(`${labels.config}: v${dashboard.system.configVersion}`, 125, y)

  y += 10
  doc.setFontSize(12)
  doc.text(labels.summary, 14, y)
  y += lineGap
  doc.setFontSize(10)
  doc.text(`${labels.totalQueries24h}: ${dashboard.stats.totalQueries.toLocaleString()}`, 16, y)
  y += lineGap
  doc.text(`${labels.blocked24h}: ${dashboard.stats.blocked.toLocaleString()}`, 16, y)
  y += lineGap
  doc.text(`${labels.filteredBlocked}: ${blockedCount.toLocaleString()}`, 16, y)
  y += lineGap
  doc.text(`${labels.filteredResolved}: ${resolvedCount.toLocaleString()}`, 16, y)

  y += 9
  doc.setFontSize(12)
  doc.text(labels.latency, 14, y)
  y += lineGap
  doc.setFontSize(10)
  doc.text(`${labels.samples}: ${latencySummary.samples.toLocaleString()}`, 16, y)
  y += lineGap
  doc.text(`p50: ${formatMs(latencySummary.p50)}`, 16, y)
  y += lineGap
  doc.text(`p95: ${formatMs(latencySummary.p95)}`, 16, y)
  y += lineGap
  doc.text(`p99: ${formatMs(latencySummary.p99)}`, 16, y)

  y += 9
  doc.setFontSize(12)
  doc.text(labels.topBlockedDomains, 14, y)
  y += lineGap
  doc.setFontSize(10)
  dashboard.topBlockedDomains.slice(0, 8).forEach((item) => {
    if (y > 270) {
      doc.addPage()
      y = 14
    }
    doc.text(`${item.domain} - ${item.count.toLocaleString()}`, 16, y)
    y += 5
  })

  y += 6
  doc.setFontSize(12)
  doc.text(labels.topBlockedByType, 14, y)
  y += lineGap
  doc.setFontSize(10)
  if (logCountByRecordType.length === 0) {
    doc.text(labels.noData, 16, y)
    y += 5
  } else {
    logCountByRecordType.forEach((item) => {
      if (y > 270) {
        doc.addPage()
        y = 14
      }
      doc.text(`${item.type} - ${item.count.toLocaleString()}`, 16, y)
      y += 5
    })
  }

  y += 6
  doc.setFontSize(12)
  doc.text(labels.topClients, 14, y)
  y += lineGap
  doc.setFontSize(10)
  dashboard.topClients.slice(0, 8).forEach((item) => {
    if (y > 270) {
      doc.addPage()
      y = 14
    }
    doc.text(`${item.ip} - ${item.count.toLocaleString()}`, 16, y)
    y += 5
  })

  return doc
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
      topBlockedByType: 'การบล็อกสูงสุดตามชนิดเรคคอร์ด',
      topClients: 'ไคลเอนต์สูงสุด',
      noData: 'ไม่มีข้อมูล',
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
    topBlockedByType: 'Top Blocked by Record Type',
    topClients: 'Top Clients',
    noData: 'No data',
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
      exportJson: 'ส่งออก JSON',
      previewPdf: 'พรีวิว PDF',
      exportPdf: 'ส่งออก PDF',
      exportCsv: 'ส่งออก CSV Logs',
      totalQueries24h: 'คำขอทั้งหมด (24 ชม.)',
      blocked24h: 'บล็อกแล้ว (24 ชม.)',
      blocked: 'บล็อก',
      resolved: 'ผ่านการแก้ไข',
      topBlockedByType: 'การบล็อกสูงสุดตามชนิดเรคคอร์ด',
      noRecordTypeData: 'ไม่มีข้อมูลชนิดเรคคอร์ดในช่วงเวลาที่เลือก',
      latencyPercentiles: 'เปอร์เซ็นไทล์ความหน่วง',
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
    exportJson: 'Export JSON',
    previewPdf: 'Preview PDF',
    exportPdf: 'Export PDF',
    exportCsv: 'Export Logs CSV',
    totalQueries24h: 'Total Queries (24h)',
    blocked24h: 'Blocked (24h)',
    blocked: 'Blocked',
    resolved: 'Resolved',
    topBlockedByType: 'Top Blocked By Record Type',
    noRecordTypeData: 'No record type data in selected range',
    latencyPercentiles: 'Latency Percentiles',
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
