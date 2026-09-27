import type { PhotoClassifierApi } from './index'

declare global {
  interface Window {
    api: PhotoClassifierApi
  }
}

export {}
