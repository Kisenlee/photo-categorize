import { app, BrowserWindow, dialog, ipcMain, protocol, Menu, net } from 'electron'
import { join, basename, extname, parse, isAbsolute } from 'path'
import { pathToFileURL } from 'url'
import { readdir, copyFile, unlink, access, stat, constants, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import chokidar, { type FSWatcher } from 'chokidar'
import { IMAGE_EXTENSIONS, type ImageItem, type CategoryItem, type ClassifyResult } from '../shared/types'

type UiLocale = 'zh' | 'en'

const WINDOW_TITLE: Record<UiLocale, string> = {
  zh: '图片分类助手',
  en: 'Photo Classifier'
}

let uiLocale: UiLocale = 'zh'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let categoryWatcher: FSWatcher | null = null
let watchedTargetDir: string | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: WINDOW_TITLE[uiLocale],
    backgroundColor: '#12151a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function isImageFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase()
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

async function scanImages(dir: string): Promise<ImageItem[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const images: ImageItem[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!isImageFile(entry.name)) continue
    const fullPath = join(dir, entry.name)
    const parsed = parse(entry.name)
    let size = 0
    try {
      size = (await stat(fullPath)).size
    } catch {
      continue
    }
    images.push({
      path: fullPath,
      name: entry.name,
      basename: parsed.name,
      ext: parsed.ext,
      size
    })
  }

  images.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  return images
}

async function listCategories(dir: string): Promise<CategoryItem[]> {
  if (!dir || !existsSync(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const cats: CategoryItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'Favs') continue
    cats.push({
      name: entry.name,
      path: join(dir, entry.name)
    })
  }
  cats.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  return cats
}

function emitCategories(dir: string): void {
  void listCategories(dir).then((cats) => {
    mainWindow?.webContents.send('categories:updated', cats)
  })
}

async function stopCategoryWatch(): Promise<void> {
  if (categoryWatcher) {
    await categoryWatcher.close()
    categoryWatcher = null
  }
  watchedTargetDir = null
}

function startCategoryWatch(dir: string): void {
  void stopCategoryWatch().then(() => {
    if (!dir || !existsSync(dir)) return
    watchedTargetDir = dir
    emitCategories(dir)

    categoryWatcher = chokidar.watch(dir, {
      depth: 0,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      // Polling helps with some NAS mounts
      usePolling: process.env.PHOTO_CLASSIFIER_POLL === '1'
    })

    const refresh = (): void => {
      if (watchedTargetDir) emitCategories(watchedTargetDir)
    }

    categoryWatcher.on('addDir', refresh)
    categoryWatcher.on('unlinkDir', refresh)
    categoryWatcher.on('error', () => {
      // Keep last known list; user can re-select folder
    })
  })
}

async function uniqueTargetPath(dir: string, filename: string): Promise<string> {
  const parsed = parse(filename)
  let candidate = join(dir, filename)
  let i = 1
  while (existsSync(candidate)) {
    candidate = join(dir, `${parsed.name}_${i}${parsed.ext}`)
    i += 1
  }
  return candidate
}

function sanitizeBasename(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/g, '')
}

async function classifyCopy(
  sourcePath: string,
  newBasename: string,
  categoryPaths: string[],
  favsDir?: string | null
): Promise<ClassifyResult> {
  const destinations: string[] = []
  try {
    await access(sourcePath, constants.R_OK)
    if (categoryPaths.length === 0 && !favsDir) {
      return { ok: false, error: 'noCategorySelected' }
    }

    for (const cat of categoryPaths) {
      if (!existsSync(cat)) {
        return { ok: false, error: `categoryMissing:${basename(cat)}` }
      }
    }

    const ext = extname(sourcePath)
    const safeBase = sanitizeBasename(newBasename) || parse(sourcePath).name
    const desiredName = `${safeBase}${ext}`

    const targets = [...categoryPaths]
    if (favsDir) {
      await mkdir(favsDir, { recursive: true })
      targets.push(favsDir)
    }

    for (const dir of targets) {
      const dest = await uniqueTargetPath(dir, desiredName)
      await copyFile(sourcePath, dest)
      destinations.push(dest)
    }

    return { ok: true, destinations }
  } catch (err) {
    for (const d of destinations) {
      await unlink(d).catch(() => undefined)
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function revertClassify(destinations: string[]): Promise<ClassifyResult> {
  try {
    const existing = destinations.filter((d) => existsSync(d))
    if (existing.length === 0) {
      return { ok: false, error: 'revertMissing' }
    }
    for (const d of existing) {
      await unlink(d)
    }
    return { ok: true, destinations: existing }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function registerIpc(): void {
  ipcMain.handle('dialog:selectSourceFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: uiLocale === 'zh' ? '选择待处理文件夹' : 'Select inbox folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:selectTargetFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: uiLocale === 'zh' ? '选择目标文件夹' : 'Select target folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('images:scan', async (_e, dir: string) => {
    if (!dir || !existsSync(dir)) return []
    return scanImages(dir)
  })

  ipcMain.handle('fs:pathExists', async (_e, targetPath: string) => {
    return Boolean(targetPath && existsSync(targetPath))
  })

  ipcMain.handle('categories:watch', async (_e, dir: string) => {
    startCategoryWatch(dir)
    return listCategories(dir)
  })

  ipcMain.handle('categories:unwatch', async () => {
    await stopCategoryWatch()
  })

  ipcMain.handle(
    'classify:copy',
    async (
      _e,
      payload: {
        sourcePath: string
        newBasename: string
        categoryPaths: string[]
        favsDir?: string | null
      }
    ) => {
      return classifyCopy(
        payload.sourcePath,
        payload.newBasename,
        payload.categoryPaths,
        payload.favsDir
      )
    }
  )

  ipcMain.handle('classify:revert', async (_e, payload: { destinations: string[] }) => {
    return revertClassify(payload.destinations)
  })

  ipcMain.handle('app:setLocale', async (_e, locale: UiLocale) => {
    if (locale !== 'zh' && locale !== 'en') return
    uiLocale = locale
    mainWindow?.setTitle(WINDOW_TITLE[locale])
  })
}

function decodeMediaPath(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    const encoded = url.pathname.replace(/^\/+/, '')
    if (!encoded) return null
    const filePath = Buffer.from(encoded, 'base64url').toString('utf8')
    if (!filePath) return null
    if (!isAbsolute(filePath) && !filePath.startsWith('\\\\') && !filePath.startsWith('//')) {
      return null
    }
    return filePath
  } catch {
    return null
  }
}

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    const filePath = decodeMediaPath(request.url)
    if (!filePath || !isImageFile(filePath)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void stopCategoryWatch()
  if (process.platform !== 'darwin') app.quit()
})
