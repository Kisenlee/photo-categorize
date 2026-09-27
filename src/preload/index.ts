import { contextBridge, ipcRenderer } from 'electron'
import type { ImageItem, CategoryItem, ClassifyResult } from '../shared/types'

const api = {
  selectSourceFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectSourceFolder'),

  selectTargetFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectTargetFolder'),

  scanImages: (dir: string): Promise<ImageItem[]> => ipcRenderer.invoke('images:scan', dir),

  pathExists: (targetPath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:pathExists', targetPath),

  watchCategories: (dir: string): Promise<CategoryItem[]> =>
    ipcRenderer.invoke('categories:watch', dir),

  unwatchCategories: (): Promise<void> => ipcRenderer.invoke('categories:unwatch'),

  onCategoriesUpdated: (callback: (cats: CategoryItem[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, cats: CategoryItem[]): void => {
      callback(cats)
    }
    ipcRenderer.on('categories:updated', handler)
    return () => {
      ipcRenderer.removeListener('categories:updated', handler)
    }
  },

  classifyCopy: (payload: {
    sourcePath: string
    newBasename: string
    categoryPaths: string[]
    favsDir?: string | null
  }): Promise<ClassifyResult> => ipcRenderer.invoke('classify:copy', payload),

  classifyRevert: (payload: { destinations: string[] }): Promise<ClassifyResult> =>
    ipcRenderer.invoke('classify:revert', payload),

  setLocale: (locale: 'zh' | 'en'): Promise<void> => ipcRenderer.invoke('app:setLocale', locale)
}

contextBridge.exposeInMainWorld('api', api)

export type PhotoClassifierApi = typeof api
