export const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.avif'
] as const

export interface ImageItem {
  path: string
  name: string
  basename: string
  ext: string
  size: number
}

export interface CategoryItem {
  name: string
  path: string
}

export type ClassifyMode = 'single' | 'multi'

export interface ClassifyResult {
  ok: boolean
  error?: string
  destinations?: string[]
}
