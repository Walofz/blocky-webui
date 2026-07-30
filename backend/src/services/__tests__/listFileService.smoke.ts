import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { listSavedListFiles, readSavedListFile, saveListFile } from '../listFileService'

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocky-list-files-'))

  const saved = saveListFile(tempDir, 'allow-pr', 'pornhub.com\n\n pornub.org \n')
  assert.strictEqual(saved.path, '/app/config/lists/allow-pr.txt')
  assert.strictEqual(saved.lines, 2)

  const savedText = fs.readFileSync(path.join(tempDir, 'lists', 'allow-pr.txt'), 'utf8')
  assert.strictEqual(savedText, 'pornhub.com\npornub.org\n')

  const files = listSavedListFiles(tempDir)
  assert.strictEqual(files.length, 1)
  assert.strictEqual(files[0].path, '/app/config/lists/allow-pr.txt')

  const loaded = readSavedListFile(tempDir, 'allow-pr')
  assert.strictEqual(loaded.name, 'allow-pr.txt')
  assert.strictEqual(loaded.path, '/app/config/lists/allow-pr.txt')
  assert.strictEqual(loaded.content, 'pornhub.com\npornub.org')

  let emptyContentError = ''
  try {
    saveListFile(tempDir, 'empty', '\n\n')
  } catch (err) {
    emptyContentError = (err as Error).message
  }
  assert.strictEqual(emptyContentError, 'List content is empty')

  let invalidPathError = ''
  try {
    saveListFile(tempDir, '..\\..\\outside', 'example.com')
  } catch (err) {
    invalidPathError = (err as Error).message
  }
  assert.strictEqual(invalidPathError, 'Invalid file path')

  let notFoundError = ''
  try {
    readSavedListFile(tempDir, 'missing-file')
  } catch (err) {
    notFoundError = (err as Error).message
  }
  assert.strictEqual(notFoundError, 'List file not found')

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('listFileService smoke test: ALL PASSED')
}

main()
