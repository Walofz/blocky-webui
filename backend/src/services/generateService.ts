import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { CustomConfig } from '../config/schema'

interface BlockyConfig {
  blocking?: {
    blackLists?: Record<string, string[]>
    clientGroupsBlock?: Record<string, string[]>
    blockType?: string
  }
  customDNS?: {
    mapping?: Record<string, string>
    rewrite?: Record<string, string>
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

  // blocking.blackLists — one entry per ads profile
  const blackLists: Record<string, string[]> = {}
  for (const profile of custom.adsProfiles) {
    blackLists[profile.name] = profile.blocklists
  }

  // blocking.clientGroupsBlock — map clients → profile name
  const clientGroupsBlock: Record<string, string[]> = {}
  for (const group of custom.groups) {
    if (group.clients.length === 0) {
      clientGroupsBlock['default'] = [
        ...new Set([...(clientGroupsBlock['default'] ?? []), group.adsProfile]),
      ]
    } else {
      for (const client of group.clients) {
        clientGroupsBlock[client] = [
          ...new Set([...(clientGroupsBlock[client] ?? []), group.adsProfile]),
        ]
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
      blackLists,
      clientGroupsBlock,
      blockType: base.blocking?.blockType ?? 'nxDomain',
    },
    customDNS: {
      ...(base.customDNS ?? {}),
      ...(Object.keys(mapping).length > 0 ? { mapping } : {}),
      ...(Object.keys(rewrite).length > 0 ? { rewrite } : {}),
    },
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
