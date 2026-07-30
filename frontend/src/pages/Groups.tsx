import React, { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import { groupsApi, adsProfilesApi, Group, AdsProfile } from '../api/client'

interface FormState {
  name: string
  adsProfiles: string[]
  clients: string
}

const emptyForm: FormState = { name: '', adsProfiles: [], clients: '' }

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [profiles, setProfiles] = useState<AdsProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [g, p] = await Promise.all([groupsApi.list(), adsProfilesApi.list()])
      setGroups(g)
      setProfiles(p)
    } catch {
      setError('Failed to load data')
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

  const openEdit = (g: Group) => {
    setEditing(g.name)
    setForm({ name: g.name, adsProfiles: g.adsProfiles, clients: g.clients.join('\n') })
    setShowForm(true)
    setError(null)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)

      const clients = form.clients.split('\n').map((c) => c.trim()).filter(Boolean)
      const group: Group = { name: form.name.trim(), adsProfiles: form.adsProfiles, clients }

      if (editing) {
        await groupsApi.update(editing, group)
      } else {
        await groupsApi.create(group)
      }

      setShowForm(false)
      load()
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete group "${name}"?`)) return
    try {
      await groupsApi.delete(name)
      load()
    } catch (e: unknown) {
      alert(getErrorMsg(e))
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Map clients to ads profiles</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New Group
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6 border-primary-200">
          <h2 className="text-lg font-semibold mb-4">{editing ? `Edit: ${editing}` : 'New Group'}</h2>
          {error && <div className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded whitespace-pre-line">{error}</div>}

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label">Group Name</label>
              <input
                className="input"
                placeholder="e.g. kids"
                value={form.name}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Ads Profiles</label>
              {profiles.length === 0 ? (
                <p className="text-sm text-orange-600">No ads profiles found. Create one first.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-auto border border-gray-200 rounded-md p-3">
                  {profiles.map((p) => (
                    <label key={p.name} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.adsProfiles.includes(p.name)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setForm((f) => ({
                            ...f,
                            adsProfiles: checked
                              ? [...f.adsProfiles, p.name]
                              : f.adsProfiles.filter((name) => name !== p.name),
                          }))
                        }}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Client IPs / Ranges (one per line)</label>
              <textarea
                className="input font-mono text-xs"
                rows={4}
                placeholder={'192.168.1.0/24\n10.0.0.5'}
                value={form.clients}
                onChange={(e) => setForm((f) => ({ ...f, clients: e.target.value }))}
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

      {/* List */}
      {loading ? (
        <div className="text-gray-400">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="card text-gray-400 text-center py-8">No groups yet.</div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.name} className="card flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={16} className="text-primary-600" />
                  <span className="font-semibold">{g.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {g.adsProfiles.map((profileName) => (
                      <span key={profileName} className="badge-blue">{profileName}</span>
                    ))}
                  </div>
                </div>
                {g.clients.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.clients.map((c) => (
                      <span key={c} className="badge-gray font-mono text-xs">{c}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">No clients configured (applies to default)</p>
                )}
              </div>
              <div className="flex gap-1 ml-4">
                <button className="btn-secondary px-2 py-1" onClick={() => openEdit(g)}>
                  <Pencil size={14} />
                </button>
                <button className="btn-danger px-2 py-1" onClick={() => handleDelete(g.name)}>
                  <Trash2 size={14} />
                </button>
              </div>
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
