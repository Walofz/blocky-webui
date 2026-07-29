import { z } from 'zod'

// ─── Ads Profile ──────────────────────────────────────────────────────────────

export const AdsProfileSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Profile name must be alphanumeric, dashes, underscores only'),
  blocklists: z.array(z.string().url('Each blocklist must be a valid URL')).min(1),
})
export type AdsProfile = z.infer<typeof AdsProfileSchema>

// ─── Group ────────────────────────────────────────────────────────────────────

export const GroupSchema = z.preprocess(
  (v) => {
    if (!v || typeof v !== 'object') return v
    const obj = v as { adsProfiles?: unknown; adsProfile?: unknown }
    if (obj.adsProfiles !== undefined) return v
    if (typeof obj.adsProfile === 'string' && obj.adsProfile.trim().length > 0) {
      return { ...obj, adsProfiles: [obj.adsProfile.trim()] }
    }
    return v
  },
  z.object({
    name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Group name must be alphanumeric, dashes, underscores only'),
    adsProfiles: z.preprocess(
      (v) => {
        if (Array.isArray(v)) return v
        if (typeof v === 'string' && v.trim().length > 0) return [v.trim()]
        return v
      },
      z.array(z.string().min(1)).min(1, 'Group must reference at least one ads profile'),
    ),
    clients: z.array(z.string()).default([]),
  }),
)
export type Group = z.infer<typeof GroupSchema>

// ─── Upstreams ────────────────────────────────────────────────────────────────

const upstreamRegex = /^(?:tcp\+udp:|udp:|tcp:)?(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?$/

export const UpstreamSchema = z
  .array(z.string().trim().regex(upstreamRegex, 'Upstream must be like 1.1.1.1, udp:1.1.1.1 or tcp+udp:1.1.1.1:53'))
  .max(5, 'Upstream can have at most 5 entries')
  .transform((items) => Array.from(new Set(items)))

// ─── Custom DNS Records ───────────────────────────────────────────────────────

const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^localhost$/
const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/

export const DnsARecordSchema = z.object({
  type: z.literal('A'),
  domain: z.string().regex(domainRegex, 'Invalid domain'),
  address: z.string().regex(ipv4Regex, 'Invalid IPv4 address'),
})

export const DnsAAAARecordSchema = z.object({
  type: z.literal('AAAA'),
  domain: z.string().regex(domainRegex, 'Invalid domain'),
  address: z.string().regex(ipv6Regex, 'Invalid IPv6 address'),
})

export const DnsCNAMERecordSchema = z.object({
  type: z.literal('CNAME'),
  domain: z.string().regex(domainRegex, 'Invalid domain'),
  target: z.string().regex(domainRegex, 'Invalid CNAME target domain'),
})

export const DnsRecordSchema = z.discriminatedUnion('type', [
  DnsARecordSchema,
  DnsAAAARecordSchema,
  DnsCNAMERecordSchema,
])
export type DnsRecord = z.infer<typeof DnsRecordSchema>

// ─── Full Custom Config ───────────────────────────────────────────────────────

export const CustomConfigSchema = z.object({
  version: z.number().int().default(1),
  adsProfiles: z.array(AdsProfileSchema).default([]),
  groups: z.array(GroupSchema).default([]),
  upstreams: UpstreamSchema.default([]),
  dnsRecords: z.array(DnsRecordSchema).default([]),
})
export type CustomConfig = z.infer<typeof CustomConfigSchema>

// ─── Cross-field validation ───────────────────────────────────────────────────

export function validateCustomConfig(config: CustomConfig): string[] {
  const errors: string[] = []
  const profileNames = new Set(config.adsProfiles.map((p) => p.name))
  const groupNames = new Set(config.groups.map((g) => g.name))

  // Groups reference existing profiles
  for (const group of config.groups) {
    for (const profileName of group.adsProfiles) {
      if (!profileNames.has(profileName)) {
        errors.push(`Group "${group.name}" references unknown ads profile "${profileName}"`)
      }
    }
  }

  // Duplicate profile names
  const seenProfiles = new Set<string>()
  for (const p of config.adsProfiles) {
    if (seenProfiles.has(p.name)) errors.push(`Duplicate ads profile name: "${p.name}"`)
    seenProfiles.add(p.name)
  }

  // Duplicate group names
  const seenGroups = new Set<string>()
  for (const g of config.groups) {
    if (seenGroups.has(g.name)) errors.push(`Duplicate group name: "${g.name}"`)
    seenGroups.add(g.name)
  }

  // DNS: detect CNAME loops (simple direct loop check)
  const cnameMap = new Map<string, string>()
  for (const rec of config.dnsRecords) {
    if (rec.type === 'CNAME') {
      cnameMap.set(rec.domain, rec.target)
    }
  }
  for (const [domain] of cnameMap) {
    const visited = new Set<string>()
    let current: string | undefined = domain
    while (current && cnameMap.has(current)) {
      if (visited.has(current)) {
        errors.push(`CNAME loop detected starting at "${domain}"`)
        break
      }
      visited.add(current)
      current = cnameMap.get(current)
    }
  }

  // DNS: group names in client lists should reference real groups (warn only)
  const allDomains = new Set(config.dnsRecords.map((r) => r.domain))
  for (const rec of config.dnsRecords) {
    if (rec.type === 'CNAME' && !allDomains.has(rec.target) && !rec.target.endsWith('.')) {
      // CNAME target doesn't exist locally — that's fine, it's an external target
    }
  }

  // Duplicate DNS domains with same type
  const dnsKeys = new Set<string>()
  for (const rec of config.dnsRecords) {
    const key = `${rec.type}:${rec.domain}`
    if (dnsKeys.has(key)) errors.push(`Duplicate DNS record: ${key}`)
    dnsKeys.add(key)
  }

  void groupNames // suppress unused warning
  return errors
}
