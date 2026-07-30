#!/usr/bin/env ts-node
/**
 * generate-blocky-config.ts
 *
 * Reads custom.yaml (UI-managed) and merges it into config.yaml (Blocky native format).
 * Run this after saving changes in the WebUI, or wire it into the backend's reload hook.
 *
 * Usage:
 *   npx ts-node config/generate-blocky-config.ts
 *   # or after build:
 *   node dist/generate-blocky-config.js
 *
 * Environment variables:
 *   CONFIG_DIR   Directory containing config.yaml and custom.yaml (default: ./config)
 */

import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

// ─── Types (minimal, matching Blocky's config schema) ─────────────────────────

interface CustomConfig {
  version: number
  adsProfiles: Array<{ name: string; type?: 'block' | 'allow'; blocklists: string[] }>
  groups: Array<{ name: string; adsProfiles?: string[]; adsProfile?: string; clients: string[] }>
  upstreams?: string[]
  dnsRecords: Array<
    | { type: 'A'; domain: string; address: string }
    | { type: 'AAAA'; domain: string; address: string }
    | { type: 'CNAME'; domain: string; target: string }
  >
}

// Blocky config — only the fields we generate; all other fields come from config.yaml base
interface BlockyConfig {
  blocking?: {
    denylists?: Record<string, string[]>
    allowlists?: Record<string, string[]>
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

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const configDir = process.env.CONFIG_DIR ?? path.join(__dirname, '..', '..', 'config')
  const customPath = path.join(configDir, 'custom.yaml')
  const basePath = path.join(configDir, 'config.yaml')
  const outPath = path.join(configDir, 'config.generated.yaml')

  // Load custom.yaml
  if (!fs.existsSync(customPath)) {
    console.error(`custom.yaml not found at: ${customPath}`)
    process.exit(1)
  }
  const custom = yaml.load(fs.readFileSync(customPath, 'utf8')) as CustomConfig

  // Load base config.yaml (preserve all static settings)
  let base: BlockyConfig = {}
  if (fs.existsSync(basePath)) {
    base = yaml.load(fs.readFileSync(basePath, 'utf8')) as BlockyConfig
  }

  // ─── Build blocking.denylists / blocking.allowlists ───────────────────────
  // Each ads profile becomes a named list group by type (Blocky definition sources)
  const denylists: Record<string, string[]> = {}
  const allowlists: Record<string, string[]> = {}

  for (const profile of custom.adsProfiles) {
    const sources = profile.blocklists
      .map((entry) => entry.replace(/\r/g, '').trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => (entry.includes('\n') ? `${entry}\n` : entry))

    if (profile.type === 'allow') {
      allowlists[profile.name] = sources
    } else {
      denylists[profile.name] = sources
    }
  }

  // ─── Build blocking.clientGroupsBlock ────────────────────────────────────
  // Maps each group's clients to its ads profile list
  // Blocky format: { "192.168.1.50": ["profile-a", "profile-b"], "default": ["profile-a"] }
  const clientGroupsBlock: Record<string, string[]> = {}

  for (const group of custom.groups) {
    const listNames = Array.from(new Set(group.adsProfiles ?? (group.adsProfile ? [group.adsProfile] : [])))
    if (listNames.length === 0) {
      continue
    }

    if (group.clients.length === 0) {
      // No explicit clients → apply as "default" group (catches all unmatched clients)
      clientGroupsBlock['default'] = listNames
    } else {
      for (const client of group.clients) {
        clientGroupsBlock[client] = listNames
      }
    }
  }

  // ─── Build customDNS.mapping (A / AAAA records) ───────────────────────────
  // Blocky format: { "router.local": "192.168.1.1" }
  const mapping: Record<string, string> = {}
  // Blocky format for CNAME: rewrite section
  const rewrite: Record<string, string> = {}

  for (const rec of custom.dnsRecords) {
    if (rec.type === 'A' || rec.type === 'AAAA') {
      mapping[rec.domain] = rec.address
    } else if (rec.type === 'CNAME') {
      rewrite[rec.domain] = rec.target
    }
  }

  // ─── Merge into base config ───────────────────────────────────────────────
  const generated: BlockyConfig = {
    ...base,
    blocking: {
      ...(base.blocking ?? {}),
      denylists,
      ...(Object.keys(allowlists).length > 0 ? { allowlists } : {}),
      clientGroupsBlock,
      blockType: base.blocking?.blockType ?? 'nxDomain',
    },
    customDNS: {
      ...(base.customDNS ?? {}),
      ...(Object.keys(mapping).length > 0 ? { mapping } : {}),
      ...(Object.keys(rewrite).length > 0 ? { rewrite } : {}),
    },
    ...(custom.upstreams && custom.upstreams.length > 0
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

  // ─── Write atomically ─────────────────────────────────────────────────────
  const header = [
    `# config.generated.yaml — AUTO-GENERATED by generate-blocky-config`,
    `# Generated at: ${new Date().toISOString()}`,
    `# Source: custom.yaml v${custom.version}`,
    `# DO NOT EDIT — regenerate by running: npx ts-node config/generate-blocky-config.ts`,
    '',
  ].join('\n')

  const content = header + yaml.dump(generated, { lineWidth: 120, quotingType: '"' })
  const tmpPath = outPath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, outPath)

  console.log(`Generated: ${outPath}`)
  console.log(`  Ads profiles : ${custom.adsProfiles.length} (${Object.keys(denylists).join(', ') || 'none'})`)
  console.log(`  Groups       : ${custom.groups.length}`)
  console.log(`  Client rules : ${Object.keys(clientGroupsBlock).length}`)
  console.log(`  DNS A/AAAA   : ${Object.keys(mapping).length}`)
  console.log(`  DNS CNAME    : ${Object.keys(rewrite).length}`)
  console.log()
  console.log('Point Blocky at this file:')
  console.log(`  blocky --config ${outPath}`)
}

main()
