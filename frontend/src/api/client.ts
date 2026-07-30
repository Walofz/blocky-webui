import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdsProfile {
  name: string
  type: 'block' | 'allow'
  blocklists: string[]
}

export interface Group {
  name: string
  adsProfiles: string[]
  clients: string[]
}

export type DnsRecord =
  | { type: 'A'; domain: string; address: string }
  | { type: 'AAAA'; domain: string; address: string }
  | { type: 'CNAME'; domain: string; target: string }

export interface LogEntry {
  id: string
  timestamp: string
  clientIP: string
  domain: string
  upstream?: string
  resolvedIP?: string
  action: 'allow' | 'block'
  matchedList?: string
  matchedGroup?: string
  responseTime?: number
}

export interface DashboardData {
  stats: {
    totalQueries: number
    blocked: number
    allowed: number
    blockRate: number
  }
  topBlockedDomains: Array<{ domain: string; count: number }>
  topClients: Array<{ ip: string; count: number }>
  timelines: {
    '1h': Array<{ time: string; blocked: number; allowed: number }>
    '24h': Array<{ time: string; blocked: number; allowed: number }>
    '7d': Array<{ time: string; blocked: number; allowed: number }>
  }
  groupsHealth: Array<{
    name: string
    adsProfile: string
    clientCount: number
    profile?: AdsProfile
  }>
  system: {
    up: boolean
    lastReloadAt: string | null
    lastReloadStatus: string
    configVersion: number
  }
  configSummary: {
    adsProfileCount: number
    groupCount: number
    dnsRecordCount: number
  }
}

// ─── Ads Profiles ─────────────────────────────────────────────────────────────

export const adsProfilesApi = {
  list: () => api.get<AdsProfile[]>('/ads-profiles').then((r) => r.data),
  get: (name: string) => api.get<AdsProfile>(`/ads-profiles/${name}`).then((r) => r.data),
  create: (p: AdsProfile) => api.post<{ profile: AdsProfile }>('/ads-profiles', p).then((r) => r.data),
  update: (name: string, p: AdsProfile) =>
    api.put<{ profile: AdsProfile }>(`/ads-profiles/${name}`, p).then((r) => r.data),
  delete: (name: string) => api.delete(`/ads-profiles/${name}`).then((r) => r.data),
}

// ─── Groups ───────────────────────────────────────────────────────────────────

export const groupsApi = {
  list: () => api.get<Group[]>('/groups').then((r) => r.data),
  get: (name: string) => api.get<Group>(`/groups/${name}`).then((r) => r.data),
  create: (g: Group) => api.post<{ group: Group }>('/groups', g).then((r) => r.data),
  update: (name: string, g: Group) =>
    api.put<{ group: Group }>(`/groups/${name}`, g).then((r) => r.data),
  delete: (name: string) => api.delete(`/groups/${name}`).then((r) => r.data),
}

// ─── DNS ──────────────────────────────────────────────────────────────────────

export const dnsApi = {
  list: (params?: { type?: string; domain?: string }) =>
    api.get<DnsRecord[]>('/dns', { params }).then((r) => r.data),
  create: (r: DnsRecord) => api.post<{ record: DnsRecord }>('/dns', r).then((res) => res.data),
  update: (type: string, domain: string, r: DnsRecord) =>
    api.put<{ record: DnsRecord }>(`/dns/${type}/${domain}`, r).then((res) => res.data),
  delete: (type: string, domain: string) =>
    api.delete(`/dns/${type}/${encodeURIComponent(domain)}`).then((r) => r.data),
  quickAllowlist: (domain: string) =>
    api.post('/dns/quick-allowlist', { domain }).then((r) => r.data),
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { domain?: string; clientIP?: string; group?: string; action?: string; limit?: number }) =>
    api.get<LogEntry[]>('/logs', { params }).then((r) => r.data),
  clear: (clearFiles = false) =>
    api.delete<{ cleared: boolean; removedBuffer: number; removedFiles: number }>('/logs', {
      params: { files: clearFiles ? 'true' : 'false' },
    }).then((r) => r.data),
  getUpstreams: () => api.get<{ upstreams: string[] }>('/logs/upstreams').then((r) => r.data.upstreams),
  saveUpstreams: (upstreams: string[]) =>
    api.put<{ upstreams: string[] }>('/logs/upstreams', { upstreams }).then((r) => r.data.upstreams),
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard').then((r) => r.data),
}

export default api
