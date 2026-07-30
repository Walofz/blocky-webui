import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import yaml from 'js-yaml'

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocky-generate-'))

  const custom = {
    version: 1,
    adsProfiles: [
      {
        name: 'allow-pr',
        type: 'allow',
        blocklists: ['https://example.com/allow.txt', 'pornhub.com', 'pornhub.org'],
      },
    ],
    groups: [
      {
        name: 'allow-only',
        adsProfiles: ['allow-pr'],
        clients: ['127.0.0.1'],
      },
    ],
    upstreams: ['tcp+udp:1.1.1.1'],
    dnsRecords: [],
  }

  const base = {
    blocking: {
      blockType: 'nxDomain',
    },
  }

  fs.writeFileSync(path.join(tempDir, 'custom.yaml'), yaml.dump(custom), 'utf8')
  fs.writeFileSync(path.join(tempDir, 'config.yaml'), yaml.dump(base), 'utf8')

  execFileSync('node', ['-r', 'ts-node/register/transpile-only', 'src/generate-blocky-config.ts'], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      CONFIG_DIR: tempDir,
    },
    stdio: 'pipe',
  })

  const generatedPath = path.join(tempDir, 'config.generated.yaml')
  const generatedText = fs.readFileSync(generatedPath, 'utf8')
  const generated = yaml.load(generatedText) as { blocking?: { allowlists?: Record<string, string[]> } }

  const allowEntries = generated.blocking?.allowlists?.['allow-pr'] ?? []

  assert(allowEntries.includes('https://example.com/allow.txt'), 'URL source should stay as URL source')
  assert(allowEntries.some((entry) => entry.includes('pornhub.com') && entry.includes('pornhub.org') && entry.includes('\n')), 'Plain domains should be grouped into one inline list block')
  assert(!allowEntries.includes('pornhub.com'), 'Plain domain must not be emitted as a direct source item')
  assert(!allowEntries.includes('pornhub.org'), 'Plain domain must not be emitted as a direct source item')

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('generate-blocky-config smoke test: ALL PASSED')
}

main()
