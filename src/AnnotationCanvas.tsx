import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import * as fabric from 'fabric'
import { NoteBubbleClass } from './NoteBubble'
import {
  MousePointer2,
  Type,
  Square,
  Circle,
  MoveUpRight,
  MessageSquare,
  ImagePlus,
  Undo2,
  Redo2,
  Trash2,
  X,
} from 'lucide-react'

export type DrawTool = 'select' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'note'

export interface NoteComment {
  text: string
  metadata?: { note_color?: string }
}

export interface AnnotationCanvasHandle {
  getAnnotatedImage(): string | null
  getNoteComments(): NoteComment[]
}

interface Props {
  screenshot: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function lockMidHandles(obj: fabric.FabricObject) {
  obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false })
}

// ── NoteBubble ────────────────────────────────────────────────────────────────

// ── toolbar definitions ───────────────────────────────────────────────────────

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48]

const TOOLS: {
  id: DrawTool
  label: string
  Icon: React.ComponentType<{ size?: number | string }>
}[] = [
  { id: 'select', label: 'Select (V)', Icon: MousePointer2 },

  { id: 'text', label: 'Text (T)', Icon: Type },
  { id: 'rect', label: 'Rectangle (R)', Icon: Square },
  { id: 'ellipse', label: 'Ellipse (E)', Icon: Circle },
  { id: 'arrow', label: 'Arrow (A)', Icon: MoveUpRight },
  { id: 'note', label: 'Note (N)', Icon: MessageSquare },
]

// ── makeArrow ─────────────────────────────────────────────────────────────────

function makeArrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
): fabric.Path {
  const dx = x2 - x1,
    dy = y2 - y1
  const len = Math.max(Math.hypot(dx, dy), 1)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const hw = len / 2
  const TH = 14,
    TW = 8
  // Drawn along X-axis centered at origin, rotated/translated by fabric
  const d = `M ${-hw} 0 L ${hw - TH} 0 M ${hw - TH} ${-TW / 2} L ${hw} 0 L ${hw - TH} ${TW / 2} Z`
  const path = new fabric.Path(d, {
    left: (x1 + x2) / 2,
    top: (y1 + y2) / 2,
    originX: 'center',
    originY: 'center',
    angle,
    stroke,
    strokeWidth: 2,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    strokeUniform: true,
    fill: stroke,
    padding: 10,
  })
  lockMidHandles(path)
  return path
}

// ── component ─────────────────────────────────────────────────────────────────

export const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(
  ({ screenshot }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<fabric.Canvas | null>(null)
    const screenshotRef = useRef<fabric.FabricImage | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [tool, setTool] = useState<DrawTool>('select')
    const [color, setColor] = useState('#ef4444')
    const [noteBgColor, setNoteBgColor] = useState('#fde68a')
    const [noteTextColor, setNoteTextColor] = useState('#1a1a1a')
    const [noteBold, setNoteBold] = useState(false)
    const [noteItalic, setNoteItalic] = useState(false)
    const [noteFontSize, setNoteFontSize] = useState(13)
    const [canUndo, setCanUndo] = useState(false)
    const [canRedo, setCanRedo] = useState(false)
    const [selectedIsNote, setSelectedIsNote] = useState(false)
    const [selectedObjType, setSelectedObjType] = useState<string | null>(null)
    const [selectedFill, setSelectedFill] = useState<string | null>(null)
    const [selectedStroke, setSelectedStroke] = useState<string | null>(null)
    const [selectedFontSize, setSelectedFontSize] = useState<number | null>(
      null,
    )

    // note text editing overlay
    const [editingNote, setEditingNote] = useState<{
      obj: InstanceType<typeof NoteBubbleClass>
      left: number
      top: number
      width: number
      height: number
      fontSize: number
    } | null>(null)

    const toolRef = useRef<DrawTool>('select')
    const colorRef = useRef('#ef4444')
    const noteBgRef = useRef('#fde68a')
    const noteTextRef = useRef('#1a1a1a')
    const noteBoldRef = useRef(false)
    const noteItalicRef = useRef(false)
    const noteFontSizeRef = useRef(13)
    const isDrawing = useRef(false)

    const startPt = useRef({ x: 0, y: 0 })

    const activeObj = useRef<fabric.FabricObject | null>(null)

    // history
    const historyRef = useRef<string[]>(['[]'])
    const historyIndexRef = useRef(0)
    const pauseHistory = useRef(false)
    const loadAbortRef = useRef<AbortController | null>(null)
    const historyAbortRef = useRef<AbortController | null>(null)
    const readersRef = useRef(new Set<FileReader>())
    const [imageError, setImageError] = useState<string | null>(null)

    useEffect(() => {
      toolRef.current = tool
    }, [tool])
    useEffect(() => {
      colorRef.current = color
    }, [color])
    useEffect(() => {
      noteBgRef.current = noteBgColor
    }, [noteBgColor])
    useEffect(() => {
      noteTextRef.current = noteTextColor
    }, [noteTextColor])
    useEffect(() => {
      noteBoldRef.current = noteBold
    }, [noteBold])
    useEffect(() => {
      noteItalicRef.current = noteItalic
    }, [noteItalic])
    useEffect(() => {
      noteFontSizeRef.current = noteFontSize
    }, [noteFontSize])

    // ── history helpers ──────────────────────────────────────────────────────

    const saveSnapshot = (canvas: fabric.Canvas) => {
      if (pauseHistory.current || isDrawing.current) return
      const objs = canvas
        .getObjects()
        .filter((o) => o !== screenshotRef.current)
        .map((o) => o.toObject())
      const json = JSON.stringify(objs)
      const idx = historyIndexRef.current
      if (historyRef.current[idx] === json) return
      historyRef.current = historyRef.current.slice(0, idx + 1)
      historyRef.current.push(json)
      historyIndexRef.current = historyRef.current.length - 1
      setCanUndo(historyIndexRef.current > 0)
      setCanRedo(false)
    }

    const restoreHistory = async (nextIndex: number) => {
      const canvas = fabricRef.current
      if (
        !canvas ||
        pauseHistory.current ||
        nextIndex < 0 ||
        nextIndex >= historyRef.current.length
      )
        return
      const controller = new AbortController()
      historyAbortRef.current = controller
      pauseHistory.current = true
      let restored: fabric.FabricObject[] = []
      try {
        restored = await fabric.util.enlivenObjects<fabric.FabricObject>(
          JSON.parse(historyRef.current[nextIndex]),
          { signal: controller.signal },
        )
        if (controller.signal.aborted || canvas !== fabricRef.current) {
          restored.forEach((object) => object.dispose())
          return
        }
        canvas
          .getObjects()
          .filter((object) => object !== screenshotRef.current)
          .forEach((object) => {
            canvas.remove(object)
            object.dispose()
          })
        canvas.add(...restored)
        if (screenshotRef.current)
          canvas.sendObjectToBack(screenshotRef.current)
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        historyIndexRef.current = nextIndex
        setCanUndo(nextIndex > 0)
        setCanRedo(nextIndex < historyRef.current.length - 1)
        setEditingNote(null)
      } catch {
        if (!controller.signal.aborted && canvas === fabricRef.current) {
          setImageError(
            'Could not restore annotations. Your current annotations have been kept.',
          )
        }
      } finally {
        if (historyAbortRef.current === controller) {
          historyAbortRef.current = null
          pauseHistory.current = false
        }
      }
    }

    const undo = () => {
      void restoreHistory(historyIndexRef.current - 1)
    }
    const redo = () => {
      void restoreHistory(historyIndexRef.current + 1)
    }

    // ── note property update helper ─────────────────────────────────────────

    const applyNoteStyle = (props: Record<string, unknown>) => {
      const canvas = fabricRef.current
      const obj = canvas?.getActiveObject() as any
      if (!canvas || !(obj instanceof NoteBubbleClass)) return
      Object.assign(obj, props)
      if (
        'noteFontWeight' in props ||
        'noteFontStyle' in props ||
        'noteFontSize' in props
      ) {
        obj._recalcSize()
      }
      obj.dirty = true
      canvas.renderAll()
      saveSnapshot(canvas)
    }

    // ── note text editing overlay ────────────────────────────────────────────

    const openNoteEdit = (
      nb: InstanceType<typeof NoteBubbleClass>,
      canvas: fabric.Canvas,
    ) => {
      const container = containerRef.current
      const canvasEl = canvasElRef.current
      if (!container || !canvasEl) return

      const cRect = container.getBoundingClientRect()
      const elRect = canvasEl.getBoundingClientRect()
      const offsetX = elRect.left - cRect.left
      const offsetY = elRect.top - cRect.top

      nb.isEditing = true
      nb.dirty = true
      ;(nb as any).setCoords()
      canvas.renderAll()

      const zoom = canvas.getZoom()
      // The annotation canvas has an identity viewport during editing. The tail
      // renders outside the uncached body, so it does not inflate these bounds.
      const br = nb.getBoundingRect()
      const effectiveFontSize =
        ((nb as any).noteFontSize || 13) * ((nb as any).scaleX || 1) * zoom

      setEditingNote({
        obj: nb,
        left: offsetX + br.left,
        top: offsetY + br.top,
        width: br.width,
        height: br.height,
        fontSize: effectiveFontSize,
      })
    }

    useImperativeHandle(ref, () => ({
      getAnnotatedImage: () => {
        const canvas = fabricRef.current
        if (!canvas) return screenshot
        const vpt = canvas.viewportTransform!
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
        try {
          return canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 })
        } finally {
          canvas.setViewportTransform(vpt)
        }
      },
      getNoteComments: () => {
        const canvas = fabricRef.current
        if (!canvas) return []
        return canvas
          .getObjects()
          .filter((o) => o instanceof NoteBubbleClass)
          .map((o) => ({
            text: (o as any).noteText as string,
            metadata: { note_color: (o as any).noteBgColor as string },
          }))
          .filter((c) => c.text && c.text !== 'Add note...')
      },
    }))

    // ── main canvas setup ────────────────────────────────────────────────────

    useEffect(() => {
      if (!canvasElRef.current || !containerRef.current) return

      const loadController = new AbortController()
      loadAbortRef.current = loadController
      pauseHistory.current = false
      isDrawing.current = false
      activeObj.current = null
      screenshotRef.current = null
      setEditingNote(null)
      setImageError(null)
      const container = containerRef.current
      const cw = container.clientWidth
      const ch = Math.round((cw * 9) / 16)

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: cw,
        height: ch,
        selection: true,
        backgroundColor: '#1a243e',
        preserveObjectStacking: true,
        uniformScaling: false, // free resize by default, shift to lock aspect ratio
      })
      fabricRef.current = canvas
      historyRef.current = ['[]']
      historyIndexRef.current = 0
      setCanUndo(false)
      setCanRedo(false)

      // load screenshot as image object — added on top of grid
      if (screenshot) {
        void fabric.FabricImage.fromURL(
          screenshot,
          { signal: loadController.signal },
          {
            originX: 'left',
            originY: 'top',
          },
        )
          .then((fbImg) => {
            if (loadController.signal.aborted || fabricRef.current !== canvas) {
              fbImg.dispose()
              return
            }

            const imgAspect = (fbImg.width ?? cw) / (fbImg.height ?? ch)
            const canvasAspect = cw / ch
            if (imgAspect > canvasAspect) fbImg.scaleToWidth(cw)
            else fbImg.scaleToHeight(ch)

            fbImg.set({
              left: (cw - fbImg.getScaledWidth()) / 2,
              top: (ch - fbImg.getScaledHeight()) / 2,
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: true,
              lockScalingFlip: true,
            })
            lockMidHandles(fbImg)

            screenshotRef.current = fbImg
            canvas.add(fbImg)
            canvas.sendObjectToBack(fbImg)
            canvas.renderAll()
          })
          .catch(() => {
            if (!loadController.signal.aborted)
              setImageError(
                'Could not load the screenshot. You can still add annotations.',
              )
          })
      }

      canvas.on('object:added', () => saveSnapshot(canvas))
      canvas.on('object:removed', () => saveSnapshot(canvas))
      canvas.on('text:editing:exited', () => saveSnapshot(canvas))
      canvas.on('object:modified', (e) => {
        const obj = e.target as any

        // absorb scale into dimensions/fontSize — avoids distorting text/bubbles
        if (
          obj instanceof NoteBubbleClass &&
          (obj.scaleX !== 1 || obj.scaleY !== 1)
        ) {
          const sx = obj.scaleX!,
            sy = obj.scaleY!
          obj.set({
            width: Math.max(
              80,
              Math.min(600, Math.round((obj.width || 180) * sx)),
            ),
            scaleX: 1,
            scaleY: 1,
          })
          if (sy !== 1)
            obj.noteFontSize = Math.max(
              8,
              Math.min(72, Math.round((obj.noteFontSize || 13) * sy)),
            )
          obj._recalcSize(true)
        }
        if (obj?.type === 'i-text' && (obj.scaleX !== 1 || obj.scaleY !== 1)) {
          const avgScale = (Math.abs(obj.scaleX!) + Math.abs(obj.scaleY!)) / 2
          obj.set({
            fontSize: Math.max(
              8,
              Math.min(72, Math.round((obj.fontSize || 18) * avgScale)),
            ),
            scaleX: 1,
            scaleY: 1,
          })
        }

        // re-sync toolbar
        if (obj instanceof NoteBubbleClass) {
          const active = canvas.getActiveObject() as any
          if (active instanceof NoteBubbleClass)
            setSelectedFontSize(obj.noteFontSize)
        }
        if (obj?.type === 'i-text') {
          const active = canvas.getActiveObject() as any
          if (active?.type === 'i-text') setSelectedFontSize(obj.fontSize)
        }

        saveSnapshot(canvas)
      })

      // track selection for UI state
      const clearSelState = () => {
        setSelectedIsNote(false)
        setSelectedObjType(null)
        setSelectedFill(null)
        setSelectedStroke(null)
        setSelectedFontSize(null)
      }
      const onSel = () => {
        const obj = canvas.getActiveObject() as any
        if (!obj) {
          clearSelState()
          return
        }
        const isNote = obj instanceof NoteBubbleClass
        setSelectedIsNote(isNote)
        if (isNote) {
          setSelectedObjType(null)
          setSelectedFill(null)
          setSelectedStroke(null)
          const bold = obj.noteFontWeight === 'bold'
          const italic = obj.noteFontStyle === 'italic'
          setNoteBold(bold)
          noteBoldRef.current = bold
          setNoteItalic(italic)
          noteItalicRef.current = italic
          setNoteBgColor(obj.noteBgColor || '#fde68a')
          setNoteTextColor(obj.noteTextColor || '#1a1a1a')
          setNoteFontSize(obj.noteFontSize ?? 13)
          setSelectedFontSize(obj.noteFontSize ?? 13)
        } else if (obj.type !== 'image') {
          setSelectedObjType(obj.type)
          const rawFill = obj.fill
          setSelectedFill(
            rawFill &&
              rawFill !== 'transparent' &&
              rawFill !== 'rgba(0,0,0,0.01)'
              ? rawFill
              : null,
          )
          setSelectedStroke(obj.stroke || null)
          if (obj.type === 'i-text') setSelectedFontSize(obj.fontSize ?? 18)
          else setSelectedFontSize(null)
        } else {
          setSelectedObjType(null)
          setSelectedFill(null)
          setSelectedStroke(null)
          setSelectedFontSize(null)
        }
      }
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', clearSelState)

      // double-click to edit note
      canvas.on('mouse:dblclick', (e) => {
        const target = e.target as any
        if (target instanceof NoteBubbleClass) {
          canvas.discardActiveObject()
          openNoteEdit(target, canvas)
        } else if (target?.type === 'i-text') {
          // fabric handles IText editing natively
        }
      })

      // keyboard: delete + undo/redo
      const onKey = (ev: KeyboardEvent) => {
        const tag = (ev.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return

        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          const active = canvas.getActiveObjects()
          if (active.length) {
            active.forEach((o) => {
              if (o !== screenshotRef.current) canvas.remove(o)
            })
            canvas.discardActiveObject()
            canvas.renderAll()
          }
          return
        }

        const ctrl = ev.ctrlKey || ev.metaKey
        if (ctrl && ev.key === 'z' && !ev.shiftKey) {
          ev.preventDefault()
          undo()
        }
        if (ctrl && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) {
          ev.preventDefault()
          redo()
        }

        // tool shortcuts
        if (!ctrl) {
          const map: Record<string, DrawTool> = {
            v: 'select',
            t: 'text',
            r: 'rect',
            e: 'ellipse',
            a: 'arrow',
            n: 'note',
          }
          if (map[ev.key.toLowerCase()]) setTool(map[ev.key.toLowerCase()])
        }
      }
      window.addEventListener('keydown', onKey)

      // draw interactions
      canvas.on('mouse:down', (e) => {
        const t = toolRef.current
        if (t === 'select') return

        const p = canvas.getScenePoint(e.e)
        isDrawing.current = true
        startPt.current = { x: p.x, y: p.y }

        if (t === 'text') {
          const txt = new fabric.IText('', {
            left: p.x,
            top: p.y,
            originX: 'left',
            originY: 'top',
            fontSize: 18,
            fill: colorRef.current,
            fontFamily: 'sans-serif',
          })
          lockMidHandles(txt)
          canvas.add(txt)
          isDrawing.current = false
          saveSnapshot(canvas)
          setTool('select')
          toolRef.current = 'select'
          canvas.selection = true
          canvas.defaultCursor = 'default'
          canvas
            .getObjects()
            .forEach((o) => o.set({ selectable: true, evented: true }))
          canvas.setActiveObject(txt)
          txt.enterEditing()
          canvas.renderAll()
          return
        }

        if (t === 'note') {
          const nb = new NoteBubbleClass({
            left: p.x,
            top: p.y,
            noteText: 'Add note...',
            noteBgColor: noteBgRef.current,
            noteTextColor: noteTextRef.current,
            noteFontWeight: noteBoldRef.current ? 'bold' : 'normal',
            noteFontStyle: noteItalicRef.current ? 'italic' : 'normal',
            noteFontSize: noteFontSizeRef.current,
            tailX: 0,
            tailY: 70,
          })
          canvas.add(nb)
          isDrawing.current = false
          saveSnapshot(canvas)
          setTool('select')
          toolRef.current = 'select'
          canvas.selection = true
          canvas.defaultCursor = 'default'
          canvas
            .getObjects()
            .forEach((o) => o.set({ selectable: true, evented: true }))
          canvas.setActiveObject(nb)
          canvas.renderAll()
          setTimeout(() => {
            if (
              !loadController.signal.aborted &&
              fabricRef.current === canvas &&
              canvas.contains(nb)
            )
              openNoteEdit(nb, canvas)
          }, 30)
          return
        }

        const sx = p.x,
          sy = p.y
        const stroke = colorRef.current
        let shape: fabric.FabricObject | null = null

        if (t === 'rect') {
          // fill: near-transparent so interior is hittable
          shape = new fabric.Rect({
            originX: 'left',
            originY: 'top',
            left: sx,
            top: sy,
            width: 1,
            height: 1,
            fill: 'rgba(0,0,0,0.01)',
            stroke,
            strokeWidth: 2,
          })
        } else if (t === 'ellipse') {
          shape = new fabric.Ellipse({
            originX: 'left',
            originY: 'top',
            left: sx,
            top: sy,
            rx: 1,
            ry: 1,
            fill: 'rgba(0,0,0,0.01)',
            stroke,
            strokeWidth: 2,
          })
        } else if (t === 'arrow') {
          shape = new fabric.Line([sx, sy, sx, sy], {
            originX: 'left',
            originY: 'top',
            stroke,
            strokeWidth: 2,
            opacity: 0.6,
          })
        }

        if (shape) {
          canvas.add(shape)
          activeObj.current = shape
        }
      })

      canvas.on('mouse:move', (e) => {
        if (!isDrawing.current || !activeObj.current) return
        const p = canvas.getScenePoint(e.e)
        const s = startPt.current
        const obj = activeObj.current
        if (obj.type === 'rect') {
          ;(obj as fabric.Rect).set({
            left: Math.min(s.x, p.x),
            top: Math.min(s.y, p.y),
            width: Math.abs(p.x - s.x),
            height: Math.abs(p.y - s.y),
          })
        } else if (obj.type === 'ellipse') {
          ;(obj as fabric.Ellipse).set({
            left: Math.min(s.x, p.x),
            top: Math.min(s.y, p.y),
            rx: Math.abs(p.x - s.x) / 2,
            ry: Math.abs(p.y - s.y) / 2,
          })
        } else if (obj.type === 'line') {
          ;(obj as fabric.Line).set({ x2: p.x, y2: p.y })
        }
        canvas.renderAll()
      })

      canvas.on('mouse:up', (e) => {
        if (!isDrawing.current) return
        // Keep intermediate drag/arrow replacement events out of history.
        let placed: fabric.FabricObject | null = activeObj.current

        if (toolRef.current === 'arrow' && activeObj.current?.type === 'line') {
          const line = activeObj.current as fabric.Line
          const p = canvas.getScenePoint(e.e)
          canvas.remove(line)
          const arrow = makeArrow(
            startPt.current.x,
            startPt.current.y,
            p.x,
            p.y,
            colorRef.current,
          )
          canvas.add(arrow)
          placed = arrow
        }

        activeObj.current = null
        setTool('select')
        toolRef.current = 'select'

        // re-enable select mode immediately (don't wait for tool effect)
        canvas.selection = true
        canvas.defaultCursor = 'default'
        canvas
          .getObjects()
          .forEach((o) => o.set({ selectable: true, evented: true }))

        if (placed) {
          placed.setCoords()
          canvas.setActiveObject(placed)
        }
        isDrawing.current = false
        saveSnapshot(canvas)
        canvas.renderAll()
      })

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        // Defensive: skip near-zero widths and changes < 1px to prevent
        // micro-resize loops with flex parents that lack `min-width: 0`.
        const width = Math.max(0, Math.floor(entry.contentRect.width))
        if (width < 50) return
        const currentWidth = canvas.getWidth()
        if (Math.abs(width - currentWidth) < 1) return
        const height = Math.round((width * 9) / 16)
        canvas.setDimensions({ width, height })
        canvas.renderAll()
      })
      resizeObserver.observe(container)

      return () => {
        loadController.abort()
        historyAbortRef.current?.abort()
        historyAbortRef.current = null
        readersRef.current.forEach((reader) => reader.abort())
        readersRef.current.clear()
        window.removeEventListener('keydown', onKey)
        resizeObserver.disconnect()
        if (fabricRef.current === canvas) fabricRef.current = null
        canvas.cancelRequestedRender()
        void canvas.dispose().catch(() => {
          /* already disposed during teardown */
        })
      }
    }, [screenshot]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── tool mode effect ─────────────────────────────────────────────────────

    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      if (tool === 'select') {
        canvas.selection = true
        canvas.defaultCursor = 'default'
        canvas
          .getObjects()
          .forEach((o) => o.set({ selectable: true, evented: true }))
      } else {
        canvas.selection = false
        canvas.discardActiveObject()
        canvas.defaultCursor = tool === 'text' ? 'text' : 'crosshair'
        canvas
          .getObjects()
          .forEach((o) => o.set({ selectable: false, evented: false }))
      }
      canvas.renderAll()
    }, [tool])

    // ── fill / stroke apply to selection ────────────────────────────────────

    const applyFill = (fill: string | null) => {
      const canvas = fabricRef.current
      const obj = canvas?.getActiveObject() as any
      if (!canvas || !obj || obj instanceof NoteBubbleClass) return
      obj.set({ fill: fill ?? 'rgba(0,0,0,0.01)' })
      obj.dirty = true
      canvas.renderAll()
      saveSnapshot(canvas)
    }

    const applyStroke = (stroke: string) => {
      const canvas = fabricRef.current
      const obj = canvas?.getActiveObject() as any
      if (!canvas || !obj || obj instanceof NoteBubbleClass) return
      obj.set({ stroke })
      if (obj.type === 'path') obj.set({ fill: stroke }) // arrowhead fill tracks stroke
      obj.dirty = true
      canvas.renderAll()
      saveSnapshot(canvas)
    }

    const applyFontSize = (size: number) => {
      const canvas = fabricRef.current
      const obj = canvas?.getActiveObject() as any
      if (!canvas || !obj) return
      if (obj.type === 'i-text') {
        obj.set({ fontSize: size })
        obj.dirty = true
        setSelectedFontSize(size)
      } else if (obj instanceof NoteBubbleClass) {
        obj.noteFontSize = size
        obj._recalcSize()
        setSelectedFontSize(size)
      }
      canvas.renderAll()
      saveSnapshot(canvas)
    }

    // ── clear / reset ─────────────────────────────────────────────────────────

    const clear = () => {
      const canvas = fabricRef.current
      if (!canvas) return
      canvas.getObjects().forEach((o) => {
        if (o !== screenshotRef.current) canvas.remove(o)
      })
      canvas.renderAll()
    }

    const deleteSelected = () => {
      const canvas = fabricRef.current
      if (!canvas) return
      const active = canvas.getActiveObjects()
      active.forEach((o) => {
        if (o !== screenshotRef.current) canvas.remove(o)
      })
      canvas.discardActiveObject()
      canvas.renderAll()
    }

    // ── styles ────────────────────────────────────────────────────────────────

    const btn = (active = false): React.CSSProperties => ({
      width: 32,
      height: 32,
      border: `1px solid ${active ? '#4540E8' : 'rgba(255,255,255,0.12)'}`,
      borderRadius: 6,
      background: active ? 'rgba(69,64,232,0.2)' : 'rgba(255,255,255,0.04)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    })

    const addImageFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      const canvas = fabricRef.current
      const signal = loadAbortRef.current?.signal
      if (!file || !canvas || !signal || signal.aborted) return
      setImageError(null)
      const reader = new FileReader()
      readersRef.current.add(reader)
      reader.onloadend = () => readersRef.current.delete(reader)
      reader.onerror = () => {
        if (!signal.aborted) setImageError('Could not read the selected image.')
      }
      reader.onload = () => {
        if (signal.aborted || typeof reader.result !== 'string') return
        void fabric.FabricImage.fromURL(reader.result, { signal })
          .then((img) => {
            if (signal.aborted || canvas !== fabricRef.current) {
              img.dispose()
              return
            }
            const maxW = canvas.getWidth() * 0.6
            const maxH = canvas.getHeight() * 0.6
            if (img.width > maxW) img.scaleToWidth(maxW)
            if (img.getScaledHeight() > maxH) img.scaleToHeight(maxH)
            img.set({
              left: canvas.getWidth() / 2,
              top: canvas.getHeight() / 2,
              originX: 'center',
              originY: 'center',
            })
            lockMidHandles(img)
            canvas.add(img)
            setTool('select')
            toolRef.current = 'select'
            canvas.selection = true
            canvas.defaultCursor = 'default'
            canvas
              .getObjects()
              .forEach((o) => o.set({ selectable: true, evented: true }))
            canvas.setActiveObject(img)
            canvas.renderAll()
          })
          .catch(() => {
            if (!signal.aborted)
              setImageError(
                'Could not load the selected image. Try another image.',
              )
          })
      }
      reader.readAsDataURL(file)
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 8,
        }}
      >
        {imageError && (
          <div role="status" style={{ color: '#fca5a5', fontSize: 12 }}>
            {imageError}
          </div>
        )}
        {/* toolbar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          {/* draw tools */}
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              style={btn(tool === t.id)}
            >
              <t.Icon size={14} />
            </button>
          ))}

          <div
            style={{
              width: 1,
              height: 24,
              background: 'rgba(255,255,255,0.1)',
              margin: '0 2px',
            }}
          />

          {/* image upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={addImageFromFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Add image"
            style={btn()}
          >
            <ImagePlus size={14} />
          </button>

          {/* drawing color — when no object selected and not note tool */}
          {!(tool === 'note' || selectedIsNote) && !selectedObjType && (
            <>
              <div
                style={{
                  width: 1,
                  height: 24,
                  background: 'rgba(255,255,255,0.1)',
                  margin: '0 2px',
                }}
              />
              <label
                title="Drawing color"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                <span>Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value)
                    colorRef.current = e.target.value
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 1,
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
              </label>
            </>
          )}

          {/* fill + stroke — when a non-note shape is selected */}
          {selectedObjType && !selectedIsNote && (
            <>
              <div
                style={{
                  width: 1,
                  height: 24,
                  background: 'rgba(255,255,255,0.1)',
                  margin: '0 2px',
                }}
              />

              {/* fill — rect, ellipse */}
              {(selectedObjType === 'rect' ||
                selectedObjType === 'ellipse') && (
                <label
                  title="Fill color"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <span>Fill</span>
                  {selectedFill !== null ? (
                    <>
                      <input
                        type="color"
                        value={selectedFill}
                        onChange={(e) => {
                          setSelectedFill(e.target.value)
                          applyFill(e.target.value)
                        }}
                        style={{
                          width: 22,
                          height: 22,
                          padding: 1,
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 4,
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      />
                      <button
                        title="Remove fill"
                        onClick={() => {
                          setSelectedFill(null)
                          applyFill(null)
                        }}
                        style={{
                          ...btn(),
                          fontSize: 11,
                          padding: '0 5px',
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <button
                      title="Add fill"
                      onClick={() => {
                        setSelectedFill(colorRef.current)
                        applyFill(colorRef.current)
                      }}
                      style={{
                        ...btn(),
                        fontSize: 11,
                        padding: '0 5px',
                        lineHeight: 1,
                      }}
                    >
                      +
                    </button>
                  )}
                </label>
              )}

              {/* text color */}
              {selectedObjType === 'i-text' && (
                <label
                  title="Text color"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <span>Color</span>
                  <input
                    type="color"
                    value={selectedFill ?? '#ffffff'}
                    onChange={(e) => {
                      setSelectedFill(e.target.value)
                      applyFill(e.target.value)
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      padding: 1,
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 4,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              )}

              {/* text font size */}
              {selectedObjType === 'i-text' && selectedFontSize !== null && (
                <select
                  title="Font size"
                  value={selectedFontSize}
                  onChange={(e) => applyFontSize(Number(e.target.value))}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    color: 'white',
                    fontSize: 12,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    height: 26,
                  }}
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s} style={{ background: '#1A243E' }}>
                      {s}px
                    </option>
                  ))}
                </select>
              )}

              {/* stroke — rect, ellipse, arrow (path), line */}
              {(selectedObjType === 'rect' ||
                selectedObjType === 'ellipse' ||
                selectedObjType === 'path' ||
                selectedObjType === 'line') && (
                <label
                  title="Stroke color"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <span>Stroke</span>
                  <input
                    type="color"
                    value={selectedStroke ?? '#ef4444'}
                    onChange={(e) => {
                      setSelectedStroke(e.target.value)
                      applyStroke(e.target.value)
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      padding: 1,
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 4,
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                </label>
              )}
            </>
          )}

          {/* note controls — visible when note tool active or note selected */}
          {(tool === 'note' || selectedIsNote) && (
            <>
              <div
                style={{
                  width: 1,
                  height: 24,
                  background: 'rgba(255,255,255,0.1)',
                  margin: '0 2px',
                }}
              />

              {/* bold */}
              <button
                title="Bold"
                onClick={() => {
                  const next = !noteBold
                  setNoteBold(next)
                  noteBoldRef.current = next
                  applyNoteStyle({ noteFontWeight: next ? 'bold' : 'normal' })
                }}
                style={{
                  ...btn(noteBold),
                  fontWeight: 'bold',
                  fontSize: 13,
                  fontFamily: 'serif',
                }}
              >
                B
              </button>

              {/* italic */}
              <button
                title="Italic"
                onClick={() => {
                  const next = !noteItalic
                  setNoteItalic(next)
                  noteItalicRef.current = next
                  applyNoteStyle({ noteFontStyle: next ? 'italic' : 'normal' })
                }}
                style={{
                  ...btn(noteItalic),
                  fontStyle: 'italic',
                  fontSize: 13,
                  fontFamily: 'serif',
                }}
              >
                I
              </button>

              {/* note font size */}
              {(tool === 'note' || selectedIsNote) && (
                <select
                  title="Font size"
                  value={selectedIsNote ? selectedFontSize! : noteFontSize}
                  onChange={(e) => {
                    const size = Number(e.target.value)
                    if (selectedIsNote) applyFontSize(size)
                    else {
                      setNoteFontSize(size)
                      noteFontSizeRef.current = size
                    }
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                    color: 'white',
                    fontSize: 12,
                    padding: '2px 4px',
                    cursor: 'pointer',
                    height: 26,
                  }}
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s} style={{ background: '#1A243E' }}>
                      {s}px
                    </option>
                  ))}
                </select>
              )}

              <div
                style={{
                  width: 1,
                  height: 24,
                  background: 'rgba(255,255,255,0.1)',
                  margin: '0 2px',
                }}
              />

              <label
                title="Note background color"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                <span>Bg</span>
                <input
                  type="color"
                  value={noteBgColor}
                  onChange={(e) => {
                    setNoteBgColor(e.target.value)
                    applyNoteStyle({ noteBgColor: e.target.value })
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 1,
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
              </label>

              <label
                title="Note text color"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                <span>Text</span>
                <input
                  type="color"
                  value={noteTextColor}
                  onChange={(e) => {
                    setNoteTextColor(e.target.value)
                    applyNoteStyle({ noteTextColor: e.target.value })
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 1,
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
              </label>
            </>
          )}

          {/* right-side actions */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              style={btn()}
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              style={btn()}
            >
              <Redo2 size={14} />
            </button>
            <button
              onClick={deleteSelected}
              title="Delete selected (Del)"
              style={btn()}
            >
              <X size={14} />
            </button>
            <button
              onClick={clear}
              title="Clear all"
              style={{ ...btn(), borderColor: 'rgba(239,68,68,0.4)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* canvas container */}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            aspectRatio: '16/9',
            flexShrink: 0,
            overflow: 'hidden',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            position: 'relative',
            marginTop: 10,
          }}
        >
          <canvas ref={canvasElRef} />

          {/* note text editing overlay */}
          {editingNote && (
            <textarea
              autoFocus
              defaultValue={
                editingNote.obj.noteText === 'Add note...'
                  ? ''
                  : (editingNote.obj.noteText as string)
              }
              placeholder="Add note..."
              onBlur={(e) => {
                const canvas = fabricRef.current
                if (canvas) {
                  editingNote.obj.noteText = e.target.value || 'Add note...'
                  editingNote.obj.isEditing = false
                  editingNote.obj._recalcSize()
                  canvas.renderAll()
                  saveSnapshot(canvas)
                }
                setEditingNote(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  editingNote.obj.isEditing = false
                  editingNote.obj.dirty = true
                  fabricRef.current?.renderAll()
                  setEditingNote(null)
                }
              }}
              style={{
                position: 'absolute',
                left: editingNote.left,
                top: editingNote.top,
                width: editingNote.width,
                height: editingNote.height,
                boxSizing: 'border-box',
                background: 'transparent',
                border: '2px solid #4540E8',
                borderRadius: 10,
                outline: 'none',
                color: (editingNote.obj.noteTextColor as string) || '#1a1a1a',
                fontSize: `${editingNote.fontSize}px`,
                fontWeight:
                  (editingNote.obj.noteFontWeight as string) || 'normal',
                fontStyle:
                  (editingNote.obj.noteFontStyle as string) || 'normal',
                fontFamily: 'sans-serif',
                padding: '8px 10px',
                resize: 'none',
                overflow: 'hidden',
                zIndex: 10,
              }}
            />
          )}
        </div>
      </div>
    )
  },
)

AnnotationCanvas.displayName = 'AnnotationCanvas'
