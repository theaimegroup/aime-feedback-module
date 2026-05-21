import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnnotationCanvas, type AnnotationCanvasHandle } from './AnnotationCanvas'
import { submitFeedback } from './api'
import { captureScreenshot } from './screenshot'
import type { FeedbackComment, FeedbackMeta, FeedbackPriority, FeedbackType, FeedbackWidgetHandle, NotifyUser } from './types'
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
  priority: 'medium',
  tags: [],
  submittedByName: '',
  notifyOnResolve: false,
  submitterEmail: '',
  selectedNotifyUsers: [],
}

const MAX_NOTIFY_USERS = 5

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
const FAB_LS_KEY = '__aime_fb_pos__'

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
  { projectId, projectsMsToken, projectsMsBaseUrl, filesMsApiBaseUrl, filesMsToken, fabBackground, showFab = true, teamsUrl, userName, notifyUsers, onOpenChange, onCapturingChange },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [capturedMeta, setCapturedMeta] = useState<FeedbackMeta | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<AnnotationCanvasHandle>(null)
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

  const isDisabled = projectId.startsWith('__') || projectsMsToken.startsWith('__') || filesMsToken.startsWith('__')

  const openWidgetDirect = useCallback(() => {
    if (capturing || open || isDisabled) return
    setScreenshot(null)
    setOpen(true)
    setForm(INITIAL_FORM)
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
  }, [capturing, open, isDisabled])

  const openWidget = useCallback(async () => {
    if (capturing || open || isDisabled) return
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
    setOpen(true)
    setForm(INITIAL_FORM)
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
  }, [capturing, open, isDisabled])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (open) return
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.altKey && e.key === 'F') openWidgetDirect()
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') openWidget()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, openWidget, openWidgetDirect])

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
    if (!moved) shift ? openWidgetDirect() : openWidget()
  }

  const close = useCallback(() => {
    setOpen(false)
    setScreenshot(null)
  }, [])

  useEffect(() => { onOpenChange?.(open) }, [open, onOpenChange])
  useEffect(() => { onCapturingChange?.(capturing) }, [capturing, onCapturingChange])

  useImperativeHandle(ref, () => ({ open: openWidget, close }), [openWidget, close])

  const handleSubmit = async () => {
    const emailOk = !form.notifyOnResolve || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitterEmail)
    if (!form.title.trim() || !form.description.trim() || !form.type || submitting || !emailOk) return
    setSubmitting(true)
    setError(null)
    try {
      const dataUrl = canvasRef.current?.getAnnotatedImage()
      const images = []
      if (dataUrl) {
        const uploaded = await uploadImage(dataUrl, projectId, filesMsApiBaseUrl, filesMsToken)
        if (uploaded) images.push(uploaded)
      }

      const noteComments = canvasRef.current?.getNoteComments() ?? []
      const authorName = form.submittedByName.trim() || userName || DEFAULT_SUBMITTER_NAME
      const comments: FeedbackComment[] = noteComments.map((n) => ({
        text: n.text,
        author_name: authorName,
        source: 'annotation',
        metadata: n.metadata,
      }))

      await submitFeedback(projectsMsBaseUrl, projectId, projectsMsToken, {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        priority: form.priority,
        tags: form.tags,
        images,
        comments,
        metadata: capturedMeta ?? undefined,
        submitted_by_name: authorName,
        submitted_by_email: form.notifyOnResolve && form.submitterEmail.trim() ? form.submitterEmail.trim() : undefined,
        notify_user_ids: form.selectedNotifyUsers.length > 0 ? form.selectedNotifyUsers.map(u => u.id) : undefined,
        teams_url: teamsUrl,
      })
      setSuccess(true)
      setTimeout(close, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
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
    fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block',
  }

  const emailValid = !form.notifyOnResolve || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitterEmail)
  const canSubmit = !!form.title.trim() && !!form.description.trim() && !!form.type && !submitting && emailValid

  return (
    <>
      <style>{`@keyframes aime-spin { to { transform: rotate(360deg) } }`}</style>
      {showFab && (
      <div
        id="__aime-fb__"
        ref={fabDivRef}
        style={{ position: 'fixed', left: fabPos.x, top: fabPos.y, zIndex: 99998 }}
      >
        <button
          disabled={capturing}
          title="Submit feedback (Ctrl+Shift+F) · Shift+click or Ctrl+Shift+Alt+F to skip screenshot"
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
      </div>
      )}

      {open && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
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
            {/* Header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px', height: 60, flexShrink: 0,
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'white' }}>Submit Feedback</div>
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
                {/* Submitter name */}
                <div>
                  <label style={labelStyle}>Your name <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    value={form.submittedByName}
                    onChange={(e) => setForm((f) => ({ ...f, submittedByName: e.target.value }))}
                    placeholder={DEFAULT_SUBMITTER_NAME}
                    maxLength={80}
                    style={inputStyle}
                  />
                </div>

                {/* Notify on resolve */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div
                      onClick={() => setForm((f) => ({ ...f, notifyOnResolve: !f.notifyOnResolve, submitterEmail: f.notifyOnResolve ? '' : f.submitterEmail }))}
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
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                  />
                </div>

                {/* Type */}
                <div>
                  <label style={labelStyle}>What type of feedback is this? <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {FEEDBACK_TYPES.map((t) => {
                      const selected = form.type === t.id
                      return (
                        <button
                          key={t.id}
                          onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                            textAlign: 'left',
                            background: selected ? `rgba(${hexToRgb(TYPE_COLORS[t.id])},0.12)` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${selected ? TYPE_COLORS[t.id] : 'rgba(255,255,255,0.08)'}`,
                            transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ color: selected ? TYPE_COLORS[t.id] : 'rgba(255,255,255,0.5)', flexShrink: 0, marginTop: 1 }}>
                            {t.icon}
                          </span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: selected ? 'white' : 'rgba(255,255,255,0.8)' }}>
                              {t.label}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.4 }}>
                              {t.desc}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Priority + Tags */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Priority</label>
                    <select
                      value={form.priority}
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
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
                  </div>
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
                  <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13, display: 'inline-block', maxWidth: '100%' }}>
                    {error}
                  </div>
                )}
                {success && (
                  <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#86efac', fontSize: 13, display: 'inline-block', maxWidth: '100%' }}>
                    Feedback submitted successfully. Thank you!
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
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
