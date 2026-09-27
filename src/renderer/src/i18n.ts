import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export type Locale = 'zh' | 'en'

const STORAGE_KEY = 'photo-classifier.locale'

const zh = {
  appTitle: '图片分类助手',
  brandPrefix: '图片',
  brandAccent: '分类',
  brandSuffix: '助手',
  sourceFolder: '待处理文件夹',
  targetFolder: '目标文件夹',
  notSelected: '未选择',
  imageDetails: '图片详情',
  filenameLabel: '文件名（不含扩展名）',
  extensionLabel: '扩展名：',
  sizeLabel: '大小：',
  dimensionsLabel: '尺寸：',
  reading: '读取中…',
  noImages: '暂无待处理图片。请选择包含图片文件的文件夹。',
  processing: '处理中…',
  categories: '分类',
  mode: '模式',
  classifyModeAria: '分类模式',
  single: '单类',
  multi: '复类',
  pickTargetHint: '请先选择目标文件夹。其子目录将作为分类，并实时刷新。',
  emptyCategories: '目标文件夹下还没有子目录。在资源管理器中新建文件夹后，这里会自动出现。',
  confirmClassify: '确认复制（{n}）· 空格',
  skipCurrent: '跳过 · 空格',
  singleHint: '单类模式：点击分类即复制进去并进入下一张（原图保留）；空格跳过。',
  multiHint: '复类模式：勾选分类后按空格复制到所选分类（原图保留）；未勾选时空格跳过。',
  statusStart: '选择待处理文件夹与目标文件夹开始分类',
  statusSource: '已选择待处理: {dir}',
  statusTarget: '已选择目标: {dir}（子文件夹将实时刷新）',
  statusCopied: '已复制「{name}」到 {n} 个位置',
  statusCopiedLast: '已复制「{name}」到 {n} 个位置，已是最后一张',
  statusSkipped: '已跳过当前图片',
  statusSkippedLast: '已是最后一张，无法再跳过',
  statusCopying: '正在复制到 {n} 个位置…',
  classifyFailed: '分类失败',
  imageError: '无法显示该图片。仍可在左侧改名并在右侧分类。',
  sourceMissing: '待处理文件夹已不存在或不可访问，请重新选择。',
  imageEmpty: '选择待处理文件夹后，将在此显示图片',
  categoryMissing: '分类文件夹不存在',
  categoryMissingNamed: '分类文件夹不存在: {name}',
  noCategorySelected: '请至少选择一个分类',
  revertMissing: '无法撤销：找不到已复制的文件',
  revertOk: '已撤销上一次分类',
  revertEmpty: '没有可撤销的操作',
  revertFailed: '撤销失败',
  shortcutsHelp: '快捷键',
  shortcutsTitle: '快捷键说明',
  shortcutsClose: '关闭',
  bindKey: '绑定',
  bindEmpty: '—',
  bindWaiting: '…',
  bindHint: '点击后按 1–0 / W S Z X C 绑定；再点清除',
  shortcutSpace: '空格 — 复类：复制到已勾选分类并进入下一张；无勾选（或单类）时跳过',
  shortcutArrows: 'A / ← — 上一张；D / → — 下一张',
  shortcutQ: 'Q — 单类模式',
  shortcutE: 'E — 复类模式',
  shortcutF: 'F — 切换收藏（分类时额外复制到目标下 Favs）',
  shortcutR: 'R — 撤销上一次分类（删除复制出的文件，最多保留 5 条）',
  shortcutBinds: '1–0、W、S、Z、X、C — 触发已绑定分类（单类：直接复制；复类：勾选/取消）',
  favToggle: '收藏',
  favOn: '收藏开',
  favHint: '开启后，分类时会额外复制到目标文件夹下的 Favs',
  progressJumpHint: '输入序号后回车，跳到第 N 张图片',
  langZh: '中文',
  langEn: 'EN'
}

export type Messages = typeof zh

const en: Messages = {
  appTitle: 'Photo Classifier',
  brandPrefix: 'Photo ',
  brandAccent: 'Classifier',
  brandSuffix: '',
  sourceFolder: 'Inbox folder',
  targetFolder: 'Target folder',
  notSelected: 'Not selected',
  imageDetails: 'Image details',
  filenameLabel: 'Filename (without extension)',
  extensionLabel: 'Extension: ',
  sizeLabel: 'Size: ',
  dimensionsLabel: 'Dimensions: ',
  reading: 'Reading…',
  noImages: 'No images to process. Select a folder that contains image files.',
  processing: 'Working…',
  categories: 'Categories',
  mode: 'Mode',
  classifyModeAria: 'Classify mode',
  single: 'Single',
  multi: 'Multi',
  pickTargetHint: 'Select a target folder first. Its first-level subfolders are categories and refresh live.',
  emptyCategories:
    'No subfolders yet. Create a folder in File Explorer and it will appear here automatically.',
  confirmClassify: 'Confirm copy ({n}) · Space',
  skipCurrent: 'Skip · Space',
  singleHint:
    'Single mode: click a category to copy into it and go next (original is kept). Space skips.',
  multiHint:
    'Multi mode: check categories, then press Space to copy into them (original is kept). With nothing checked, Space skips.',
  statusStart: 'Select an inbox folder and a target folder to start classifying',
  statusSource: 'Inbox: {dir}',
  statusTarget: 'Target: {dir} (subfolders refresh live)',
  statusCopied: 'Copied “{name}” to {n} location(s)',
  statusCopiedLast: 'Copied “{name}” to {n} location(s); this was the last image',
  statusSkipped: 'Skipped current image',
  statusSkippedLast: 'Already the last image; nothing to skip',
  statusCopying: 'Copying to {n} location(s)…',
  classifyFailed: 'Classify failed',
  imageError: 'Cannot display this image. You can still rename it on the left and classify on the right.',
  sourceMissing: 'Inbox folder is missing or inaccessible. Please select it again.',
  imageEmpty: 'Select an inbox folder to view images here',
  categoryMissing: 'Category folder not found',
  categoryMissingNamed: 'Category folder not found: {name}',
  noCategorySelected: 'Select at least one category',
  revertMissing: 'Cannot revert: copied files not found',
  revertOk: 'Reverted last classify',
  revertEmpty: 'Nothing to revert',
  revertFailed: 'Revert failed',
  shortcutsHelp: 'Shortcuts',
  shortcutsTitle: 'Keyboard shortcuts',
  shortcutsClose: 'Close',
  bindKey: 'Bind',
  bindEmpty: '—',
  bindWaiting: '…',
  bindHint: 'Click, then press 1–0 / W S Z X C to bind; click again to clear',
  shortcutSpace:
    'Space — Multi: copy into checked categories and go next; skip if none checked (or in single mode)',
  shortcutArrows: 'A / ← — Previous image; D / → — Next image',
  shortcutQ: 'Q — Single mode',
  shortcutE: 'E — Multi mode',
  shortcutF: 'F — Toggle favorite (also copy into target/Favs on classify)',
  shortcutR: 'R — Revert last classify (deletes the copies, up to 5 records)',
  shortcutBinds: '1–0, W, S, Z, X, C — Bound category (single: copy; multi: toggle)',
  favToggle: 'Fav',
  favOn: 'Fav on',
  favHint: 'When on, classify also copies into Favs under the target folder',
  progressJumpHint: 'Type a number and press Enter to jump to image N',
  langZh: '中文',
  langEn: 'EN'
}

export const messages: Record<Locale, Messages> = { zh, en }

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // ignore
  }
  return 'zh'
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
}

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}

export function formatClassifyError(error: string, t: Messages): string {
  if (error === 'classifyFailed') return t.classifyFailed
  if (error === 'categoryMissing') return t.categoryMissing
  if (error === 'noCategorySelected') return t.noCategorySelected
  if (error === 'revertMissing') return t.revertMissing
  if (error === 'revertFailed') return t.revertFailed
  if (error.startsWith('categoryMissing:')) {
    return interpolate(t.categoryMissingNamed, { name: error.slice('categoryMissing:'.length) })
  }
  return error
}

type I18nValue = {
  locale: Locale
  t: Messages
  setLocale: (next: Locale) => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const applyLocale = useCallback((next: Locale) => {
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
    document.title = messages[next].appTitle
    void window.api.setLocale(next)
  }, [])

  const setLocale = useCallback(
    (next: Locale) => {
      persistLocale(next)
      setLocaleState(next)
      applyLocale(next)
    },
    [applyLocale]
  )

  useEffect(() => {
    applyLocale(locale)
  }, [applyLocale, locale])

  const value = useMemo<I18nValue>(
    () => ({ locale, t: messages[locale], setLocale }),
    [locale, setLocale]
  )

  return createElement(I18nContext.Provider, { value }, children)
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
