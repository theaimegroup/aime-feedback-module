import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnnotationCanvas, type AnnotationCanvasHandle } from './AnnotationCanvas'
import { submitFeedback } from './api'
import { captureScreenshot } from './screenshot'
import type { FeedbackComment, FeedbackMeta, FeedbackPriority, FeedbackStatus, FeedbackSubmission, FeedbackType, FeedbackWidgetHandle, NotifyUser } from './types'
import { deleteDraftScreenshot, getDraftScreenshot, saveDraftScreenshot } from './draftStorage'
import { uploadImage } from './upload'
import { AIME_LOGO_DATA_URL } from './logo'

interface Props {
  projectId: string
  projectsMsToken: string
  projectsMsBaseUrl: string
  filesMsApiBaseUrl: string
  filesMsToken: string
  /** Any valid CSS `background` value — solid colour, gradient, etc.
   *  Invalid values are silently ignored by the browser (FAB becomes transparent).
   *  Defaults to the built-in purple gradient. */
  fabBackground?: string
  /** Render the built-in floating action button. Defaults to `true`. */
  showFab?: boolean
  /** Optional teams app URL — when provided, renders an "AIME Teams" link in the modal header. An env badge (DEV/BETA) is auto-derived from this URL. */
  teamsUrl?: string
  /** Name shown as the author on annotation comments. Defaults to "Anonymous". */
  userName?: string
  /** Submitter email from the host session. Pre-fills the email field and pre-checks "Notify me when resolved". */
  userEmail?: string
  /** Project members available for targeted notifications. When provided, a multi-select appears in the form (max 5). */
  notifyUsers?: NotifyUser[]
  /** Called whenever the modal opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** Called whenever a screenshot capture starts or ends. */
  onCapturingChange?: (capturing: boolean) => void
}

interface FormState {
  title: string
  description: string
  type: FeedbackType | null
  status: FeedbackStatus
  priority: FeedbackPriority
  tags: string[]
  submittedByName: string
  notifyOnResolve: boolean
  submitterEmail: string
  selectedNotifyUsers: NotifyUser[]
}

const DEFAULT_SUBMITTER_NAME = 'Aime'

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  type: null,
  status: 'new',
  priority: 'medium',
  tags: [],
  submittedByName: '',
  notifyOnResolve: false,
  submitterEmail: '',
  selectedNotifyUsers: [],
}

const MAX_NOTIFY_USERS = 5
const MAX_EXTRA_IMAGES = 5

interface ExtraImage {
  file: File
  preview: string
}

const DRAFT_PREFIX = 'aime-feedback-draft:'

interface StoredDraft {
  form: FormState
  clientSubmissionId: string
  savedAt: string
  capturedMeta?: FeedbackMeta | null
}

const makeClientSubmissionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`

function UserMultiSelect({ users, selected, onChange }: {
  users: NotifyUser[]
  selected: NotifyUser[]
  onChange: (u: NotifyUser[]) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const available = users.filter(u =>
    !selected.find(s => s.id === u.id) &&
    u.name.toLowerCase().includes(query.toLowerCase())
  )

  const add = (user: NotifyUser) => {
    if (selected.length >= MAX_NOTIFY_USERS) return
    onChange([...selected, user])
    setQuery('')
    setOpen(false)
  }

  const remove = (id: string) => onChange(selected.filter(u => u.id !== id))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const atMax = selected.length >= MAX_NOTIFY_USERS

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selected.map(u => (
            <span key={u.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              background: 'rgba(69,64,232,0.2)', color: '#a5b4fc',
              border: '1px solid rgba(69,64,232,0.35)',
            }}>
              {u.name}
              <button
                onClick={() => remove(u.id)}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14, opacity: 0.7 }}
              >×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={atMax ? `Max ${MAX_NOTIFY_USERS} users selected` : 'Search members…'}
        disabled={atMax}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          padding: '10px 12px', color: 'white', fontSize: 14, outline: 'none',
          boxSizing: 'border-box', opacity: atMax ? 0.5 : 1,
        }}
      />
      {open && available.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
          background: '#1e2a45', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          maxHeight: 180, overflowY: 'auto',
        }}>
          {available.map(u => (
            <div
              key={u.id}
              onMouseDown={() => add(u)}
              style={{
                padding: '9px 14px', fontSize: 13, color: '#e1e8fc', cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {u.name}
            </div>
          ))}
        </div>
      )}
      {!atMax && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
          {selected.length}/{MAX_NOTIFY_USERS} selected
        </p>
      )}
    </div>
  )
}

const FEEDBACK_TYPES: { id: FeedbackType; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'bug',
    label: 'Bug',
    desc: 'Something is broken or not working as expected',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 6L12 2L16 6" /><circle cx="12" cy="13" r="5" />
        <path d="M2 13h5M17 13h5M12 8V5M9 18.5L7 21M15 18.5L17 21" />
      </svg>
    ),
  },
  {
    id: 'feature_request',
    label: 'Feature Request',
    desc: 'Suggest a new feature or enhancement',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </svg>
    ),
  },
  {
    id: 'improvement',
    label: 'Improvement',
    desc: 'Ways to improve existing functionality',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    id: 'question',
    label: 'Question',
    desc: 'Ask a question or request clarification',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
      </svg>
    ),
  },
]

const TYPE_COLORS: Record<FeedbackType, string> = {
  bug: '#ef4444',
  feature_request: '#3b82f6',
  improvement: '#22c55e',
  question: '#a855f7',
}

const PRIORITIES: FeedbackPriority[] = ['low', 'medium', 'high', 'critical']

// End users can only set early-lifecycle statuses; resolved/closed are reserved for the Teams app.
const STATUS_OPTIONS: { id: FeedbackStatus; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'triaged', label: 'Triaged' },
  { id: 'in_progress', label: 'In Progress' },
]

const getViewportW = () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
const getViewportH = () => (typeof window !== 'undefined' ? window.innerHeight : 768)

/** A single row in the FAB action menu. `icon` is the inner paths of a 24×24 stroke SVG. */
function FabMenuItem({
  label,
  hint,
  icon,
  danger,
  onClick,
}: {
  label: string
  hint?: string
  icon: React.ReactNode
  danger?: boolean
  onClick: () => void
}) {
  const color = danger ? '#fca5a5' : 'rgba(255,255,255,0.85)'
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
        background: 'transparent', border: 'none', textAlign: 'left', color,
        fontFamily: 'inherit', fontSize: 13.5,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
        {icon}
      </svg>
      <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{hint}</span>}
    </button>
  )
}

/**
 * Derive an env tag from the teamsUrl so users know which environment the
 * feedback will be submitted to. Returns label + color tone for the badge.
 *   - localhost / private IPs → DEV (orange)
 *   - hostname includes beta/staging/dev → BETA (orange)
 *   - anything else                       → GO (green, production)
 */
function deriveEnvTag(teamsUrl: string | undefined): { label: string; tone: 'warn' | 'prod' } | null {
  if (!teamsUrl) return null
  let host = ''
  try { host = new URL(teamsUrl).hostname.toLowerCase() } catch { return { label: 'GO', tone: 'prod' } }
  if (host === 'localhost' || host.startsWith('127.') || host.startsWith('192.168.') || host.startsWith('100.')) {
    return { label: 'DEV', tone: 'warn' }
  }
  if (host.includes('beta') || host.includes('staging') || host.includes('dev.')) {
    return { label: 'BETA', tone: 'warn' }
  }
  return { label: 'GO', tone: 'prod' }
}

const FAB_SIZE = 52
const FAB_MARGIN = 24
const RESTORE_HINT_SECONDS = 7
const FAB_LS_KEY = '__aime_fb_pos__'
const FAB_HIDDEN_LS_KEY = '__aime_fb_hidden__'

function getDefaultFabPos() {
  if (typeof window === 'undefined') return { x: FAB_MARGIN, y: 400 }
  return { x: FAB_MARGIN, y: window.innerHeight - FAB_SIZE - FAB_MARGIN }
}

function snapToCorner(pos: { x: number; y: number }): { x: number; y: number } {
  const w = window.innerWidth, h = window.innerHeight
  const cx = pos.x + FAB_SIZE / 2, cy = pos.y + FAB_SIZE / 2
  return {
    x: cx < w / 2 ? FAB_MARGIN : w - FAB_SIZE - FAB_MARGIN,
    y: cy < h / 2 ? FAB_MARGIN : h - FAB_SIZE - FAB_MARGIN,
  }
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')

  const add = () => {
    const tag = input.trim().toLowerCase()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setInput('')
  }

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 10px',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8, minHeight: 40, alignItems: 'center',
      }}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            background: 'rgba(69,64,232,0.25)', color: '#a5b4fc',
            padding: '2px 8px', borderRadius: 4, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {tag}
          <button
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 15 }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); add() }
        }}
        onBlur={add}
        aria-label="Add tags"
        placeholder={tags.length === 0 ? 'Add tags…' : ''}
        style={{
          background: 'none', border: 'none', outline: 'none',
          color: 'white', fontSize: 14, minWidth: 80, flex: 1,
        }}
      />
    </div>
  )
}

const FAB_DEFAULT_BG = 'linear-gradient(135deg, #4540E8, #7c3aed)'
const FAB_DEFAULT_SHADOW = '0 4px 20px rgba(69,64,232,0.5)'
const FAB_CUSTOM_SHADOW = '0 4px 20px rgba(0,0,0,0.4)'

export const FeedbackWidget = forwardRef<FeedbackWidgetHandle, Props>(function FeedbackWidget(
  { projectId, projectsMsToken, projectsMsBaseUrl, filesMsApiBaseUrl, filesMsToken, fabBackground, showFab = true, teamsUrl, userName, userEmail, notifyUsers, onOpenChange, onCapturingChange },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [fabHidden, setFabHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(FAB_HIDDEN_LS_KEY) === '1' } catch { return false }
  })
  // Brief hint shown when the FAB is hidden, telling the user how to bring it back.
  const [restoreHint, setRestoreHint] = useState(false)
  const [restoreCountdown, setRestoreCountdown] = useState(RESTORE_HINT_SECONDS)
  const restoreHintTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [draftSavedHint, setDraftSavedHint] = useState(false)
  const [draftSavedCountdown, setDraftSavedCountdown] = useState(6)
  const draftSavedHintTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [extraImages, setExtraImages] = useState<ExtraImage[]>([])
  const [dragActive, setDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const [capturing, setCapturing] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [capturedMeta, setCapturedMeta] = useState<FeedbackMeta | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ticket, setTicket] = useState<FeedbackSubmission | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitControllerRef = useRef<AbortController | null>(null)
  const [clientSubmissionId, setClientSubmissionId] = useState(makeClientSubmissionId)
  const [draftRestored, setDraftRestored] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const draftLoadedRef = useRef(false)
  const draftKey = projectId ? `${DRAFT_PREFIX}${projectId}` : ''
  const canvasRef = useRef<AnnotationCanvasHandle>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const extraImagesRef = useRef<ExtraImage[]>([])
  const fabDivRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; fx: number; fy: number; moved: boolean; shift: boolean } | null>(null)
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(FAB_LS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed
      }
    } catch {}
    return getDefaultFabPos()
  })

  useEffect(() => {
    extraImagesRef.current = extraImages
  }, [extraImages])

  useEffect(() => () => {
    extraImagesRef.current.forEach((image) => URL.revokeObjectURL(image.preview))
  }, [])

  // Disabled when a required credential is missing or still a placeholder.
  // Null-safe: a generated app may pass `undefined` from an unset env var, and
  // that must not throw.
  const isDisabled =
    !projectId ||
    !projectsMsToken ||
    !filesMsToken ||
    projectId.startsWith('__') ||
    projectsMsToken.startsWith('__') ||
    filesMsToken.startsWith('__')

  // Persist + reveal the FAB. Triggering the widget always brings the FAB back.
  const revealFab = useCallback(() => {
    setFabHidden(false)
    try { localStorage.setItem(FAB_HIDDEN_LS_KEY, '0') } catch {}
  }, [])

  const dismissHint = useCallback(() => {
    if (restoreHintTimer.current) { clearInterval(restoreHintTimer.current); restoreHintTimer.current = null }
    setRestoreHint(false)
  }, [])

  // Show the "here's how to bring it back" hint whenever the FAB gets hidden, with a
  // visible per-second countdown that auto-dismisses at 0.
  const showRestoreHint = useCallback(() => {
    if (restoreHintTimer.current) clearInterval(restoreHintTimer.current)
    setRestoreHint(true)
    setRestoreCountdown(RESTORE_HINT_SECONDS)
    restoreHintTimer.current = setInterval(() => {
      setRestoreCountdown((c) => {
        if (c <= 1) {
          if (restoreHintTimer.current) { clearInterval(restoreHintTimer.current); restoreHintTimer.current = null }
          setRestoreHint(false)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (restoreHintTimer.current) clearInterval(restoreHintTimer.current) }, [])

  const dismissDraftSavedHint = useCallback(() => {
    if (draftSavedHintTimer.current) { clearInterval(draftSavedHintTimer.current); draftSavedHintTimer.current = null }
    setDraftSavedHint(false)
  }, [])

  const showDraftSavedHint = useCallback(() => {
    if (draftSavedHintTimer.current) clearInterval(draftSavedHintTimer.current)
    setDraftSavedHint(true)
    setDraftSavedCountdown(6)
    draftSavedHintTimer.current = setInterval(() => {
      setDraftSavedCountdown((count) => {
        if (count <= 1) {
          if (draftSavedHintTimer.current) { clearInterval(draftSavedHintTimer.current); draftSavedHintTimer.current = null }
          setDraftSavedHint(false)
          return 0
        }
        return count - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => { if (draftSavedHintTimer.current) clearInterval(draftSavedHintTimer.current) }, [])

  const hideFab = useCallback(() => {
    setMenuOpen(false)
    setFabHidden(true)
    try { localStorage.setItem(FAB_HIDDEN_LS_KEY, '1') } catch {}
    showRestoreHint()
  }, [showRestoreHint])

  const toggleFabHidden = useCallback(() => {
    setFabHidden((prev) => {
      const next = !prev
      if (next) { setMenuOpen(false); showRestoreHint() }
      else dismissHint()
      try { localStorage.setItem(FAB_HIDDEN_LS_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [showRestoreHint, dismissHint])

  // Seed the form, pre-filling submitter identity from the host session.
  const seedForm = useCallback(() => {
    setForm({
      ...INITIAL_FORM,
      submittedByName: userName || '',
      submitterEmail: userEmail || '',
      notifyOnResolve: !!userEmail,
    })
  }, [userName, userEmail])

  const loadDraft = useCallback(async (): Promise<boolean> => {
    draftLoadedRef.current = true
    if (!draftKey) return false
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return false
      const draft = JSON.parse(raw) as StoredDraft
      if (!draft?.form || typeof draft.form !== 'object') return false
      setForm({ ...INITIAL_FORM, ...draft.form })
      setClientSubmissionId(draft.clientSubmissionId || makeClientSubmissionId())
      setCapturedMeta(draft.capturedMeta ?? null)
      setDraftRestored(true)
      const savedScreenshot = await getDraftScreenshot(draftKey)
      if (savedScreenshot) setScreenshot(savedScreenshot)
      return true
    } catch {
      return false
    }
  }, [draftKey])

  const seedFreshForm = useCallback(() => {
    draftLoadedRef.current = true
    seedForm()
    setClientSubmissionId(makeClientSubmissionId())
    setDraftRestored(false)
  }, [seedForm])

  const discardDraft = useCallback(() => {
    if (draftKey) {
      try { localStorage.removeItem(draftKey) } catch {}
      void deleteDraftScreenshot(draftKey)
    }
    seedFreshForm()
    setHasDraft(false)
  }, [draftKey, seedFreshForm])

  const clearDraft = useCallback(() => {
    if (draftKey) {
      try { localStorage.removeItem(draftKey) } catch {}
      void deleteDraftScreenshot(draftKey)
    }
    setDraftRestored(false)
    setHasDraft(false)
  }, [draftKey])

  useEffect(() => {
    if (!draftKey) {
      setHasDraft(false)
      return
    }
    try { setHasDraft(!!localStorage.getItem(draftKey)) } catch { setHasDraft(false) }
  }, [draftKey, open])

  useEffect(() => {
    if (!open || !draftLoadedRef.current || !draftKey || success) return
    // Identity fields are prefilled by the host and must not recreate a draft
    // after the user explicitly discards one.
    const hasContent =
      form.title.trim() ||
      form.description.trim() ||
      form.type ||
      form.tags.length > 0
    if (!hasContent) return
    try {
      const draft: StoredDraft = { form, clientSubmissionId, capturedMeta, savedAt: new Date().toISOString() }
      localStorage.setItem(draftKey, JSON.stringify(draft))
      setHasDraft(true)
    } catch {
      // Draft persistence is best-effort; submission must still work.
    }
  }, [form, clientSubmissionId, capturedMeta, draftKey, open, success])

  useEffect(() => {
    if (!open || !draftKey || success || draftRestored || screenshot) return
    const hasContent = form.title.trim() || form.description.trim() || form.type
    if (hasContent) void deleteDraftScreenshot(draftKey)
  }, [draftKey, draftRestored, form.title, form.description, form.type, open, screenshot, success])

  useEffect(() => {
    if (!open || !draftKey || success || !screenshot) return
    const hasContent = form.title.trim() || form.description.trim() || form.type
    if (hasContent) void saveDraftScreenshot(draftKey, screenshot)
  }, [draftKey, form.title, form.description, form.type, open, screenshot, success])

  const clearExtraImages = useCallback(() => {
    setExtraImages((images) => {
      images.forEach((image) => URL.revokeObjectURL(image.preview))
      return []
    })
  }, [])

  const addExtraImages = useCallback((files: FileList | File[] | null) => {
    if (!files?.length) return
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
    setExtraImages((images) => {
      const rooms = Math.max(0, MAX_EXTRA_IMAGES - images.length)
      const added = incoming.slice(0, rooms).map((file) => ({ file, preview: URL.createObjectURL(file) }))
      return [...images, ...added]
    })
  }, [])

  const onImageDragEnter = useCallback((event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragActive(true)
  }, [])

  const onImageDragOver = useCallback((event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onImageDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }, [])

  const onImageDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setDragActive(false)
    addExtraImages(event.dataTransfer.files)
  }, [addExtraImages])

  useEffect(() => {
    if (!open) return
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      event.preventDefault()
      addExtraImages(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, addExtraImages])

  const removeExtraImage = useCallback((index: number) => {
    setExtraImages((images) => {
      const next = [...images]
      const [removed] = next.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.preview)
      return next
    })
  }, [])

  const openWidgetDirect = useCallback(() => {
    if (capturing || open || isDisabled) return
    setMenuOpen(false)
    revealFab()
    setScreenshot(null)
    clearExtraImages()
    setOpen(true)
    seedFreshForm()
    const { browser, os } = parseBrowserOS(navigator.userAgent)
    setCapturedMeta({
      url: window.location.href,
      page_title: document.title || undefined,
      browser,
      os,
      screen: `${window.screen.width}×${window.screen.height}`,
    })
    setError(null)
    setSuccess(false)
    setTicket(null)
  }, [capturing, open, isDisabled, revealFab, seedFreshForm, clearExtraImages])

  const openWidget = useCallback(async () => {
    if (capturing || open || isDisabled) return
    setMenuOpen(false)
    revealFab()
    setCapturing(true)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    let img: string | null = null
    try {
      img = await captureScreenshot()
    } catch (err) {
      console.error('[aime-feedback-module] screenshot failed:', err)
    }
    setCapturing(false)
    setScreenshot(img)
    clearExtraImages()
    setOpen(true)
    seedFreshForm()
    const { browser, os } = parseBrowserOS(navigator.userAgent)
    setCapturedMeta({
      url: window.location.href,
      page_title: document.title || undefined,
      browser,
      os,
      screen: `${window.screen.width}×${window.screen.height}`,
    })
    setError(null)
    setSuccess(false)
    setTicket(null)
  }, [capturing, open, isDisabled, clearExtraImages, seedFreshForm])

  const openDraft = useCallback(async () => {
    if (capturing || open || isDisabled) return
    setMenuOpen(false)
    revealFab()
    const restored = await loadDraft()
    if (!restored) {
      openWidgetDirect()
      return
    }
    clearExtraImages()
    setOpen(true)
    setError(null)
    setSuccess(false)
    setTicket(null)
  }, [capturing, open, isDisabled, revealFab, loadDraft, openWidgetDirect, clearExtraImages])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Hide/show the FAB — works regardless of modal state (only meaningful when showFab is enabled).
      if (showFab && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault()
        toggleFabHidden()
        return
      }
      if (open) return
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey && e.key === 'F') openWidgetDirect()
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') openWidget()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, openWidget, openWidgetDirect, showFab, toggleFabHidden])

  // First-paint reconciliation: the useState initializer read whatever was in
  // localStorage (or the default) without knowing the current viewport. If the
  // cached coords are off-screen for today's viewport (smaller monitor, rotated
  // device, different window size), the FAB would render invisible. Snap to
  // the nearest corner of the CURRENT viewport as soon as we mount.
  useEffect(() => {
    setFabPos((prev) => {
      const snapped = snapToCorner(prev)
      if (snapped.x === prev.x && snapped.y === prev.y) return prev // no-op
      try { localStorage.setItem(FAB_LS_KEY, JSON.stringify(snapped)) } catch {}
      return snapped
    })
  }, []) // run once on mount

  useEffect(() => {
    const onResize = () => {
      setFabPos((prev) => {
        const snapped = snapToCorner(prev)
        if (fabDivRef.current) {
          fabDivRef.current.style.transition = 'left 0.2s ease-out, top 0.2s ease-out'
          fabDivRef.current.style.left = `${snapped.x}px`
          fabDivRef.current.style.top  = `${snapped.y}px`
        }
        try { localStorage.setItem(FAB_LS_KEY, JSON.stringify(snapped)) } catch {}
        return snapped
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Dismiss the FAB action menu on outside-click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDocDown = (e: MouseEvent) => {
      if (fabDivRef.current && !fabDivRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, fx: fabPos.x, fy: fabPos.y, moved: false, shift: e.shiftKey }
    if (fabDivRef.current) fabDivRef.current.style.transition = 'none'
  }

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.px
    const dy = e.clientY - dragRef.current.py
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragRef.current.moved = true
    if (fabDivRef.current) {
      fabDivRef.current.style.left = `${dragRef.current.fx + dx}px`
      fabDivRef.current.style.top = `${dragRef.current.fy + dy}px`
    }
  }

  const onFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    const { px, py, fx, fy, moved, shift } = dragRef.current
    dragRef.current = null
    const rawPos = { x: fx + (e.clientX - px), y: fy + (e.clientY - py) }
    const snapped = snapToCorner(rawPos)
    if (fabDivRef.current) {
      fabDivRef.current.style.transition = 'left 0.25s ease-out, top 0.25s ease-out'
      fabDivRef.current.style.left = `${snapped.x}px`
      fabDivRef.current.style.top = `${snapped.y}px`
    }
    setFabPos(snapped)
    try { localStorage.setItem(FAB_LS_KEY, JSON.stringify(snapped)) } catch {}
    // Plain click opens the action menu; shift+click remains a shortcut to capture without a screenshot.
    if (!moved) shift ? openWidgetDirect() : setMenuOpen((v) => !v)
  }

  const close = useCallback(() => {
    submitControllerRef.current?.abort()
    submitControllerRef.current = null
    setSubmitting(false)
    setOpen(false)
    setScreenshot(null)
    setSuccess(false)
    setTicket(null)
    clearExtraImages()
  }, [clearExtraImages])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const root = dialogRef.current
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((node) => node.offsetParent !== null)

    const focusTimer = window.setTimeout(() => {
      const preferred = root?.querySelector<HTMLElement>('[data-autofocus]')
      ;(preferred ?? focusables()[0])?.focus()
    }, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusables()
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [open, close])

  useEffect(() => { onOpenChange?.(open) }, [open, onOpenChange])
  useEffect(() => { onCapturingChange?.(capturing) }, [capturing, onCapturingChange])

  useImperativeHandle(ref, () => ({ open: openWidget, close }), [openWidget, close])

  const handleSubmit = async () => {
    const emailOk = !form.notifyOnResolve || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitterEmail)
    if (!form.title.trim() || !form.description.trim() || !form.type || submitting || !emailOk) return
    setSubmitting(true)
    setError(null)
    const controller = new AbortController()
    submitControllerRef.current = controller
    try {
      const dataUrl = canvasRef.current?.getAnnotatedImage()
      const images = []
      if (dataUrl) {
        const uploaded = await uploadImage(dataUrl, projectId, filesMsApiBaseUrl, filesMsToken, controller.signal)
        if (uploaded) images.push(uploaded)
      }
      for (const image of extraImages) {
        const uploaded = await uploadImage(image.file, projectId, filesMsApiBaseUrl, filesMsToken, controller.signal)
        if (uploaded) images.push(uploaded)
      }
      if (controller.signal.aborted) return

      const noteComments = canvasRef.current?.getNoteComments() ?? []
      const authorName = form.submittedByName.trim() || userName || DEFAULT_SUBMITTER_NAME
      const comments: FeedbackComment[] = noteComments.map((n) => ({
        text: n.text,
        author_name: authorName,
        source: 'annotation',
        metadata: n.metadata,
      }))

      const submission = await submitFeedback(projectsMsBaseUrl, projectId, projectsMsToken, {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        status: form.status,
        priority: form.priority,
        tags: form.tags,
        images,
        comments,
        metadata: capturedMeta ?? undefined,
        submitted_by_name: authorName,
        submitted_by_email: form.notifyOnResolve && form.submitterEmail.trim() ? form.submitterEmail.trim() : undefined,
        notify_user_ids: form.selectedNotifyUsers.length > 0 ? form.selectedNotifyUsers.map(u => u.id) : undefined,
        teams_url: teamsUrl,
        client_submission_id: clientSubmissionId,
      }, controller.signal)
      setTicket(submission)
      setSuccess(true)
      clearDraft()
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Failed to submit. Please try again.')
      }
    } finally {
      if (submitControllerRef.current === controller) submitControllerRef.current = null
      setSubmitting(false)
    }
  }

  const saveDraftNow = async () => {
    if (!draftKey) return
    const hasContent = !!(form.title.trim() || form.description.trim() || form.type || form.tags.length > 0)
    if (!hasContent) {
      setError('Add a title, description, type or tag before saving a draft.')
      return
    }
    try {
      const draft: StoredDraft = { form, clientSubmissionId, capturedMeta, savedAt: new Date().toISOString() }
      localStorage.setItem(draftKey, JSON.stringify(draft))
      if (screenshot) await saveDraftScreenshot(draftKey, screenshot)
      else await deleteDraftScreenshot(draftKey)
      setHasDraft(true)
      close()
      showDraftSavedHint()
    } catch {
      setError('Could not save this draft locally. Please try again.')
    }
  }

  if (isDisabled) return null

  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
    padding: '10px 12px', color: 'white', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: 'rgba(255,255,255,0.68)', marginBottom: 6, display: 'block',
  }

  const emailValid = !form.notifyOnResolve || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitterEmail)
  const canSubmit = !!form.title.trim() && !!form.description.trim() && !!form.type && !submitting && emailValid

  return (
    <>
      <style>{`@keyframes aime-spin { to { transform: rotate(360deg) } } @keyframes aime-fb-hint-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }`}</style>
      {showFab && !fabHidden && (
      <div
        id="__aime-fb__"
        ref={fabDivRef}
        style={{ position: 'fixed', left: fabPos.x, top: fabPos.y, zIndex: 99998 }}
      >
        <button
          disabled={capturing}
          title="Feedback options (Ctrl+Shift+F to capture · Shift+click to skip screenshot · Ctrl+Shift+H to hide)"
          onPointerDown={onFabPointerDown}
          onPointerMove={onFabPointerMove}
          onPointerUp={onFabPointerUp}
          style={{
            width: FAB_SIZE, height: FAB_SIZE, borderRadius: '50%',
            background: fabBackground ?? FAB_DEFAULT_BG,
            border: 'none', cursor: capturing ? 'wait' : 'grab',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: fabBackground ? FAB_CUSTOM_SHADOW : FAB_DEFAULT_SHADOW,
            transition: 'transform 0.15s',
            color: 'white',
          }}
          onMouseEnter={(e) => { if (!capturing) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
        >
          {capturing ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: 'aime-spin 0.75s linear infinite' }}>
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
          )}
        </button>

        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              [fabPos.y > getViewportH() / 2 ? 'bottom' : 'top']: FAB_SIZE + 10,
              [fabPos.x > getViewportW() / 2 ? 'right' : 'left']: 0,
              minWidth: 224,
              background: '#1A243E',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              padding: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <FabMenuItem
              label="Capture Feedback"
              hint="with screenshot"
              onClick={() => openWidget()}
              icon={<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>}
            />
            <FabMenuItem
              label="Capture without screenshot"
              onClick={() => openWidgetDirect()}
              icon={<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />}
            />
            {hasDraft && (
              <FabMenuItem
                label="Continue draft"
                hint="saved locally"
                onClick={() => void openDraft()}
                icon={<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>}
              />
            )}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 6px' }} />
            <FabMenuItem
              label="Hide FAB"
              hint="Ctrl+Shift+H"
              danger
              onClick={hideFab}
              icon={<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><path d="M3 3l18 18" /></>}
            />
          </div>
        )}
      </div>
      )}

      {restoreHint && createPortal((() => {
        // Anchor the hint to whichever corner the FAB was last snapped to, so it
        // appears right where the user expects the button to be.
        const vw = typeof window !== 'undefined' ? window.innerWidth : 0
        const vh = typeof window !== 'undefined' ? window.innerHeight : 0
        const isLeft = fabPos.x + FAB_SIZE / 2 < vw / 2
        const isTop = fabPos.y + FAB_SIZE / 2 < vh / 2
        return (
        <div
          role="status"
          aria-live="polite"
          onClick={() => { dismissHint(); revealFab() }}
          style={{
            position: 'fixed',
            [isLeft ? 'left' : 'right']: FAB_MARGIN,
            [isTop ? 'top' : 'bottom']: FAB_MARGIN,
            zIndex: 999999, maxWidth: `calc(100vw - ${FAB_MARGIN * 2}px)`,
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#1A243E', color: 'white',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
            padding: '10px 14px', cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            fontSize: 13, lineHeight: 1.4,
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            animation: `aime-fb-hint-in 0.18s ease-out`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><path d="M3 3l18 18" />
          </svg>
          <span style={{ maxWidth: 210 }}>
            Feedback button hidden. Press{' '}
            <kbd style={{
              background: 'rgba(255,255,255,0.12)', borderRadius: 4,
              padding: '1px 6px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
              {(typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)) ? '⌘' : 'Ctrl'}
              {' + Shift + H'}
            </kbd>
            {' '}to bring it back.
          </span>
          <div style={{ flexShrink: 0, marginLeft: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              aria-label="Dismiss"
              title="Dismiss"
              onClick={(e) => {
                e.stopPropagation() // don't trigger the toast's reveal-FAB click
                dismissHint()
              }}
              style={{
                padding: 2, background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.55)', lineHeight: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {/* Seconds-remaining text until the hint auto-dismisses. */}
            <span style={{
              fontSize: 11, fontWeight: 600, lineHeight: 1,
              color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums',
            }}>
              {restoreCountdown}s
            </span>
          </div>
        </div>
        )
      })(),
        document.body,
      )}

      {draftSavedHint && createPortal((() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 0
        const vh = typeof window !== 'undefined' ? window.innerHeight : 0
        const isLeft = fabPos.x + FAB_SIZE / 2 < vw / 2
        const isTop = fabPos.y + FAB_SIZE / 2 < vh / 2
        return (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'fixed',
              [isLeft ? 'left' : 'right']: FAB_MARGIN,
              [isTop ? 'top' : 'bottom']: FAB_MARGIN,
              zIndex: 999999,
              maxWidth: `calc(100vw - ${FAB_MARGIN * 2}px)`,
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#1A243E', color: 'white',
              border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
              fontSize: 13, lineHeight: 1.4,
              fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
              animation: 'aime-fb-hint-in 0.18s ease-out',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 2.5 2.5L16 9" />
            </svg>
            <span style={{ maxWidth: 250 }}>
              Draft saved. Continue any time from the feedback menu.
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                aria-label="Dismiss draft saved message"
                title="Dismiss"
                onClick={dismissDraftSavedHint}
                style={{ padding: 2, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', lineHeight: 0 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                {draftSavedCountdown}s
              </span>
            </div>
          </div>
        )
      })(), document.body)}

      {open && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aime-feedback-title"
            onDragEnter={onImageDragEnter}
            onDragOver={onImageDragOver}
            onDragLeave={onImageDragLeave}
            onDrop={onImageDrop}
            style={{
              position: 'relative',
              width: '96vw', height: '93vh',
              background: '#1A243E',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {dragActive && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(26,36,62,0.82)', border: '2px dashed #7c47d8', borderRadius: 16,
                  color: 'white', fontSize: 16, fontWeight: 600, letterSpacing: '0.01em',
                }}
              >
                Drop images to attach
              </div>
            )}
            {/* Header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px', height: 60, flexShrink: 0,
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div>
                <div id="aime-feedback-title" style={{ fontSize: 17, fontWeight: 600, color: 'white' }}>Submit Feedback</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                  Share your thoughts, report issues, or request new features.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {teamsUrl && (
                  <a
                    href={`${teamsUrl.replace(/\/+$/, '')}/projects/${projectId}/feedback`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      transition: 'all 0.15s',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'white'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                    }}
                  >
                    <img
                      src={AIME_LOGO_DATA_URL}
                      alt=""
                      aria-hidden
                      width={22}
                      height={22}
                      style={{ borderRadius: 5, flexShrink: 0, display: 'block' }}
                    />
                    AIME Teams
                    {(() => {
                      const tag = deriveEnvTag(teamsUrl)
                      if (!tag) return null
                      const warn = tag.tone === 'warn'
                      return (
                        <span
                          style={{
                            background: warn ? 'rgba(249,115,22,0.15)' : 'rgba(34,197,94,0.15)',
                            color:      warn ? '#fb923c'              : '#4ade80',
                            border: `1px solid ${warn ? 'rgba(249,115,22,0.3)' : 'rgba(34,197,94,0.3)'}`,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            padding: '2px 6px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                          }}
                        >
                          {tag.label}
                        </span>
                      )
                    })()}
                    <svg
                      width="12" height="12" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ opacity: 0.6, marginLeft: 2 }}
                    >
                      <path d="M7 17 17 7M7 7h10v10" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={close}
                  aria-label="Close feedback form"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, width: 34, height: 34, cursor: 'pointer',
                  color: 'rgba(255,255,255,0.6)', fontSize: 18, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: annotation */}
              <div
                style={{
                  flex: '0 0 66.666%', minWidth: 0, padding: 16,
                  borderRight: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Annotate Screenshot
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <AnnotationCanvas ref={canvasRef} screenshot={screenshot} />
                </div>
              </div>

              {/* Right: form */}
              <div
                style={{
                  flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 24px',
                  display: 'flex', flexDirection: 'column', gap: 18,
                }}
              >
                {draftRestored && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: 'rgba(71,116,254,0.12)', border: '1px solid rgba(71,116,254,0.3)',
                      color: '#bfd0ff', fontSize: 12,
                    }}
                  >
                    <span>Draft restored, including your screenshot.</span>
                    <button
                      type="button"
                      onClick={discardDraft}
                      style={{ background: 'none', border: 'none', color: '#dbe7ff', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Discard
                    </button>
                  </div>
                )}

                {/* Submitter name */}
                <div>
                  <label style={labelStyle}>Your name <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    value={form.submittedByName}
                    onChange={(e) => setForm((f) => ({ ...f, submittedByName: e.target.value }))}
                    placeholder={DEFAULT_SUBMITTER_NAME}
                    maxLength={80}
                    aria-label="Your name"
                    style={inputStyle}
                  />
                </div>

                {/* Notify on resolve */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div
                      role="checkbox"
                      aria-checked={form.notifyOnResolve}
                      aria-label="Notify me when this is resolved"
                      tabIndex={0}
                      onClick={() => setForm((f) => ({ ...f, notifyOnResolve: !f.notifyOnResolve, submitterEmail: f.notifyOnResolve ? '' : f.submitterEmail }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setForm((f) => ({ ...f, notifyOnResolve: !f.notifyOnResolve, submitterEmail: f.notifyOnResolve ? '' : f.submitterEmail }))
                        }
                      }}
                      style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${form.notifyOnResolve ? '#7c47d8' : 'rgba(255,255,255,0.2)'}`,
                        background: form.notifyOnResolve ? '#7c47d8' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {form.notifyOnResolve && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', userSelect: 'none' }}>
                      Notify me when this is resolved
                    </span>
                  </label>
                  {form.notifyOnResolve && (
                    <input
                      type="email"
                      value={form.submitterEmail}
                      onChange={(e) => setForm((f) => ({ ...f, submitterEmail: e.target.value }))}
                      placeholder="Your email address"
                      aria-label="Email address for feedback updates"
                      style={{ ...inputStyle, marginTop: 10 }}
                    />
                  )}
                </div>

                {/* Notify specific users */}
                {notifyUsers && notifyUsers.length > 0 && (
                  <div>
                    <label style={labelStyle}>
                      Alert team members <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>(optional, max {MAX_NOTIFY_USERS})</span>
                    </label>
                    <UserMultiSelect
                      users={notifyUsers}
                      selected={form.selectedNotifyUsers}
                      onChange={(u) => setForm((f) => ({ ...f, selectedNotifyUsers: u }))}
                    />
                  </div>
                )}

                {/* Title */}
                <div>
                  <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Brief summary of your feedback"
                    maxLength={200}
                    aria-label="Feedback title"
                    data-autofocus
                    style={inputStyle}
                  />
                </div>

                {/* Description */}
                <div>
                  <label style={labelStyle}>Description <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Provide detailed information…"
                    rows={3}
                    aria-label="Feedback description"
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                  />
                </div>

                {/* Type */}
                <div>
                  <label style={labelStyle}>What type of feedback is this? <span style={{ color: '#ef4444' }}>*</span></label>
                  <div role="group" aria-label="Feedback type" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                    {FEEDBACK_TYPES.map((t) => {
                      const selected = form.type === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          title={t.desc}
                          aria-label={`${t.label}: ${t.desc}`}
                          onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                            minHeight: 58, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                            textAlign: 'center',
                            background: selected ? `rgba(${hexToRgb(TYPE_COLORS[t.id])},0.12)` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${selected ? TYPE_COLORS[t.id] : 'rgba(255,255,255,0.08)'}`,
                            transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ color: selected ? TYPE_COLORS[t.id] : 'rgba(255,255,255,0.5)', display: 'flex' }}>
                            {t.icon}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.2, color: selected ? 'white' : 'rgba(255,255,255,0.8)' }}>
                            {t.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Status + Priority + Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Status</label>
                      <select
                        value={form.status}
                        aria-label="Status"
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FeedbackStatus }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id} style={{ background: '#1A243E' }}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Priority</label>
                      <select
                        value={form.priority}
                        aria-label="Priority"
                        onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as FeedbackPriority }))}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p} style={{ background: '#1A243E' }}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
                  </div>
                </div>

                {/* Additional images */}
                <div>
                  <label style={labelStyle}>
                    Additional images <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>(optional, max {MAX_EXTRA_IMAGES})</span>
                  </label>
                  <input
                    ref={attachInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      addExtraImages(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={extraImages.length >= MAX_EXTRA_IMAGES}
                    aria-label="Add additional images. You can also drag, drop or paste images."
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 12px', borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.06)',
                      color: extraImages.length >= MAX_EXTRA_IMAGES ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                      fontSize: 13, cursor: extraImages.length >= MAX_EXTRA_IMAGES ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add images
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>{extraImages.length}/{MAX_EXTRA_IMAGES}</span>
                  </button>
                  {extraImages.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      {extraImages.map((image, index) => (
                        <div key={`${image.file.name}-${index}`} style={{ position: 'relative', width: 68, height: 68 }}>
                          <img
                            src={image.preview}
                            alt={image.file.name}
                            title={image.file.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }}
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${image.file.name}`}
                            onClick={() => removeExtraImage(index)}
                            style={{
                              position: 'absolute', top: -5, right: -5, width: 18, height: 18,
                              borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
                              background: '#1A243E', color: 'white', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, lineHeight: 1, padding: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', gap: 10,
                padding: '0 24px', height: 68, flexShrink: 0,
                borderTop: '1px solid rgba(255,255,255,0.07)',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                {error && (
                  <div role="alert" style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13, display: 'inline-block', maxWidth: '100%' }}>
                    {error}
                  </div>
                )}
                {success && (
                  <div role="status" aria-live="polite" style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#86efac', fontSize: 13, display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, maxWidth: '100%' }}>
                    <span>
                      Feedback submitted successfully
                      {ticket?.feedbackNumber ? `, ticket #${ticket.feedbackNumber}` : ''}.
                    </span>
                    {ticket?.feedbackNumber && (ticket.statusUrl || teamsUrl) && (
                      <a
                        href={ticket.statusUrl ?? `${teamsUrl!.replace(/\/+$/, '')}/projects/${projectId}/feedback/${ticket.feedbackNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#bbf7d0', fontWeight: 600, textDecoration: 'underline' }}
                      >
                        Track status
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
              {success ? (
                <button
                  onClick={close}
                  style={{
                    padding: '0 28px', height: 40, borderRadius: 8,
                    background: 'linear-gradient(135deg, #4540E8, #7c3aed)',
                    border: 'none', color: 'white',
                    fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Close
                </button>
              ) : (
                <>
                  <button
                    onClick={close}
                    style={{
                      padding: '0 24px', height: 40, borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'transparent', color: 'rgba(255,255,255,0.7)',
                      fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDraftNow()}
                    disabled={!form.title.trim() && !form.description.trim() && !form.type && form.tags.length === 0}
                    style={{
                      padding: '0 18px', height: 40, borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.78)',
                      fontSize: 13, fontWeight: 500,
                      cursor: (!form.title.trim() && !form.description.trim() && !form.type && form.tags.length === 0) ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: (!form.title.trim() && !form.description.trim() && !form.type && form.tags.length === 0) ? 0.45 : 1,
                    }}
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    style={{
                      padding: '0 28px', height: 40, borderRadius: 8,
                      background: canSubmit ? 'linear-gradient(135deg, #4540E8, #7c3aed)' : 'rgba(255,255,255,0.08)',
                      border: 'none', color: canSubmit ? 'white' : 'rgba(255,255,255,0.3)',
                      fontSize: 14, fontWeight: 500, cursor: canSubmit ? 'pointer' : 'not-allowed',
                      transition: 'opacity 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {submitting ? 'Submitting…' : 'Submit Feedback'}
                  </button>
                </>
              )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
})

function parseBrowserOS(ua: string): { browser: string; os: string } {
  const browser =
    /Edg\/(\d+)/.exec(ua)     ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` :
    /OPR\/(\d+)/.exec(ua)     ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}` :
    /Chrome\/(\d+)/.exec(ua)  ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` :
    /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` :
    /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` :
    'Unknown'

  const os =
    /Windows NT 10/.test(ua)  ? 'Windows 11/10' :
    /Windows NT 6\.3/.test(ua)? 'Windows 8.1' :
    /Windows NT 6\.1/.test(ua)? 'Windows 7' :
    /Windows/.test(ua)        ? 'Windows' :
    /Mac OS X (\d+[._]\d+)/.exec(ua) ? `macOS ${/Mac OS X (\d+[._]\d+)/.exec(ua)![1].replace('_', '.')}` :
    /iPhone|iPad/.test(ua)    ? 'iOS' :
    /Android (\d+)/.exec(ua)  ? `Android ${/Android (\d+)/.exec(ua)![1]}` :
    /Linux/.test(ua)          ? 'Linux' :
    'Unknown'

  return { browser, os }
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
