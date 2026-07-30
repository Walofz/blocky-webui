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
    const sources = profile.blocklists.map((entry) => entry.trim()).filter((entry) => entry.length > 0)

    if (profile.type === 'allow') {
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
