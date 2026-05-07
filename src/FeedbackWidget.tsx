import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnnotationCanvas, type AnnotationCanvasHandle } from './AnnotationCanvas'
import { submitFeedback } from './api'
import { captureScreenshot } from './screenshot'
import type { FeedbackPriority, FeedbackType } from './types'
import { uploadImage } from './upload'

interface Props {
  projectId: string
  appId: string
  token: string
  apiBaseUrl: string
  filesApiBaseUrl: string
  filesToken: string
  /** Any valid CSS `background` value — solid colour, gradient, etc.
   *  Invalid values are silently ignored by the browser (FAB becomes transparent).
   *  Defaults to the built-in purple gradient. */
  fabBackground?: string
}

interface FormState {
  title: string
  description: string
  type: FeedbackType | null
  priority: FeedbackPriority
  tags: string[]
}

const INITIAL_FORM: FormState = {
  title: '',
  description: '',
  type: null,
  priority: 'medium',
  tags: [],
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
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add() }
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

export function FeedbackWidget({ projectId, appId, token, apiBaseUrl, filesApiBaseUrl, filesToken, fabBackground }: Props) {
  const [open, setOpen] = useState(false)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<AnnotationCanvasHandle>(null)
  const fabDivRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ px: number; py: number; fx: number; fy: number; moved: boolean } | null>(null)
  const [fabPos, setFabPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem(FAB_LS_KEY)
      if (saved) return JSON.parse(saved)
    } catch {}
    return getDefaultFabPos()
  })

  const isDisabled = projectId.startsWith('__') || token.startsWith('__') || filesToken.startsWith('__')

  const openWidget = useCallback(async () => {
    if (capturing || open || isDisabled) return
    setCapturing(true)
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    let img: string | null = null
    try {
      img = await captureScreenshot()
    } catch (err) {
      console.error('[model-feedback] screenshot failed:', err)
    }
    setCapturing(false)
    setScreenshot(img)
    setOpen(true)
    setForm(INITIAL_FORM)
    setError(null)
    setSuccess(false)
  }, [capturing, open, isDisabled])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F' && !open) openWidget()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, openWidget])

  useEffect(() => {
    const onResize = () => {
      setFabPos((prev) => {
        const maxX = window.innerWidth - FAB_SIZE - FAB_MARGIN
        const maxY = window.innerHeight - FAB_SIZE - FAB_MARGIN
        return { x: Math.max(FAB_MARGIN, Math.min(prev.x, maxX)), y: Math.max(FAB_MARGIN, Math.min(prev.y, maxY)) }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, fx: fabPos.x, fy: fabPos.y, moved: false }
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
    const { px, py, fx, fy, moved } = dragRef.current
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
    if (!moved) openWidget()
  }

  const close = () => {
    setOpen(false)
    setScreenshot(null)
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.type || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const dataUrl = canvasRef.current?.getAnnotatedImage()
      const images = []
      if (dataUrl) {
        const uploaded = await uploadImage(dataUrl, projectId, filesApiBaseUrl, filesToken)
        if (uploaded) images.push(uploaded)
      }
      await submitFeedback(apiBaseUrl, projectId, token, {
        title: form.title.trim(),
        description: form.description.trim(),
        type: form.type,
        priority: form.priority,
        tags: form.tags,
        images,
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
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    padding: '10px 12px', color: 'white', fontSize: 14, outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block',
  }

  const canSubmit = !!form.title.trim() && !!form.type && !submitting

  return (
    <>
      <style>{`@keyframes aime-spin { to { transform: rotate(360deg) } }`}</style>
      <div
        id="__aime-fb__"
        ref={fabDivRef}
        style={{ position: 'fixed', left: fabPos.x, top: fabPos.y, zIndex: 99998 }}
      >
        <button
          disabled={capturing}
          title="Submit feedback (Shift+F)"
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
              background: '#0d0d18',
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

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: annotation */}
              <div
                style={{
                  flex: '0 0 66.666%', padding: 16,
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
                  flex: 1, overflowY: 'auto', padding: '16px 24px',
                  display: 'flex', flexDirection: 'column', gap: 18,
                }}
              >
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
                  <label style={labelStyle}>Description</label>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
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
                        <option key={p} value={p} style={{ background: '#0d0d18' }}>
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

                {error && (
                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
                    {error}
                  </div>
                )}

                {success && (
                  <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#86efac', fontSize: 13 }}>
                    Feedback submitted successfully. Thank you!
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                padding: '0 24px', height: 68, flexShrink: 0,
                borderTop: '1px solid rgba(255,255,255,0.07)',
                alignItems: 'center',
              }}
            >
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
        </div>,
        document.body,
      )}
    </>
  )
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
