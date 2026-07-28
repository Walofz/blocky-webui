import React, { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { dnsApi, DnsRecord } from '../api/client'

type RecordType = 'A' | 'AAAA' | 'CNAME'

interface FormState {
  type: RecordType
  domain: string
  address: string
  target: string
}

const emptyForm: FormState = { type: 'A', domain: '', address: '', target: '' }

export default function CustomDNS() {
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ type: '', domain: '' })
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<{ type: string; domain: string } | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setRecords(await dnsApi.list({
        type: filter.type || undefined,
        domain: filter.domain || undefined,
      }))
    } catch {
      setError('Failed to load DNS records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  const openEdit = (r: DnsRecord) => {
    setEditing({ type: r.type, domain: r.domain })
    setForm({
      type: r.type,
      domain: r.domain,
      address: r.type !== 'CNAME' ? r.address : '',
      target: r.type === 'CNAME' ? r.target : '',
    })
    setShowForm(true)
    setError(null)
  }

  const buildRecord = (): DnsRecord => {
    if (form.type === 'CNAME') return { type: 'CNAME', domain: form.domain.trim(), target: form.target.trim() }
    return { type: form.type as 'A' | 'AAAA', domain: form.domain.trim(), address: form.address.trim() }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const record = buildRecord()

      if (editing) {
        await dnsApi.update(editing.type, editing.domain, record)
      } else {
        await dnsApi.create(record)
      }

      setShowForm(false)
      load()
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (type: string, domain: string) => {
    if (!confirm(`Delete ${type} record for "${domain}"?`)) return
    try {
      await dnsApi.delete(type, domain)
      load()
    } catch (e: unknown) {
      alert(getErrorMsg(e))
    }
  }

  const typeColor = (type: string) => {
    if (type === 'A') return 'badge-blue'
    if (type === 'AAAA') return 'badge-green'
    return 'badge-gray'
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Custom DNS Records</h1>
          <p className="text-sm text-gray-500 mt-1">Manage A, AAAA, and CNAME records</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New Record
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          className="input w-32"
          value={filter.type}
          onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value }))}
        >
          <option value="">All types</option>
          <option value="A">A</option>
          <option value="AAAA">AAAA</option>
          <option value="CNAME">CNAME</option>
        </select>
        <input
          className="input flex-1 max-w-xs"
          placeholder="Filter by domain…"
          value={filter.domain}
          onChange={(e) => setFilter((f) => ({ ...f, domain: e.target.value }))}
        />
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6 border-primary-200">
          <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Record' : 'New Record'}</h2>
          {error && <div className="text-red-600 text-sm mb-3 bg-red-50 p-2 rounded whitespace-pre-line">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.type}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as RecordType }))}
              >
                <option value="A">A (IPv4)</option>
                <option value="AAAA">AAAA (IPv6)</option>
                <option value="CNAME">CNAME</option>
              </select>
            </div>
            <div>
              <label className="label">Domain</label>
              <input
                className="input font-mono"
                placeholder="e.g. router.local"
                value={form.domain}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              />
            </div>

            {form.type !== 'CNAME' ? (
              <div className="col-span-2">
                <label className="label">{form.type === 'A' ? 'IPv4 Address' : 'IPv6 Address'}</label>
                <input
                  className="input font-mono"
                  placeholder={form.type === 'A' ? '192.168.1.1' : '::1'}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
            ) : (
              <div className="col-span-2">
                <label className="label">Target Domain</label>
                <input
                  className="input font-mono"
                  placeholder="e.g. myserver.example.com"
                  value={form.target}
                  onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-gray-400">Loading…</div>
      ) : records.length === 0 ? (
        <div className="card text-gray-400 text-center py-8">No DNS records found.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Domain</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Value</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r) => (
                <tr key={`${r.type}:${r.domain}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={typeColor(r.type)}>{r.type}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.domain}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {r.type === 'CNAME' ? r.target : r.address}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button className="btn-secondary px-2 py-1" onClick={() => openEdit(r)}>
                        <Pencil size={12} />
                      </button>
                      <button className="btn-danger px-2 py-1" onClick={() => handleDelete(r.type, r.domain)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
