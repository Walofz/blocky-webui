import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { CustomConfig } from '../config/schema'

interface BlockyConfig {
  blocking?: {
    denylists?: Record<string, string[]>
    allowlists?: Record<string, string[]>
    blackLists?: Record<string, string[]>
    clientGroupsBlock?: Record<string, string[]>
    blockType?: string
  }
  customDNS?: {
    mapping?: Record<string, string>
    rewrite?: Record<string, string>
  }
  upstreams?: {
    groups?: Record<string, string[]>
  }
  [key: string]: unknown
}

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const WINDOWS_ABS_PATH_RE = /^[a-zA-Z]:[\\/]/
const REGEX_LITERAL_RE = /^\/.*\/[a-z]*$/i

function isExternalListSource(entry: string): boolean {
  if (URL_SCHEME_RE.test(entry)) return true
  if (WINDOWS_ABS_PATH_RE.test(entry)) return true
  if (entry.startsWith('./') || entry.startsWith('../') || entry.startsWith('.\\') || entry.startsWith('..\\')) return true
  if (entry.startsWith('~/') || entry.startsWith('~\\')) return true
  if (entry.startsWith('\\')) return true
  if (entry.startsWith('/') && !REGEX_LITERAL_RE.test(entry)) return true
  return false
}

function normalizeProfileSources(profileType: 'block' | 'allow', blocklists: string[]): string[] {
  const normalized = blocklists
    .map((entry) => entry.replace(/\r/g, '').trim())
    .filter((entry) => entry.length > 0)

  const sources: string[] = []
  const inlineEntries: string[] = []

  for (const entry of normalized) {
    if (entry.includes('\n')) {
      sources.push(`${entry}\n`)
      continue
    }

    if (profileType === 'allow' && !isExternalListSource(entry)) {
      inlineEntries.push(entry)
      continue
    }

    sources.push(entry)
  }

  if (inlineEntries.length > 0) {
    sources.push(`${inlineEntries.join('\n')}\n`)
  }

  return sources
}

export function generateBlockyConfig(custom: CustomConfig, configDir: string): string {
  const basePath = path.join(configDir, 'config.yaml')
  const outPath = path.join(configDir, 'config.generated.yaml')

  let base: BlockyConfig = {}
  if (fs.existsSync(basePath)) {
    base = yaml.load(fs.readFileSync(basePath, 'utf8')) as BlockyConfig
  }

  // blocking.denylists / blocking.allowlists — one entry per ads profile
  // supports Blocky definition sources: URL, file path, inline definition, regex, domain
  const denylists: Record<string, string[]> = {}
  const allowlists: Record<string, string[]> = {}

  for (const profile of custom.adsProfiles) {
    const profileType = profile.type === 'allow' ? 'allow' : 'block'
    const sources = normalizeProfileSources(profileType, profile.blocklists)

    if (profileType === 'allow') {
      allowlists[profile.name] = sources
    } else {
      denylists[profile.name] = sources
    }
  }

  // blocking.clientGroupsBlock — map clients → profile names
  const clientGroupsBlock: Record<string, string[]> = {}
  for (const group of custom.groups) {
    const profileNames = Array.from(new Set(group.adsProfiles))
    if (profileNames.length === 0) {
      continue
    }

    if (group.clients.length === 0) {
      clientGroupsBlock['default'] = profileNames
    } else {
      for (const client of group.clients) {
        clientGroupsBlock[client] = profileNames
      }
    }
  }

  // customDNS.mapping (A/AAAA) and customDNS.rewrite (CNAME)
  const mapping: Record<string, string> = {}
  const rewrite: Record<string, string> = {}
  for (const rec of custom.dnsRecords) {
    if (rec.type === 'A' || rec.type === 'AAAA') {
      mapping[rec.domain] = rec.address
    } else if (rec.type === 'CNAME') {
      rewrite[rec.domain] = rec.target
    }
  }

  const generated: BlockyConfig = {
    ...base,
    blocking: {
      ...(base.blocking ?? {}),
      denylists,
      allowlists,
      clientGroupsBlock,
      blockType: base.blocking?.blockType ?? 'nxDomain',
    },
    customDNS: {
      ...(base.customDNS ?? {}),
      ...(Object.keys(mapping).length > 0 ? { mapping } : {}),
      ...(Object.keys(rewrite).length > 0 ? { rewrite } : {}),
    },
    ...(custom.upstreams.length > 0
      ? {
          upstreams: {
            ...(base.upstreams ?? {}),
            groups: {
              ...(base.upstreams?.groups ?? {}),
              default: custom.upstreams,
            },
          },
        }
      : {}),
  }

  const header = [
    `# AUTO-GENERATED — do not edit`,
    `# Source: custom.yaml v${custom.version}  |  Generated: ${new Date().toISOString()}`,
    `# Regenerate: cd backend && npm run generate`,
    '',
  ].join('\n')

  const content = header + yaml.dump(generated, { lineWidth: 120, quotingType: '"' })
  const tmpPath = outPath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, outPath)

  console.log(`[generate] config.generated.yaml written (v${custom.version})`)
  return outPath
}
