import fs from 'fs'
import path from 'path'

const TXT_EXT_RE = /\.txt$/i

export interface ListFileInfo {
  name: string
  path: string
  updatedAt: string
}

export interface SaveListFileResult {
  name: string
  path: string
  lines: number
}

function ensureTxtName(fileName: string): string {
  return TXT_EXT_RE.test(fileName) ? fileName : `${fileName}.txt`
}

function normalizeContent(content: string): string[] {
  return content
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function resolveListDir(configDir: string): string {
  return path.resolve(path.join(configDir, 'lists'))
}

export function listSavedListFiles(configDir: string): ListFileInfo[] {
  const listDir = resolveListDir(configDir)
  if (!fs.existsSync(listDir)) {
    return []
  }

  return fs.readdirSync(listDir)
    .filter((name) => name.toLowerCase().endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const stats = fs.statSync(path.join(listDir, name))
      return {
        name,
        path: `/app/config/lists/${name}`,
        updatedAt: stats.mtime.toISOString(),
      }
    })
}

export function saveListFile(configDir: string, fileName: string, content: string): SaveListFileResult {
  const listDir = resolveListDir(configDir)
  fs.mkdirSync(listDir, { recursive: true })

  const normalizedName = ensureTxtName(fileName.trim())
  const targetPath = path.resolve(path.join(listDir, normalizedName))
  if (!targetPath.startsWith(listDir + path.sep) && targetPath !== listDir) {
    throw new Error('Invalid file path')
  }

  const lines = normalizeContent(content)
  if (lines.length === 0) {
    throw new Error('List content is empty')
  }

  fs.writeFileSync(targetPath, `${lines.join('\n')}\n`, 'utf8')

  return {
    name: normalizedName,
    path: `/app/config/lists/${normalizedName}`,
    lines: lines.length,
  }
}
