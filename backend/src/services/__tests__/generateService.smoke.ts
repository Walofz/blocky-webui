import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import yaml from 'js-yaml'
import { generateBlockyConfig } from '../generateService'
import { CustomConfig } from '../../config/schema'

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocky-generate-'))
  fs.writeFileSync(path.join(tempDir, 'config.yaml'), 'blocking:\n  blockType: nxDomain\n', 'utf8')

  const custom: CustomConfig = {
    version: 1,
    adsProfiles: [
      {
        name: 'ads-basic',
        type: 'block',
        blocklists: ['https://example.com/ads.txt'],
      },
      {
        name: 'allow-pr',
        type: 'allow',
        blocklists: ['pornhub.com', 'pornhub.org'],
      },
    ],
    groups: [
      {
        name: 'ads',
        adsProfiles: ['ads-basic', 'allow-pr'],
        clients: ['127.0.0.1'],
      },
    ],
    upstreams: [],
    dnsRecords: [],
  }

  const outPath = generateBlockyConfig(custom, tempDir)
  const generatedRaw = fs.readFileSync(outPath, 'utf8')
  const generated = yaml.load(generatedRaw.replace(/^#.*\n/gm, '')) as {
    blocking: {
      denylists?: Record<string, string[]>
      allowlists?: Record<string, string[]>
      clientGroupsBlock?: Record<string, string[]>
    }
  }

  assert(generated.blocking.denylists?.['ads-basic'], 'ads-basic should be generated under denylists')
  assert(generated.blocking.allowlists?.['allow-pr'], 'allow-pr should be generated under allowlists')
  assert.deepStrictEqual(generated.blocking.clientGroupsBlock?.['127.0.0.1'], ['ads-basic', 'allow-pr'])
  assert.strictEqual(generated.blocking.allowlists?.['allow-pr'][0], 'pornhub.com\npornhub.org\n')

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('generateService smoke test: ALL PASSED')
}

main()
