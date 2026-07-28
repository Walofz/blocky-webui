import axios from 'axios'

const BLOCKY_URL = process.env.BLOCKY_URL ?? 'http://localhost:4000'
// Blocky's HTTP API reload endpoint (https://0xerr0r.github.io/blocky/configuration/#http-listener)
const RELOAD_ENDPOINT = `${BLOCKY_URL}/api/config/reload`

let lastReloadAt: Date | null = null
let lastReloadStatus: 'ok' | 'error' | 'unconfigured' = 'unconfigured'
let configVersion = 1

export async function triggerBlockyReload(): Promise<{ ok: boolean; message: string }> {
  configVersion++
  lastReloadAt = new Date()

  if (!process.env.BLOCKY_URL) {
    lastReloadStatus = 'unconfigured'
    console.log('[blocky] BLOCKY_URL not set — skipping reload (placeholder mode)')
    return { ok: true, message: 'Blocky reload skipped: BLOCKY_URL not configured (placeholder mode)' }
  }

  try {
    await axios.post(RELOAD_ENDPOINT, null, { timeout: 5000 })
    lastReloadStatus = 'ok'
    return { ok: true, message: 'Blocky reloaded successfully' }
  } catch (err: unknown) {
    lastReloadStatus = 'error'
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[blocky] Reload failed:', msg)
    return { ok: false, message: `Blocky reload failed: ${msg}` }
  }
}

export async function getBlockyStatus(): Promise<{
  up: boolean
  lastReloadAt: string | null
  lastReloadStatus: string
  configVersion: number
}> {
  let up = false

  if (process.env.BLOCKY_URL) {
    try {
      await axios.get(`${BLOCKY_URL}/api/blocking/status`, { timeout: 3000 })
      up = true
    } catch {
      up = false
    }
  }

  return {
    up,
    lastReloadAt: lastReloadAt?.toISOString() ?? null,
    lastReloadStatus,
    configVersion,
  }
}
