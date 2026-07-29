import axios from 'axios'
import fs from 'fs'

const BLOCKY_URL = process.env.BLOCKY_URL ?? 'http://localhost:4000'
// Blocky has NO "config reload" HTTP endpoint — applying a new config requires a
// process restart. When the Docker socket is mounted (docker-compose does this),
// we restart the Blocky container via the Docker Engine API. Otherwise we fall
// back to `POST /api/lists/refresh`, which at least re-downloads the blocklists.
const DOCKER_SOCK = process.env.DOCKER_SOCK ?? '/var/run/docker.sock'
const BLOCKY_CONTAINER = process.env.BLOCKY_CONTAINER ?? 'blocky'
const LISTS_REFRESH_ENDPOINT = `${BLOCKY_URL}/api/lists/refresh`

let lastReloadAt: Date | null = null
let lastReloadStatus: 'ok' | 'error' | 'unconfigured' = 'unconfigured'
let configVersion = 1

function dockerSockAvailable(): boolean {
  try {
    return fs.statSync(DOCKER_SOCK).isSocket()
  } catch {
    return false
  }
}

export async function triggerBlockyReload(): Promise<{ ok: boolean; message: string }> {
  configVersion++
  lastReloadAt = new Date()

  if (!process.env.BLOCKY_URL) {
    lastReloadStatus = 'unconfigured'
    console.log('[blocky] BLOCKY_URL not set — skipping reload (placeholder mode)')
    return { ok: true, message: 'Blocky reload skipped: BLOCKY_URL not configured (placeholder mode)' }
  }

  // Preferred path: restart the Blocky container so it re-reads config.generated.yaml
  if (dockerSockAvailable()) {
    try {
      await axios.post(`http://localhost/containers/${BLOCKY_CONTAINER}/restart?t=5`, null, {
        socketPath: DOCKER_SOCK,
        timeout: 30000,
      })
      lastReloadStatus = 'ok'
      console.log(`[blocky] Container "${BLOCKY_CONTAINER}" restarted to apply new config`)
      return { ok: true, message: 'Blocky restarted with new config' }
    } catch (err: unknown) {
      lastReloadStatus = 'error'
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[blocky] Restart of container "${BLOCKY_CONTAINER}" failed:`, msg)
      return { ok: false, message: `Blocky restart failed: ${msg}` }
    }
  }

  // Fallback: refresh blocklists only (config changes still require a manual restart)
  try {
    await axios.post(LISTS_REFRESH_ENDPOINT, null, { timeout: 60000 })
    lastReloadStatus = 'ok'
    console.log('[blocky] Blocklists refreshed (no Docker socket — restart Blocky manually to apply config changes)')
    return { ok: true, message: 'Blocky blocklists refreshed; restart Blocky to apply config changes' }
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
