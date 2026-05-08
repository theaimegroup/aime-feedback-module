import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { fabric } from 'fabric'
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (!text) return []
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ')
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur)
        cur = w
      } else {
        cur = test
      }
    }
    lines.push(cur)
  }
  return lines
}

function buildBubblePath(W: number, H: number, R: number, tx: number, ty: number): string {
  const hw = W / 2
  const hh = H / 2
  const TW = 12                // half-width of tail base
  const HGAP = TW + R + 3     // min distance of base centre from corner arc on horiz edges
  const VGAP = TW + R + 3     // same for vertical edges
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  // Determine which wall the ray from (0,0)→(tx,ty) exits through first.
  // |ty/tx| vs hh/hw comparison — avoids snapping to corners by using true geometry.
  const ax = Math.abs(tx), ay = Math.abs(ty)
  const exitsTB = ax === 0 || (ay > 0 && ay / ax >= hh / hw)

  let bcx: number, bcy: number
  let edge: 'B' | 'T' | 'R' | 'L'

  if (exitsTB) {
    edge = ty >= 0 ? 'B' : 'T'
    bcy  = ty >= 0 ? hh : -hh
    // natural intersection x = tx * bcy / ty; clamp away from corner arc endpoints
    const ix = ty !== 0 ? tx * bcy / ty : 0
    bcx = cl(ix, -hw + HGAP, hw - HGAP)
  } else {
    edge = tx >= 0 ? 'R' : 'L'
    bcx  = tx >= 0 ? hw : -hw
    const iy = tx !== 0 ? ty * bcx / tx : 0
    bcy = cl(iy, -hh + VGAP, hh - VGAP)
  }

  if (edge === 'B') {
    return `M${-hw+R} ${-hh} L${hw-R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh+R} L${hw} ${hh-R} Q${hw} ${hh} ${hw-R} ${hh} L${bcx+TW} ${hh} L${tx} ${ty} L${bcx-TW} ${hh} L${-hw+R} ${hh} Q${-hw} ${hh} ${-hw} ${hh-R} L${-hw} ${-hh+R} Q${-hw} ${-hh} ${-hw+R} ${-hh} Z`
  }
  if (edge === 'T') {
    return `M${-hw+R} ${-hh} L${bcx-TW} ${-hh} L${tx} ${ty} L${bcx+TW} ${-hh} L${hw-R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh+R} L${hw} ${hh-R} Q${hw} ${hh} ${hw-R} ${hh} L${-hw+R} ${hh} Q${-hw} ${hh} ${-hw} ${hh-R} L${-hw} ${-hh+R} Q${-hw} ${-hh} ${-hw+R} ${-hh} Z`
  }
  if (edge === 'R') {
    return `M${-hw+R} ${-hh} L${hw-R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh+R} L${hw} ${bcy-TW} L${tx} ${ty} L${hw} ${bcy+TW} L${hw} ${hh-R} Q${hw} ${hh} ${hw-R} ${hh} L${-hw+R} ${hh} Q${-hw} ${hh} ${-hw} ${hh-R} L${-hw} ${-hh+R} Q${-hw} ${-hh} ${-hw+R} ${-hh} Z`
  }
  // L
  return `M${-hw+R} ${-hh} L${hw-R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh+R} L${hw} ${hh-R} Q${hw} ${hh} ${hw-R} ${hh} L${-hw+R} ${hh} Q${-hw} ${hh} ${-hw} ${hh-R} L${-hw} ${bcy+TW} L${tx} ${ty} L${-hw} ${bcy-TW} L${-hw} ${-hh+R} Q${-hw} ${-hh} ${-hw+R} ${-hh} Z`
}

function lockMidHandles(obj: fabric.Object) {
  obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false })
}

// ── NoteBubble ────────────────────────────────────────────────────────────────

const NoteBubbleClass = (fabric.util as any).createClass(fabric.Object, {
  type: 'NoteBubble',
  noteText:       'Add note...',
  tailX:          0,
  tailY:          70,
  noteBgColor:    '#fde68a',
  noteTextColor:  '#1a1a1a',
  noteFontSize:   13,
  noteFontWeight: 'normal',
  noteFontStyle:  'normal',
  strokeWidth:    0,

  initialize(options: Record<string, unknown> = {}) {
    this.callSuper('initialize', {
      width:  180,
      height: 80,
      ...options,
    })
    this.noteText       = (options.noteText       as string)  ?? 'Add note...'
    this.tailX          = (options.tailX          as number)  ?? 0
    this.tailY          = (options.tailY          as number)  ?? 70
    this.noteBgColor    = (options.noteBgColor    as string)  ?? '#fde68a'
    this.noteTextColor  = (options.noteTextColor  as string)  ?? '#1a1a1a'
    this.noteFontSize   = (options.noteFontSize   as number)  ?? 13
    this.noteFontWeight = (options.noteFontWeight as string)  ?? 'normal'
    this.noteFontStyle  = (options.noteFontStyle  as string)  ?? 'normal'
    this.objectCaching = false  // tail renders outside width×height bounds
    this._setupControls()
  },

  _setupControls() {
    this.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false })
    const self = this
    this.controls.tail = new fabric.Control({
      x:           0,
      y:           0,
      offsetX:     0,
      offsetY:     0,
      cursorStyle: 'crosshair',
      actionName:  'moveTail',
      render(ctx: CanvasRenderingContext2D, left: number, top: number) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(left, top, 6, 0, Math.PI * 2)
        ctx.fillStyle   = '#4540E8'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth   = 1.5
        ctx.stroke()
        ctx.restore()
      },
      positionHandler(
        _dim: unknown,
        finalMatrix: number[],
        fabricObject: fabric.Object,
      ) {
        const nb = fabricObject as any
        // finalMatrix encodes rotation+translation+viewport but NOT scale.
        // Scale lives in dim, so we pre-multiply tailX/tailY by scaleX/scaleY.
        return fabric.util.transformPoint(
          new fabric.Point(nb.tailX * (nb.scaleX || 1), nb.tailY * (nb.scaleY || 1)),
          finalMatrix,
        )
      },
      actionHandler(
        eventData: MouseEvent,
        transform: { target: fabric.Object },
      ) {
        const nb     = transform.target as any
        const canvas = nb.canvas
        if (!canvas) return false
        const pointer = canvas.getPointer(eventData)
        const matrix  = nb.calcTransformMatrix()
        const inv     = fabric.util.invertTransform(matrix)
        const local   = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), inv)

        // Clamp tail outside the body rect so it can't be dragged inward.
        const hw = ((nb.width  || 180) / 2)
        const hh = ((nb.height ||  80) / 2)
        const MARGIN = 20
        let tx = local.x, ty = local.y
        const ax = Math.abs(tx), ay = Math.abs(ty)
        const exitsTB = ax === 0 || (ay > 0 && ay / ax >= hh / hw)
        if (exitsTB) {
          const minDist = hh + MARGIN
          if (Math.abs(ty) < minDist) ty = ty >= 0 ? minDist : -minDist
        } else {
          const minDist = hw + MARGIN
          if (Math.abs(tx) < minDist) tx = tx >= 0 ? minDist : -minDist
        }
        nb.tailX  = tx
        nb.tailY  = ty
        nb.dirty  = true
        canvas.requestRenderAll()
        return true
      },
      cornerSize: 12,
    } as unknown as fabric.Control)
  },

  _render(ctx: CanvasRenderingContext2D) {
    const W = this.width  as number
    const H = this.height as number
    const fs = this.noteFontSize as number

    const pathStr = buildBubblePath(W, H, 10, this.tailX as number, this.tailY as number)
    const p2d     = new Path2D(pathStr)

    ctx.save()
    ctx.fillStyle = this.noteBgColor as string
    ctx.fill(p2d)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth   = 1
    ctx.stroke(p2d)
    ctx.restore()

    if (!this.isEditing) {
      ctx.save()
      ctx.fillStyle    = this.noteTextColor as string
      ctx.font         = `${this.noteFontStyle} ${this.noteFontWeight} ${fs}px sans-serif`
      ctx.textBaseline = 'top'
      const maxW  = W - 20
      const lines = wrapText(ctx, this.noteText as string, maxW)
      const lineH = fs * 1.4
      const totalH = lines.length * lineH
      const startY = -H / 2 + Math.max(10, (H - totalH) / 2)
      lines.forEach((line, i) => {
        ctx.fillText(line, -W / 2 + 10, startY + i * lineH, maxW)
      })
      ctx.restore()
    }
  },

  toObject(extra: string[] = []) {
    return (fabric.util as any).object.extend(
      this.callSuper('toObject', extra),
      {
        noteText:       this.noteText,
        tailX:          this.tailX,
        tailY:          this.tailY,
        noteBgColor:    this.noteBgColor,
        noteTextColor:  this.noteTextColor,
        noteFontSize:   this.noteFontSize,
        noteFontWeight: this.noteFontWeight,
        noteFontStyle:  this.noteFontStyle,
      },
    )
  },
})

NoteBubbleClass.fromObject = (obj: Record<string, unknown>, cb: (o: unknown) => void) => {
  cb(new NoteBubbleClass(obj))
};
(fabric as any).NoteBubble = NoteBubbleClass

// ── toolbar definitions ───────────────────────────────────────────────────────

const TOOLS: { id: DrawTool; label: string; Icon: React.ComponentType<{ size?: number | string }> }[] = [
  { id: 'select',  label: 'Select (V)',    Icon: MousePointer2 },

  { id: 'text',    label: 'Text (T)',      Icon: Type },
  { id: 'rect',    label: 'Rectangle (R)', Icon: Square },
  { id: 'ellipse', label: 'Ellipse (E)',   Icon: Circle },
  { id: 'arrow',   label: 'Arrow (A)',     Icon: MoveUpRight },
  { id: 'note',    label: 'Note (N)',      Icon: MessageSquare },
]

// ── makeArrow ─────────────────────────────────────────────────────────────────

function makeArrow(x1: number, y1: number, x2: number, y2: number, stroke: string): fabric.Path {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.max(Math.hypot(dx, dy), 1)
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const hw = len / 2
  const TH = 14, TW = 8
  // Drawn along X-axis centered at origin, rotated/translated by fabric
  const d = `M ${-hw} 0 L ${hw - TH} 0 M ${hw - TH} ${-TW / 2} L ${hw} 0 L ${hw - TH} ${TW / 2} Z`
  const path = new fabric.Path(d, {
    left: (x1 + x2) / 2,
    top:  (y1 + y2) / 2,
    originX: 'center', originY: 'center',
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
    const containerRef    = useRef<HTMLDivElement>(null)
    const canvasElRef     = useRef<HTMLCanvasElement>(null)
    const fabricRef       = useRef<fabric.Canvas | null>(null)
    const screenshotRef   = useRef<fabric.Image | null>(null)
    const fileInputRef    = useRef<HTMLInputElement>(null)

    const [tool,          setTool]          = useState<DrawTool>('select')
    const [color,         setColor]         = useState('#ef4444')
    const [noteBgColor,   setNoteBgColor]   = useState('#fde68a')
    const [noteTextColor, setNoteTextColor] = useState('#1a1a1a')
    const [noteBold,      setNoteBold]      = useState(false)
    const [noteItalic,    setNoteItalic]    = useState(false)
    const [canUndo,       setCanUndo]       = useState(false)
    const [canRedo,       setCanRedo]       = useState(false)
    const [selectedIsNote, setSelectedIsNote] = useState(false)

    // note text editing overlay
    const [editingNote, setEditingNote] = useState<{
      obj: InstanceType<typeof NoteBubbleClass>
      left: number; top: number; width: number; height: number; fontSize: number
    } | null>(null)

    const toolRef         = useRef<DrawTool>('select')
    const colorRef        = useRef('#ef4444')
    const noteBgRef       = useRef('#fde68a')
    const noteTextRef     = useRef('#1a1a1a')
    const noteBoldRef     = useRef(false)
    const noteItalicRef   = useRef(false)
    const isDrawing       = useRef(false)

    const startPt         = useRef({ x: 0, y: 0 })

    const activeObj       = useRef<fabric.Object | null>(null)

    // history
    const historyRef      = useRef<string[]>(['[]'])
    const historyIndexRef = useRef(0)
    const pauseHistory    = useRef(false)

    useEffect(() => { toolRef.current       = tool          }, [tool])
    useEffect(() => { colorRef.current      = color         }, [color])
    useEffect(() => { noteBgRef.current     = noteBgColor   }, [noteBgColor])
    useEffect(() => { noteTextRef.current   = noteTextColor }, [noteTextColor])
    useEffect(() => { noteBoldRef.current   = noteBold      }, [noteBold])
    useEffect(() => { noteItalicRef.current = noteItalic    }, [noteItalic])

    // ── history helpers ──────────────────────────────────────────────────────

    const saveSnapshot = (canvas: fabric.Canvas) => {
      if (pauseHistory.current) return
      const objs = canvas.getObjects()
        .filter(o => o !== screenshotRef.current)
        .map(o => (o as any).toObject(
          ['noteText', 'tailX', 'tailY', 'noteBgColor', 'noteTextColor', 'noteFontSize'],
        ))
      const json = JSON.stringify(objs)
      const idx  = historyIndexRef.current
      historyRef.current = historyRef.current.slice(0, idx + 1)
      historyRef.current.push(json)
      historyIndexRef.current = historyRef.current.length - 1
      setCanUndo(historyIndexRef.current > 0)
      setCanRedo(false)
    }

    const applySnapshot = (canvas: fabric.Canvas, json: string) => {
      pauseHistory.current = true
      const parsed: unknown[] = JSON.parse(json)
      canvas.getObjects()
        .filter(o => o !== screenshotRef.current)
        .forEach(o => canvas.remove(o))

      if (parsed.length === 0) {
        if (screenshotRef.current) canvas.sendToBack(screenshotRef.current)
        canvas.discardActiveObject()
        canvas.renderAll()
        pauseHistory.current = false
        return
      }

      const noteBubbles  = parsed.filter((o: any) => o.type === 'NoteBubble')
      const regularObjs  = parsed.filter((o: any) => o.type !== 'NoteBubble')

      const addAll = (extras: fabric.Object[]) => {
        extras.forEach(o => canvas.add(o))
        if (screenshotRef.current) canvas.sendToBack(screenshotRef.current)
        canvas.discardActiveObject()
        canvas.renderAll()
        pauseHistory.current = false
      }

      const noteInstances = noteBubbles.map((o: any) => new NoteBubbleClass(o))

      if (regularObjs.length === 0) {
        addAll(noteInstances)
        return
      }

      fabric.util.enlivenObjects(
        regularObjs,
        (enlivened: fabric.Object[]) => {
          addAll([...enlivened, ...noteInstances])
        },
        'fabric',
      )
    }

    const undo = () => {
      const canvas = fabricRef.current
      if (!canvas || historyIndexRef.current <= 0) return
      historyIndexRef.current--
      applySnapshot(canvas, historyRef.current[historyIndexRef.current])
      setCanUndo(historyIndexRef.current > 0)
      setCanRedo(true)
    }

    const redo = () => {
      const canvas = fabricRef.current
      if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return
      historyIndexRef.current++
      applySnapshot(canvas, historyRef.current[historyIndexRef.current])
      setCanUndo(true)
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
    }

    // ── note property update helper ─────────────────────────────────────────

    const applyNoteStyle = (props: Record<string, unknown>) => {
      const canvas = fabricRef.current
      const obj    = canvas?.getActiveObject() as any
      if (!canvas || obj?.type !== 'NoteBubble') return
      Object.assign(obj, props)
      obj.dirty = true
      canvas.renderAll()
      saveSnapshot(canvas)
    }

    // ── note text editing overlay ────────────────────────────────────────────

    const openNoteEdit = (nb: InstanceType<typeof NoteBubbleClass>, canvas: fabric.Canvas) => {
      const container  = containerRef.current
      const canvasEl   = canvasElRef.current
      if (!container || !canvasEl) return

      const cRect   = container.getBoundingClientRect()
      const elRect  = canvasEl.getBoundingClientRect()
      const offsetX = elRect.left - cRect.left
      const offsetY = elRect.top  - cRect.top

      nb.isEditing = true
      nb.dirty     = true
      ;(nb as any).setCoords()
      canvas.renderAll()

      const zoom  = canvas.getZoom()
      // getBoundingRect with useCache=false, absolute=true gives viewport-space coords.
      // The tail renders outside width×height (objectCaching=false), so the bounding
      // rect only covers the bubble body — no tail inflation.
      const br    = (nb as any).getBoundingRect(false, true)
      const effectiveFontSize = ((nb as any).noteFontSize || 13) * ((nb as any).scaleX || 1) * zoom

      setEditingNote({
        obj:      nb,
        left:     offsetX + br.left,
        top:      offsetY + br.top,
        width:    br.width,
        height:   br.height,
        fontSize: effectiveFontSize,
      })
    }

    useImperativeHandle(ref, () => ({
      getAnnotatedImage: () => {
        const canvas = fabricRef.current
        if (!canvas) return screenshot
        const vpt = canvas.viewportTransform!
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
        const dataUrl = canvas.toDataURL({ format: 'png', quality: 1 })
        canvas.setViewportTransform(vpt)
        return dataUrl
      },
      getNoteComments: () => {
        const canvas = fabricRef.current
        if (!canvas) return []
        return canvas.getObjects()
          .filter(o => (o as any).type === 'NoteBubble')
          .map(o => ({
            text: (o as any).noteText as string,
            metadata: { note_color: (o as any).noteBgColor as string },
          }))
          .filter(c => c.text && c.text !== 'Add note...')
      },
    }))

    // ── main canvas setup ────────────────────────────────────────────────────

    useEffect(() => {
      if (!canvasElRef.current || !containerRef.current) return

      let cancelled = false
      const container = containerRef.current
      const cw = container.clientWidth
      const ch = Math.round(cw * 9 / 16)

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width: cw, height: ch,
        selection: true,
        backgroundColor: '#1a243e',
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas
      historyRef.current      = ['[]']
      historyIndexRef.current = 0
      setCanUndo(false)
      setCanRedo(false)


      // load screenshot as image object — added on top of grid
      if (screenshot) {
        fabric.Image.fromURL(screenshot, (fbImg) => {
          if (cancelled) return

          const imgAspect    = (fbImg.width  ?? cw) / (fbImg.height ?? ch)
          const canvasAspect = cw / ch
          if (imgAspect > canvasAspect) fbImg.scaleToWidth(cw)
          else                          fbImg.scaleToHeight(ch)

          fbImg.set({
            left:          (cw - fbImg.getScaledWidth())  / 2,
            top:           (ch - fbImg.getScaledHeight()) / 2,
            selectable:    true,
            evented:       true,
            hasControls:   true,
            hasBorders:    true,
            lockScalingFlip: true,
          })
          lockMidHandles(fbImg)

          canvas.add(fbImg)
          screenshotRef.current = fbImg
          canvas.renderAll()
        })
      }

      canvas.on('object:added',    () => saveSnapshot(canvas))
      canvas.on('object:removed',  () => saveSnapshot(canvas))
      canvas.on('object:modified', () => saveSnapshot(canvas))

      // track selection for UI state
      const onSel = () => {
        const obj = canvas.getActiveObject() as any
        const isNote = obj?.type === 'NoteBubble'
        setSelectedIsNote(isNote)
        if (isNote) {
          const bold   = obj.noteFontWeight === 'bold'
          const italic = obj.noteFontStyle  === 'italic'
          setNoteBold(bold);   noteBoldRef.current   = bold
          setNoteItalic(italic); noteItalicRef.current = italic
          setNoteBgColor(obj.noteBgColor    || '#fde68a')
          setNoteTextColor(obj.noteTextColor || '#1a1a1a')
        }
      }
      canvas.on('selection:created', onSel)
      canvas.on('selection:updated', onSel)
      canvas.on('selection:cleared', () => setSelectedIsNote(false))

      // double-click to edit note
      canvas.on('mouse:dblclick', (e) => {
        const target = e.target as any
        if (target?.type === 'NoteBubble') {
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
            active.forEach(o => {
              if (o !== screenshotRef.current) canvas.remove(o)
            })
            canvas.discardActiveObject()
            canvas.renderAll()
          }
          return
        }

        const ctrl = ev.ctrlKey || ev.metaKey
        if (ctrl && ev.key === 'z' && !ev.shiftKey) { ev.preventDefault(); undo() }
        if (ctrl && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) { ev.preventDefault(); redo() }

        // tool shortcuts
        if (!ctrl) {
          const map: Record<string, DrawTool> = {
            v: 'select', t: 'text', r: 'rect', e: 'ellipse', a: 'arrow', n: 'note',
          }
          if (map[ev.key.toLowerCase()]) setTool(map[ev.key.toLowerCase()])
        }
      }
      window.addEventListener('keydown', onKey)

      // draw interactions
      canvas.on('mouse:down', (e) => {
        const t = toolRef.current
        if (t === 'select') return

        const p = canvas.getPointer(e.e)
        isDrawing.current = true
        startPt.current   = { x: p.x, y: p.y }

        if (t === 'text') {
          const txt = new fabric.IText('', {
            left: p.x, top: p.y,
            fontSize: 18, fill: colorRef.current, fontFamily: 'sans-serif',
          })
          lockMidHandles(txt)
          canvas.add(txt)
          canvas.setActiveObject(txt)
          txt.enterEditing()
          isDrawing.current = false
          setTool('select'); toolRef.current = 'select'
          return
        }

        if (t === 'note') {
          const nb = new NoteBubbleClass({
            left:           p.x,
            top:            p.y,
            noteText:       'Add note...',
            noteBgColor:    noteBgRef.current,
            noteTextColor:  noteTextRef.current,
            noteFontWeight: noteBoldRef.current   ? 'bold'   : 'normal',
            noteFontStyle:  noteItalicRef.current ? 'italic' : 'normal',
            tailX:          0,
            tailY:          70,
          })
          canvas.add(nb)
          canvas.setActiveObject(nb)
          isDrawing.current = false
          setTool('select'); toolRef.current = 'select'
          setTimeout(() => openNoteEdit(nb, canvas), 30)
          return
        }

        const sx = p.x, sy = p.y
        const stroke = colorRef.current
        let shape: fabric.Object | null = null

        if (t === 'rect') {
          // fill: near-transparent so interior is hittable
          shape = new fabric.Rect({ left: sx, top: sy, width: 1, height: 1, fill: 'rgba(0,0,0,0.01)', stroke, strokeWidth: 2 })
        } else if (t === 'ellipse') {
          shape = new fabric.Ellipse({ left: sx, top: sy, rx: 1, ry: 1, fill: 'rgba(0,0,0,0.01)', stroke, strokeWidth: 2 })
        } else if (t === 'arrow') {
          shape = new fabric.Line([sx, sy, sx, sy], { stroke, strokeWidth: 2, opacity: 0.6 })
        }

        if (shape) {
          canvas.add(shape)
          activeObj.current = shape
        }
      })

      canvas.on('mouse:move', (e) => {
        if (!isDrawing.current || !activeObj.current) return
        const p   = canvas.getPointer(e.e)
        const s   = startPt.current
        const obj = activeObj.current
        if (obj.type === 'rect') {
          ;(obj as fabric.Rect).set({ left: Math.min(s.x, p.x), top: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) })
        } else if (obj.type === 'ellipse') {
          ;(obj as fabric.Ellipse).set({ left: Math.min(s.x, p.x), top: Math.min(s.y, p.y), rx: Math.abs(p.x - s.x) / 2, ry: Math.abs(p.y - s.y) / 2 })
        } else if (obj.type === 'line') {
          ;(obj as fabric.Line).set({ x2: p.x, y2: p.y })
        }
        canvas.renderAll()
      })

      canvas.on('mouse:up', (e) => {
        if (!isDrawing.current) return
        isDrawing.current = false

        if (toolRef.current === 'arrow' && activeObj.current?.type === 'line') {
          const line = activeObj.current as fabric.Line
          const p    = canvas.getPointer(e.e)
          canvas.remove(line)
          canvas.add(makeArrow(startPt.current.x, startPt.current.y, p.x, p.y, colorRef.current))
        }
        activeObj.current = null
        setTool('select'); toolRef.current = 'select'
      })

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const width = entry.contentRect.width
        const height = Math.round(width * 9 / 16)
        canvas.setDimensions({ width, height })
        canvas.renderAll()
      })
      resizeObserver.observe(container)

      return () => {
        cancelled = true
        window.removeEventListener('keydown', onKey)
        resizeObserver.disconnect()
        canvas.dispose()
        fabricRef.current = null
      }
    }, [screenshot]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── tool mode effect ─────────────────────────────────────────────────────

    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      if (tool === 'select') {
        canvas.selection = true
        canvas.defaultCursor = 'default'
        canvas.getObjects().forEach(o => o.set({ selectable: true, evented: true }))
      } else {
        canvas.selection = false
        canvas.discardActiveObject()
        canvas.defaultCursor = tool === 'text' ? 'text' : 'crosshair'
        canvas.getObjects().forEach(o => o.set({ selectable: false, evented: false }))
      }
      canvas.renderAll()
    }, [tool])

    // ── color apply to selection ─────────────────────────────────────────────

    const applyColorToSelection = (canvas: fabric.Canvas | null) => {
      if (!canvas) return
      const active = canvas.getActiveObject() as any
      if (!active) return
      if (active.type === 'i-text' || active.type === 'text') {
        active.set({ fill: colorRef.current })
      } else if (active.type !== 'NoteBubble') {
        active.set({ stroke: colorRef.current })
        if (active.fill && active.fill !== 'transparent') active.set({ fill: colorRef.current })
      }
      canvas.renderAll()
    }

    // ── clear / reset ─────────────────────────────────────────────────────────

    const clear = () => {
      const canvas = fabricRef.current
      if (!canvas) return
      canvas.getObjects().forEach(o => { if (o !== screenshotRef.current) canvas.remove(o) })
      canvas.renderAll()
    }

    const deleteSelected = () => {
      const canvas = fabricRef.current
      if (!canvas) return
      const active = canvas.getActiveObjects()
      active.forEach(o => { if (o !== screenshotRef.current) canvas.remove(o) })
      canvas.discardActiveObject()
      canvas.renderAll()
    }

    // ── styles ────────────────────────────────────────────────────────────────

    const btn = (active = false): React.CSSProperties => ({
      width: 32, height: 32,
      border: `1px solid ${active ? '#4540E8' : 'rgba(255,255,255,0.12)'}`,
      borderRadius: 6,
      background: active ? 'rgba(69,64,232,0.2)' : 'rgba(255,255,255,0.04)',
      color: 'white', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    })

    const addImageFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !fabricRef.current) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        fabric.Image.fromURL(dataUrl, (img) => {
          const canvas = fabricRef.current
          if (!canvas) return
          const maxW = canvas.getWidth() * 0.6
          const maxH = canvas.getHeight() * 0.6
          if ((img.width ?? 0) > maxW) img.scaleToWidth(maxW)
          if ((img.getScaledHeight()) > maxH) img.scaleToHeight(maxH)
          img.set({ left: canvas.getWidth() / 2, top: canvas.getHeight() / 2, originX: 'center', originY: 'center' })
          lockMidHandles(img)
          canvas.add(img)
          canvas.setActiveObject(img)
          canvas.renderAll()
          setTool('select'); toolRef.current = 'select'
        })
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

        {/* toolbar */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>

          {/* draw tools */}
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label} style={btn(tool === t.id)}>
              <t.Icon size={14} />
            </button>
          ))}

          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

          {/* image upload */}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={addImageFromFile} />
          <button onClick={() => fileInputRef.current?.click()} title="Add image" style={btn()}>
            <ImagePlus size={14} />
          </button>

          {/* note controls — visible when note tool active or note selected */}
          {(tool === 'note' || selectedIsNote) && (
            <>
              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

              {/* bold */}
              <button
                title="Bold"
                onClick={() => {
                  const next = !noteBold
                  setNoteBold(next); noteBoldRef.current = next
                  applyNoteStyle({ noteFontWeight: next ? 'bold' : 'normal' })
                }}
                style={{ ...btn(noteBold), fontWeight: 'bold', fontSize: 13, fontFamily: 'serif' }}
              >B</button>

              {/* italic */}
              <button
                title="Italic"
                onClick={() => {
                  const next = !noteItalic
                  setNoteItalic(next); noteItalicRef.current = next
                  applyNoteStyle({ noteFontStyle: next ? 'italic' : 'normal' })
                }}
                style={{ ...btn(noteItalic), fontStyle: 'italic', fontSize: 13, fontFamily: 'serif' }}
              >I</button>

              <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />

              <label title="Note background color" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                <span>Bg</span>
                <input type="color" value={noteBgColor} onChange={e => {
                  setNoteBgColor(e.target.value)
                  applyNoteStyle({ noteBgColor: e.target.value })
                }} style={{ width: 22, height: 22, padding: 1, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
              </label>

              <label title="Note text color" style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                <span>Text</span>
                <input type="color" value={noteTextColor} onChange={e => {
                  setNoteTextColor(e.target.value)
                  applyNoteStyle({ noteTextColor: e.target.value })
                }} style={{ width: 22, height: 22, padding: 1, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }} />
              </label>
            </>
          )}

          {/* right-side actions */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>

            <button onClick={deleteSelected} title="Delete selected (Del)" style={btn()}><X          size={14} /></button>
            <button onClick={clear}         title="Clear all"           style={{ ...btn(), borderColor: 'rgba(239,68,68,0.4)' }}><Trash2 size={14} /></button>
          </div>
        </div>

        {/* canvas container */}
        <div ref={containerRef} style={{ width: '100%', aspectRatio: '16/9', flexShrink: 0, overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', position: 'relative', marginTop: 10 }}>
          <canvas ref={canvasElRef} />

          {/* note text editing overlay */}
          {editingNote && (
            <textarea
              autoFocus
              defaultValue={editingNote.obj.noteText === 'Add note...' ? '' : (editingNote.obj.noteText as string)}
              placeholder="Add note..."
              onBlur={e => {
                const canvas = fabricRef.current
                if (canvas) {
                  editingNote.obj.noteText  = e.target.value || 'Add note...'
                  editingNote.obj.isEditing = false
                  editingNote.obj.dirty     = true
                  canvas.renderAll()
                  saveSnapshot(canvas)
                }
                setEditingNote(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  editingNote.obj.isEditing = false
                  editingNote.obj.dirty     = true
                  fabricRef.current?.renderAll()
                  setEditingNote(null)
                }
              }}
              style={{
                position:    'absolute',
                left:        editingNote.left,
                top:         editingNote.top,
                width:       editingNote.width,
                height:      editingNote.height,
                boxSizing:   'border-box',
                background:  'transparent',
                border:      '2px solid #4540E8',
                borderRadius: 10,
                outline:     'none',
                color:       (editingNote.obj.noteTextColor as string) || '#1a1a1a',
                fontSize:    `${editingNote.fontSize}px`,
                fontWeight:  (editingNote.obj.noteFontWeight as string) || 'normal',
                fontStyle:   (editingNote.obj.noteFontStyle  as string) || 'normal',
                fontFamily:  'sans-serif',
                padding:     '8px 10px',
                resize:      'none',
                overflow:    'hidden',
                zIndex:      10,
              }}
            />
          )}
        </div>
      </div>
    )
  },
)

AnnotationCanvas.displayName = 'AnnotationCanvas'
