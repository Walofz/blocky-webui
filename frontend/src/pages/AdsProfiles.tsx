import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { adsProfilesApi, AdsProfile } from '../api/client'

interface FormState {
  name: string
  type: 'block' | 'allow'
  blocklists: string
}

const emptyForm: FormState = { name: '', type: 'block', blocklists: '' }

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
      setProfiles(await adsProfilesApi.list())
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
    setForm({ name: p.name, type: p.type ?? 'block', blocklists: p.blocklists.join('\n') })
    setShowForm(true)
    setError(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const blocklists = form.blocklists.split('\n').map((l) => l.trim()).filter(Boolean)
      const profile: AdsProfile = { name: form.name.trim(), type: form.type, blocklists }

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
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ads Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">Named profiles with mapped blocklist URLs</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
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
              <label className="label">Profile Type</label>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'block' | 'allow' }))}
              >
                <option value="block">Blocklist</option>
                <option value="allow">Allowlist</option>
              </select>
            </div>
            <div>
              <label className="label">List URLs (one per line)</label>
              <textarea
                className="input font-mono text-xs"
                rows={5}
                placeholder="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
                value={form.blocklists}
                onChange={(e) => setForm((f) => ({ ...f, blocklists: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
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
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 text-left flex-1"
                  onClick={() => setExpanded(expanded === p.name ? null : p.name)}
                >
                  {expanded === p.name ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-semibold">{p.name}</span>
                  <span className={p.type === 'allow' ? 'badge-green' : 'badge-blue'}>{p.type === 'allow' ? 'allowlist' : 'blocklist'}</span>
                  <span className="badge-blue">{p.blocklists.length} lists</span>
                </button>
                <div className="flex gap-1">
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
                  <p className="text-xs font-medium text-gray-500 mb-2">{p.type === 'allow' ? 'Allowlist URLs' : 'Blocklist URLs'}</p>
                  <ul className="space-y-1">
                    {p.blocklists.map((url) => (
                      <li key={url} className="text-xs font-mono text-gray-600 bg-gray-50 rounded px-2 py-1 break-all">
                        {url}
                      </li>
                    ))}
                  </ul>
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
