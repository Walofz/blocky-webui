import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { adsProfilesApi, AdsProfile } from '../api/client'

interface FormState {
  name: string
  blocklists: string
  allowlists: string
}

const emptyForm: FormState = { name: '', blocklists: '', allowlists: '' }

function normalizeProfile(profile: AdsProfile & { type?: 'block' | 'allow' }): AdsProfile {
  if (Array.isArray(profile.allowlists)) {
    return {
      name: profile.name,
      blocklists: Array.isArray(profile.blocklists) ? profile.blocklists : [],
      allowlists: profile.allowlists,
    }
  }

  if (profile.type === 'allow') {
    return {
      name: profile.name,
      blocklists: [],
      allowlists: Array.isArray(profile.blocklists) ? profile.blocklists : [],
    }
  }

  return {
    name: profile.name,
    blocklists: Array.isArray(profile.blocklists) ? profile.blocklists : [],
    allowlists: [],
  }
}

function parseDefinitionsInput(input: string): string[] {
  const lines = input.replace(/\r/g, '').split('\n')
  const entries: string[] = []

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed === '|') {
      i += 1
      const blockLines: string[] = []

      while (i < lines.length) {
        const blockRaw = lines[i]
        if (!blockRaw.trim()) {
          i += 1
          break
        }

        if (!/^\s/.test(blockRaw)) {
          break
        }

        blockLines.push(blockRaw.replace(/^\s{1,2}/, ''))
        i += 1
      }

      if (blockLines.length > 0) {
        entries.push(blockLines.join('\n').trim())
      }
      continue
    }

    entries.push(trimmed)
    i += 1
  }

  return entries.filter((entry) => entry.length > 0)
}

function formatDefinitionsInput(entries: string[]): string {
  return entries
    .map((entry) => {
      if (!entry.includes('\n')) {
        return entry
      }
      const block = entry
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n')
      return `|\n${block}`
    })
    .join('\n')
}

export default function AdsProfiles() {
  const [profiles, setProfiles] = useState<AdsProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const data = await adsProfilesApi.list()
      setProfiles(data.map((profile) => normalizeProfile(profile as AdsProfile & { type?: 'block' | 'allow' })))
    } catch {
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  const openEdit = (p: AdsProfile) => {
    setEditing(p.name)
    setForm({
      name: p.name,
      blocklists: formatDefinitionsInput(p.blocklists ?? []),
      allowlists: formatDefinitionsInput(p.allowlists ?? []),
    })
    setShowForm(true)
    setError(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const blocklists = parseDefinitionsInput(form.blocklists)
      const allowlists = parseDefinitionsInput(form.allowlists)

      if (blocklists.length === 0 && allowlists.length === 0) {
        setError('Please provide at least one Blocklist or Allowlist entry')
        return
      }

      const profile: AdsProfile = { name: form.name.trim(), blocklists, allowlists }

      if (editing) {
        await adsProfilesApi.update(editing, profile)
      } else {
        await adsProfilesApi.create(profile)
      }

      setShowForm(false)
      load()
    } catch (e: unknown) {
      const msg = getErrorMsg(e)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete profile "${name}"?`)) return
    try {
      await adsProfilesApi.delete(name)
      load()
    } catch (e: unknown) {
      alert(getErrorMsg(e))
    }
  }

  return (
    <div className="p-4 sm:p-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ads Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">Named profiles with Blocky definitions (URL, file path, domain, regex, inline)</p>
        </div>
        <button className="btn-primary w-full sm:w-auto justify-center" onClick={openCreate}>
          <Plus size={16} /> New Profile
        </button>
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <div className="card mb-6 border-primary-200">
          <h2 className="text-lg font-semibold mb-4">{editing ? `Edit: ${editing}` : 'New Profile'}</h2>
          {error && <div className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded">{error}</div>}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label">Profile Name</label>
              <input
                className="input"
                placeholder="e.g. ads-strict"
                value={form.name}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Blocklist Definitions</label>
              <textarea
                className="input font-mono text-xs"
                rows={8}
                placeholder={"https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts\n/path/to/file.txt\nexample.com\n/^banners?[_.-]/\n|\n  # inline definition\n  someadsdomain.com"}
                value={form.blocklists}
                onChange={(e) => setForm((f) => ({ ...f, blocklists: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty if you do not want to save blocklists in this profile.</p>
            </div>
            <div>
              <label className="label">Allowlist Definitions</label>
              <textarea
                className="input font-mono text-xs"
                rows={8}
                placeholder={"https://example.com/allow.txt\n/app/config/lists/allow-pr.txt\nallowdomain.com\n|\n  # inline definition\n  allowlistdomain.com"}
                value={form.allowlists}
                onChange={(e) => setForm((f) => ({ ...f, allowlists: e.target.value }))}
              />
              <p className="text-xs text-gray-500 mt-1">One entry per line. For multi-line inline definition, start with <code>|</code> then indent its lines.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mt-4">
            <button className="btn-primary w-full sm:w-auto justify-center" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary w-full sm:w-auto justify-center" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Profile list */}
      {loading ? (
        <div className="text-gray-400">Loading…</div>
      ) : profiles.length === 0 ? (
        <div className="card text-gray-400 text-center py-8">
          No ads profiles yet. Create your first profile.
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.name} className="card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <button
                  className="flex items-center gap-2 text-left flex-1 flex-wrap"
                  onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                >
                  {expanded === p.name ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-semibold">{p.name}</span>
                  <span className="badge-blue">Block {p.blocklists.length}</span>
                  <span className="badge-green">Allow {p.allowlists.length}</span>
                </button>
                <div className="flex gap-1 self-end sm:self-auto">
                  <button className="btn-secondary px-2 py-1" onClick={() => openEdit(p)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-danger px-2 py-1" onClick={() => handleDelete(p.name)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {expanded === p.name && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {p.blocklists.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-gray-500 mb-2">Blocklist Definitions</p>
                      <ul className="space-y-1 mb-3">
                        {p.blocklists.map((entry, index) => (
                          <li key={`${p.name}-block-${index}`} className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 break-all whitespace-pre-wrap">
                            {entry}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {p.allowlists.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-gray-500 mb-2">Allowlist Definitions</p>
                      <ul className="space-y-1">
                        {p.allowlists.map((entry, index) => (
                          <li key={`${p.name}-allow-${index}`} className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 break-all whitespace-pre-wrap">
                            {entry}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getErrorMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const resp = (e as { response?: { data?: { error?: string; issues?: string[] } } }).response
    if (resp?.data?.issues) return resp.data.issues.join('\n')
    if (resp?.data?.error) return resp.data.error
  }
  if (e instanceof Error) return e.message
  return 'Unknown error'
}
