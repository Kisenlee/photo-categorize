import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryItem, ClassifyMode, ImageItem } from '../../shared/types'
import { formatClassifyError, interpolate, useI18n, type Messages } from './i18n'

const BINDABLE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'w', 's', 'z', 'x', 'c'] as const
type BindableKey = (typeof BINDABLE_KEYS)[number]

type Status =
  | { type: 'idle'; key: 'statusStart' }
  | { type: 'idle'; key: 'statusSource'; dir: string }
  | { type: 'idle'; key: 'statusTarget'; dir: string }
  | { type: 'idle'; key: 'statusCopying'; n: number }
  | { type: 'ok'; key: 'statusCopied'; name: string; n: number }
  | { type: 'ok'; key: 'statusCopiedLast'; name: string; n: number }
  | { type: 'ok'; key: 'revertOk' }
  | { type: 'ok'; key: 'statusSkipped' }
  | { type: 'ok'; key: 'statusSkippedLast' }
  | { type: 'error'; key: 'revertEmpty' }
  | { type: 'error'; key: 'raw'; text: string }

type LastClassify = {
  sourcePath: string
  destinations: string[]
}

function renderStatus(status: Status, t: Messages): string {
  switch (status.key) {
    case 'statusStart':
      return t.statusStart
    case 'statusSource':
      return interpolate(t.statusSource, { dir: status.dir })
    case 'statusTarget':
      return interpolate(t.statusTarget, { dir: status.dir })
    case 'statusCopying':
      return interpolate(t.statusCopying, { n: status.n })
    case 'statusCopied':
      return interpolate(t.statusCopied, { name: status.name, n: status.n })
    case 'statusCopiedLast':
      return interpolate(t.statusCopiedLast, { name: status.name, n: status.n })
    case 'revertOk':
      return t.revertOk
    case 'statusSkipped':
      return t.statusSkipped
    case 'statusSkippedLast':
      return t.statusSkippedLast
    case 'revertEmpty':
      return t.revertEmpty
    case 'raw':
      return status.text
  }
}

function isBindableKey(key: string): key is BindableKey {
  return (BINDABLE_KEYS as readonly string[]).includes(key)
}

function normalizeBindKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key
}

function joinFavsDir(targetDir: string): string {
  const trimmed = targetDir.replace(/[/\\]+$/, '')
  const sep = trimmed.includes('\\') || /^[a-zA-Z]:/.test(trimmed) ? '\\' : '/'
  return `${trimmed}${sep}Favs`
}

function toMediaUrl(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `media://local/${b64}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fileNameOf(p: string): string {
  return p.split(/[/\\]/).pop() ?? p
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA') return true
  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type || 'text'
    return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button'
  }
  return false
}

export default function App(): React.JSX.Element {
  const { locale, t, setLocale } = useI18n()
  const [sourceDir, setSourceDir] = useState<string | null>(null)
  const [targetDir, setTargetDir] = useState<string | null>(null)
  const [images, setImages] = useState<ImageItem[]>([])
  const [index, setIndex] = useState(0)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [mode, setMode] = useState<ClassifyMode>('single')
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [editName, setEditName] = useState('')
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [status, setStatus] = useState<Status>({ type: 'idle', key: 'statusStart' })
  const [busy, setBusy] = useState(false)
  const [keyBinds, setKeyBinds] = useState<Partial<Record<BindableKey, string>>>({})
  const [bindingTarget, setBindingTarget] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [classifyHistory, setClassifyHistory] = useState<LastClassify[]>([])
  const [favOn, setFavOn] = useState(false)
  const [indexDraft, setIndexDraft] = useState('0')

  const modeRef = useRef(mode)
  const busyRef = useRef(busy)
  const selectedCatsRef = useRef(selectedCats)
  const keyBindsRef = useRef(keyBinds)
  const bindingTargetRef = useRef(bindingTarget)
  const helpOpenRef = useRef(helpOpen)
  const classifyHistoryRef = useRef(classifyHistory)
  const favOnRef = useRef(favOn)
  const targetDirRef = useRef(targetDir)
  const currentRef = useRef(images[index] ?? null)
  const editNameRef = useRef(editName)
  const sourceDirRef = useRef(sourceDir)
  const imagesRef = useRef(images)
  const indexRef = useRef(index)
  const totalRef = useRef(0)

  modeRef.current = mode
  busyRef.current = busy
  selectedCatsRef.current = selectedCats
  keyBindsRef.current = keyBinds
  bindingTargetRef.current = bindingTarget
  helpOpenRef.current = helpOpen
  classifyHistoryRef.current = classifyHistory
  favOnRef.current = favOn
  targetDirRef.current = targetDir
  currentRef.current = images[index] ?? null
  editNameRef.current = editName
  sourceDirRef.current = sourceDir
  imagesRef.current = images
  indexRef.current = index

  const current = images[index] ?? null
  const total = images.length
  totalRef.current = total

  useEffect(() => {
    setIndexDraft(total === 0 ? '0' : String(Math.min(index + 1, total)))
  }, [index, total])

  const bindLabelForCategory = useCallback(
    (catPath: string): string => {
      const entry = Object.entries(keyBinds).find(([, path]) => path === catPath)
      return entry ? entry[0].toUpperCase() : t.bindEmpty
    },
    [keyBinds, t.bindEmpty]
  )

  const refreshImages = useCallback(async (dir: string, preferPath?: string) => {
    const list = await window.api.scanImages(dir)
    setImages(list)
    if (list.length === 0) {
      setIndex(0)
      return
    }
    if (preferPath) {
      const found = list.findIndex((v) => v.path === preferPath)
      setIndex(found >= 0 ? found : 0)
    } else {
      setIndex(0)
    }
  }, [])

  const pickSource = async (): Promise<void> => {
    const dir = await window.api.selectSourceFolder()
    if (!dir) return
    setSourceDir(dir)
    setStatus({ type: 'idle', key: 'statusSource', dir })
    await refreshImages(dir)
  }

  const pickTarget = async (): Promise<void> => {
    const dir = await window.api.selectTargetFolder()
    if (!dir) return
    setTargetDir(dir)
    const cats = await window.api.watchCategories(dir)
    setCategories(cats)
    setSelectedCats([])
    setKeyBinds({})
    setBindingTarget(null)
    setStatus({ type: 'idle', key: 'statusTarget', dir })
  }

  useEffect(() => {
    const off = window.api.onCategoriesUpdated((cats) => {
      setCategories(cats)
      setSelectedCats((prev) => prev.filter((p) => cats.some((c) => c.path === p)))
      setKeyBinds((prev) => {
        const next: Partial<Record<BindableKey, string>> = {}
        for (const [key, path] of Object.entries(prev) as [BindableKey, string][]) {
          if (cats.some((c) => c.path === path)) next[key] = path
        }
        return next
      })
    })
    return () => {
      off()
      void window.api.unwatchCategories()
    }
  }, [])

  useEffect(() => {
    setEditName(current?.basename ?? '')
    setDims(null)
    setImgFailed(false)
    setSelectedCats([])
  }, [current?.path])

  useEffect(() => {
    const next = images[index + 1]
    if (!next) return
    const img = new Image()
    img.src = toMediaUrl(next.path)
  }, [images, index])

  // Inbox is not watched; if the user changes it externally, refresh on focus.
  useEffect(() => {
    const refreshIfNeeded = (): void => {
      const dir = sourceDirRef.current
      if (!dir || busyRef.current) return
      void (async () => {
        const dirOk = await window.api.pathExists(dir)
        if (!dirOk) {
          setImages([])
          setIndex(0)
          setStatus({ type: 'error', key: 'raw', text: t.sourceMissing })
          return
        }
        const list = await window.api.scanImages(dir)
        const prev = imagesRef.current
        if (list.length === prev.length && list.every((v, i) => v.path === prev[i]?.path)) {
          return
        }
        const curPath = currentRef.current?.path
        setImages(list)
        const found = curPath ? list.findIndex((v) => v.path === curPath) : -1
        setIndex(found >= 0 ? found : Math.max(0, Math.min(indexRef.current, list.length - 1)))
      })()
    }
    window.addEventListener('focus', refreshIfNeeded)
    return () => window.removeEventListener('focus', refreshIfNeeded)
  }, [t.sourceMissing])

  const jumpToOrdinal = useCallback((ordinal: number): void => {
    const n = totalRef.current
    if (n <= 0) return
    const clamped = Math.max(1, Math.min(n, Math.floor(ordinal)))
    setIndex(clamped - 1)
    setIndexDraft(String(clamped))
  }, [])

  const step = useCallback((delta: number): void => {
    const n = totalRef.current
    if (n <= 0 || busyRef.current) return
    setIndex((i) => Math.max(0, Math.min(n - 1, i + delta)))
  }, [])

  const skipCurrent = useCallback((): void => {
    const n = totalRef.current
    if (n <= 0 || busyRef.current) return
    const next = indexRef.current + 1
    if (next >= n) {
      setStatus({ type: 'ok', key: 'statusSkippedLast' })
      return
    }
    setIndex(next)
    setStatus({ type: 'ok', key: 'statusSkipped' })
  }, [])

  const runCopy = useCallback(async (selected: string[]): Promise<void> => {
    const cur = currentRef.current
    if (!cur || busyRef.current) return
    const favsDir =
      favOnRef.current && targetDirRef.current ? joinFavsDir(targetDirRef.current) : null
    if (selected.length === 0 && !favsDir) {
      skipCurrent()
      return
    }
    const sourcePath = cur.path
    const count = selected.length + (favsDir ? 1 : 0)
    setBusy(true)
    setStatus({ type: 'idle', key: 'statusCopying', n: count })
    const result = await window.api.classifyCopy({
      sourcePath,
      newBasename: editNameRef.current,
      categoryPaths: selected,
      favsDir
    })
    setBusy(false)
    if (!result.ok) {
      setStatus({
        type: 'error',
        key: 'raw',
        text: formatClassifyError(result.error || 'classifyFailed', t)
      })
      return
    }
    const destinations = result.destinations ?? []
    setClassifyHistory((prev) => [...prev, { sourcePath, destinations }].slice(-5))
    setFavOn(false)
    const name = fileNameOf(sourcePath)
    const next = indexRef.current + 1
    if (next >= totalRef.current) {
      setSelectedCats([])
      setStatus({ type: 'ok', key: 'statusCopiedLast', name, n: destinations.length })
    } else {
      setIndex(next)
      setStatus({ type: 'ok', key: 'statusCopied', name, n: destinations.length })
    }
  }, [skipCurrent, t])

  const runConfirm = useCallback(async (): Promise<void> => {
    await runCopy(modeRef.current === 'multi' ? selectedCatsRef.current : [])
  }, [runCopy])

  const runRevert = useCallback(async (): Promise<void> => {
    const history = classifyHistoryRef.current
    const last = history[history.length - 1]
    if (!last || busyRef.current) {
      setStatus({ type: 'error', key: 'revertEmpty' })
      return
    }
    setBusy(true)
    const result = await window.api.classifyRevert({ destinations: last.destinations })
    setBusy(false)
    if (!result.ok) {
      setStatus({
        type: 'error',
        key: 'raw',
        text: formatClassifyError(result.error || 'revertFailed', t)
      })
      return
    }
    setClassifyHistory((prev) => prev.slice(0, -1))
    setStatus({ type: 'ok', key: 'revertOk' })
    const found = imagesRef.current.findIndex((v) => v.path === last.sourcePath)
    if (found >= 0) {
      setIndex(found)
    } else if (sourceDirRef.current) {
      await refreshImages(sourceDirRef.current, last.sourcePath)
    }
  }, [refreshImages, t])

  const toggleCat = useCallback((path: string): void => {
    setSelectedCats((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    )
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return
      }

      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body) {
        // Keep Space from activating the focused button.
        active.blur()
      }

      if (helpOpenRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setHelpOpen(false)
        }
        return
      }

      const key = normalizeBindKey(event)

      if (bindingTargetRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setBindingTarget(null)
          return
        }
        if (isBindableKey(key)) {
          event.preventDefault()
          const catPath = bindingTargetRef.current
          setKeyBinds((prev) => {
            const next: Partial<Record<BindableKey, string>> = { ...prev }
            for (const [k, path] of Object.entries(next) as [BindableKey, string][]) {
              if (path === catPath || k === key) delete next[k]
            }
            next[key] = catPath
            return next
          })
          setBindingTarget(null)
          return
        }
        setBindingTarget(null)
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) void runConfirm()
        return
      }
      if (event.key === 'ArrowLeft' || key === 'a') {
        event.preventDefault()
        step(-1)
        return
      }
      if (event.key === 'ArrowRight' || key === 'd') {
        event.preventDefault()
        step(1)
        return
      }
      if (key === 'f') {
        event.preventDefault()
        setFavOn((v) => !v)
        return
      }
      if (key === 'r') {
        event.preventDefault()
        void runRevert()
        return
      }

      if (key === 'q') {
        event.preventDefault()
        setMode('single')
        setSelectedCats([])
        return
      }
      if (key === 'e') {
        event.preventDefault()
        setMode('multi')
        return
      }

      if (isBindableKey(key)) {
        const catPath = keyBindsRef.current[key]
        if (catPath && !busyRef.current) {
          event.preventDefault()
          if (modeRef.current === 'single') void runCopy([catPath])
          else toggleCat(catPath)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [runConfirm, runCopy, runRevert, step, toggleCat])

  const statusClass = useMemo(() => {
    if (status.type === 'error') return 'status-bar error'
    if (status.type === 'ok') return 'status-bar ok'
    return 'status-bar'
  }, [status.type])

  const statusLine = renderStatus(status, t)

  const onBindClick = (catPath: string): void => {
    if (bindingTarget === catPath) {
      setBindingTarget(null)
      return
    }
    const existing = (Object.entries(keyBinds) as [BindableKey, string][]).find(
      ([, path]) => path === catPath
    )
    if (existing && bindingTarget === null) {
      setKeyBinds((prev) => {
        const next = { ...prev }
        delete next[existing[0]]
        return next
      })
      return
    }
    setBindingTarget(catPath)
  }

  const confirmCount =
    (mode === 'multi' ? selectedCats.length : 0) + (favOn && targetDir ? 1 : 0)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          {t.brandPrefix}
          <span>{t.brandAccent}</span>
          {t.brandSuffix}
        </div>

        <div className="path-group">
          <button type="button" className="path-btn" onClick={() => void pickSource()}>
            {t.sourceFolder}
          </button>
          <span className="path-display" title={sourceDir ?? ''}>
            {sourceDir ?? t.notSelected}
          </span>
        </div>

        <div className="path-group">
          <button type="button" className="path-btn" onClick={() => void pickTarget()}>
            {t.targetFolder}
          </button>
          <span className="path-display" title={targetDir ?? ''}>
            {targetDir ?? t.notSelected}
          </span>
        </div>

        <div className="progress-chip" title={t.progressJumpHint}>
          {total === 0 ? (
            <span>0 / 0</span>
          ) : (
            <>
              <input
                className="progress-index-input"
                type="text"
                inputMode="numeric"
                aria-label={t.progressJumpHint}
                value={indexDraft}
                onChange={(e) => setIndexDraft(e.target.value.replace(/[^\d]/g, ''))}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => {
                  const n = Number(indexDraft)
                  if (!Number.isFinite(n) || n < 1) {
                    setIndexDraft(String(Math.min(index + 1, total)))
                    return
                  }
                  jumpToOrdinal(n)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    const n = Number(indexDraft)
                    if (Number.isFinite(n) && n >= 1) jumpToOrdinal(n)
                    ;(e.currentTarget as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    setIndexDraft(String(Math.min(index + 1, total)))
                    ;(e.currentTarget as HTMLInputElement).blur()
                  }
                }}
              />
              <span className="progress-sep">/</span>
              <span>{total}</span>
            </>
          )}
        </div>

        <div className="segmented lang-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={locale === 'zh' ? 'active' : ''}
            onClick={() => setLocale('zh')}
          >
            {t.langZh}
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'active' : ''}
            onClick={() => setLocale('en')}
          >
            {t.langEn}
          </button>
        </div>

        <button
          type="button"
          className={`path-btn fav-btn${favOn ? ' active' : ''}`}
          title={t.favHint}
          aria-pressed={favOn}
          onClick={() => setFavOn((v) => !v)}
        >
          <span className="fav-star" aria-hidden>
            ★
          </span>
          {favOn ? t.favOn : t.favToggle}
        </button>

        <button
          type="button"
          className="path-btn help-btn"
          title={t.shortcutsHelp}
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
      </header>

      <div className="main">
        <aside className="panel panel-left">
          <h2 className="panel-title">{t.imageDetails}</h2>
          {current ? (
            <>
              <div className="field">
                <label htmlFor="rename">{t.filenameLabel}</label>
                <input
                  id="rename"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                  disabled={busy}
                  spellCheck={false}
                />
              </div>
              <div className="meta">
                {t.extensionLabel}
                {current.ext || '—'}
              </div>
              <div className="meta" style={{ marginTop: 12 }}>
                {t.sizeLabel}
                {formatSize(current.size)}
              </div>
              <div className="meta" style={{ marginTop: 12 }}>
                {t.dimensionsLabel}
                {dims ? `${dims.w} × ${dims.h}` : imgFailed ? '—' : t.reading}
              </div>
              <div className="meta-muted" title={current.path}>
                {current.path}
              </div>
            </>
          ) : (
            <p className="empty-hint">{t.noImages}</p>
          )}
        </aside>

        <section className="panel-center" style={{ position: 'relative' }}>
          <div className="image-stage">
            {!current ? (
              <div className="image-empty">{t.imageEmpty}</div>
            ) : imgFailed ? (
              <div className="image-error">{t.imageError}</div>
            ) : (
              <img
                key={current.path}
                src={toMediaUrl(current.path)}
                alt={current.name}
                draggable={false}
                onLoad={(e) =>
                  setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
                }
                onError={() => setImgFailed(true)}
              />
            )}
          </div>
          {total > 0 && (
            <div className="filmstrip">
              {Array.from({ length: 11 }, (_, k) => index - 5 + k).map((i) => {
                const img = images[i]
                if (!img) return <div key={`empty-${i}`} className="film-cell empty" />
                return (
                  <button
                    key={img.path}
                    type="button"
                    className={`film-cell${i === index ? ' current' : ''}`}
                    title={`${i + 1}. ${img.name}`}
                    disabled={busy}
                    onClick={() => setIndex(i)}
                  >
                    <img src={toMediaUrl(img.path)} alt="" loading="lazy" decoding="async" draggable={false} />
                  </button>
                )
              })}
            </div>
          )}
          {busy && <div className="busy-overlay">{t.processing}</div>}
        </section>

        <aside className="panel panel-right">
          <h2 className="panel-title">{t.categories}</h2>

          <div className="toggle-row">
            <span className="toggle-label">{t.mode}</span>
            <div className="segmented" role="group" aria-label={t.classifyModeAria}>
              <button
                type="button"
                className={mode === 'single' ? 'active' : ''}
                onClick={() => {
                  setMode('single')
                  setSelectedCats([])
                }}
              >
                {t.single}
              </button>
              <button
                type="button"
                className={mode === 'multi' ? 'active' : ''}
                onClick={() => setMode('multi')}
              >
                {t.multi}
              </button>
            </div>
          </div>

          {!targetDir ? (
            <p className="empty-hint">{t.pickTargetHint}</p>
          ) : categories.length === 0 ? (
            <p className="empty-hint">{t.emptyCategories}</p>
          ) : (
            <>
              <p className="bind-hint">{t.bindHint}</p>
              <div className="category-list">
                {categories.map((cat) => {
                  const selected = selectedCats.includes(cat.path)
                  const waiting = bindingTarget === cat.path
                  const bindLabel = waiting ? t.bindWaiting : bindLabelForCategory(cat.path)
                  return (
                    <div key={cat.path} className="category-row">
                      {mode === 'single' ? (
                        <button
                          type="button"
                          className="category-item"
                          disabled={!current || busy}
                          onClick={() => void runCopy([cat.path])}
                        >
                          {cat.name}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`category-item${selected ? ' selected' : ''}`}
                          disabled={!current || busy}
                          onClick={() => toggleCat(cat.path)}
                        >
                          <input type="checkbox" readOnly checked={selected} tabIndex={-1} />
                          {cat.name}
                        </button>
                      )}
                      <button
                        type="button"
                        className={`bind-btn${waiting ? ' waiting' : ''}${
                          bindLabel !== t.bindEmpty && !waiting ? ' bound' : ''
                        }`}
                        title={t.bindKey}
                        disabled={busy}
                        onClick={() => onBindClick(cat.path)}
                      >
                        {bindLabel}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <button
            type="button"
            className="ctrl-btn primary"
            style={{ width: '100%' }}
            disabled={!current || busy}
            onClick={() => void runConfirm()}
          >
            {confirmCount > 0 ? interpolate(t.confirmClassify, { n: confirmCount }) : t.skipCurrent}
          </button>

          <p className="empty-hint" style={{ marginTop: 8 }}>
            {mode === 'single' ? t.singleHint : t.multiHint}
          </p>
        </aside>
      </div>

      <footer className={statusClass}>{statusLine}</footer>

      {helpOpen && (
        <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-labelledby="shortcuts-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="shortcuts-title">{t.shortcutsTitle}</h2>
            <ul className="shortcut-list">
              <li>{t.shortcutSpace}</li>
              <li>{t.shortcutArrows}</li>
              <li>{t.shortcutQ}</li>
              <li>{t.shortcutE}</li>
              <li>{t.shortcutF}</li>
              <li>{t.shortcutR}</li>
              <li>{t.shortcutBinds}</li>
            </ul>
            <button type="button" className="ctrl-btn primary" onClick={() => setHelpOpen(false)}>
              {t.shortcutsClose}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
