import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { CustomConfig, CustomConfigSchema, validateCustomConfig } from './schema'

const CONFIG_DIR = process.env.CONFIG_DIR ?? path.join(process.cwd(), '..', 'config')
const CUSTOM_YAML = path.join(CONFIG_DIR, 'custom.yaml')

const defaultConfig: CustomConfig = {
  version: 1,
  adsProfiles: [],
  groups: [],
  dnsRecords: [],
}

export function loadCustomConfig(): CustomConfig {
  if (!fs.existsSync(CUSTOM_YAML)) {
    return { ...defaultConfig }
  }
  try {
    const raw = fs.readFileSync(CUSTOM_YAML, 'utf8')
    const parsed = yaml.load(raw)
    return CustomConfigSchema.parse(parsed)
  } catch (err) {
    console.error('[config] Failed to parse custom.yaml:', err)
    return { ...defaultConfig }
  }
}

export function saveCustomConfig(config: CustomConfig): void {
  // Cross-field validation
  const errors = validateCustomConfig(config)
  if (errors.length > 0) {
    throw new ValidationError(errors)
  }

  // Ensure dir exists
  fs.mkdirSync(CONFIG_DIR, { recursive: true })

  // Atomic write: write to temp file then rename
  const tmpPath = CUSTOM_YAML + '.tmp'
  const content = yaml.dump(config, { lineWidth: 120, quotingType: '"' })
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, CUSTOM_YAML)
}

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Validation failed:\n${issues.join('\n')}`)
    this.name = 'ValidationError'
  }
}

export { CUSTOM_YAML, CONFIG_DIR }
