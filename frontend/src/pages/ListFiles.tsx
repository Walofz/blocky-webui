import React, { useEffect, useState } from 'react'
import { Save, FileText, Pencil, Download, Upload } from 'lucide-react'
import { configApi, listFilesApi, SavedListFile } from '../api/client'

export default function ListFiles() {
  const [fileName, setFileName] = useState('allow-pr')
  const [content, setContent] = useState('')
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [files, setFiles] = useState<SavedListFile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [loadingFileName, setLoadingFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setFiles(await listFilesApi.list())
    } catch {
      setError('Failed to load saved list files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      setError(null)
      const saved = await listFilesApi.save({ fileName, content })
      setFileName(saved.name)
      setSavedPath(saved.path)
      await load()
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (name: string) => {
    try {
      setError(null)
      setLoadingFileName(name)
      const file = await listFilesApi.get(name)
      setFileName(file.name)
      setContent(file.content)
      setSavedPath(file.path)
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    } finally {
      setLoadingFileName(null)
    }
  }

  const handleExportConfig = async () => {
    try {
      setError(null)
      const content = await configApi.exportYaml()
      const blob = new Blob([content], { type: 'application/x-yaml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'custom.yaml'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    }
  }

  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setError(null)
      setImporting(true)
      const text = await file.text()
      await configApi.importYaml(text)
      await load()
      alert('custom.yaml imported and applied successfully')
    } catch (e: unknown) {
      setError(getErrorMsg(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Save List File</h1>
        <p className="text-sm text-gray-500 mt-1">
          บันทึกโดเมนเป็นไฟล์ .txt แล้วเอา path ไปใส่ใน Ads Profiles ได้ทันที
        </p>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="card mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Config Backup</h2>
            <p className="text-sm text-gray-500 mt-1">Export หรือ import ไฟล์ custom.yaml โดยตรง</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={handleExportConfig}>
              <Download size={14} /> Export custom.yaml
            </button>
            <label className="btn-primary cursor-pointer">
              <Upload size={14} /> {importing ? 'Importing...' : 'Import custom.yaml'}
              <input
                type="file"
                accept=".yaml,.yml,text/yaml,text/x-yaml"
                className="hidden"
                disabled={importing}
                onChange={handleImportConfig}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card mb-6 space-y-4">
        <div>
          <label className="label">File Name</label>
          <input
            className="input font-mono"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="allow-pr"
          />
          <p className="text-xs text-gray-500 mt-1">รองรับเฉพาะ a-z, A-Z, 0-9, ., -, _ และระบบจะเติม .txt ให้อัตโนมัติ</p>
        </div>

        <div>
          <label className="label">Domains (one per line)</label>
          <textarea
            className="input font-mono text-xs"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={'pornhub.com\npornhub.org\nwww.pornhub.com'}
          />
        </div>

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save File'}
        </button>

        {savedPath && (
          <div className="rounded-md bg-green-50 text-green-700 px-4 py-2 text-sm">
            Saved: <code>{savedPath}</code>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} />
          <h2 className="text-lg font-semibold">Saved Files</h2>
        </div>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-gray-500 text-sm">No saved files yet</p>
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li key={file.name} className="rounded border border-gray-200 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-gray-700">{file.path}</p>
                    <p className="text-xs text-gray-500 mt-1">updated: {new Date(file.updatedAt).toLocaleString()}</p>
                  </div>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => handleEdit(file.name)}
                    disabled={loadingFileName === file.name}
                  >
                    <Pencil size={14} /> {loadingFileName === file.name ? 'Loading...' : 'Edit'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function getErrorMsg(e: unknown): string {
  const err = e as { response?: { data?: { error?: string; issues?: string[] } } }
  if (err?.response?.data?.issues?.length) return err.response.data.issues.join(' | ')
  if (err?.response?.data?.error) return err.response.data.error
  return 'Save failed'
}
