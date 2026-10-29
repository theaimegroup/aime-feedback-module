import * as fabric from 'fabric'

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
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

function measureNoteSize(
  text: string,
  fontSize: number,
  fontWeight: string,
  fontStyle: string,
): { width: number; height: number } {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px sans-serif`
  const MIN_W = 120,
    MAX_W = 320,
    PAD_X = 24,
    PAD_Y = 20
  // determine wrapping width based on longest unwrapped line
  const rawLines = text.split('\n')
  let naturalW = MIN_W
  for (const l of rawLines) {
    naturalW = Math.max(naturalW, ctx.measureText(l).width + PAD_X)
  }
  naturalW = Math.min(naturalW, MAX_W)
  const wrapW = naturalW - PAD_X
  const wrapped = wrapText(ctx, text, wrapW)
  const lineH = fontSize * 1.4
  const h = Math.max(50, wrapped.length * lineH + PAD_Y)
  return { width: Math.round(Math.max(MIN_W, naturalW)), height: Math.round(h) }
}

function buildBubblePath(
  W: number,
  H: number,
  R: number,
  tx: number,
  ty: number,
): string {
  const hw = W / 2
  const hh = H / 2
  const TW = 12 // half-width of tail base
  const HGAP = TW + R + 3 // min distance of base centre from corner arc on horiz edges
  const VGAP = TW + R + 3 // same for vertical edges
  const cl = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v))

  // Determine which wall the ray from (0,0)→(tx,ty) exits through first.
  // |ty/tx| vs hh/hw comparison — avoids snapping to corners by using true geometry.
  const ax = Math.abs(tx),
    ay = Math.abs(ty)
  const exitsTB = ax === 0 || (ay > 0 && ay / ax >= hh / hw)

  let bcx: number, bcy: number
  let edge: 'B' | 'T' | 'R' | 'L'

  if (exitsTB) {
    edge = ty >= 0 ? 'B' : 'T'
    bcy = ty >= 0 ? hh : -hh
    // natural intersection x = tx * bcy / ty; clamp away from corner arc endpoints
    const ix = ty !== 0 ? (tx * bcy) / ty : 0
    bcx = cl(ix, -hw + HGAP, hw - HGAP)
  } else {
    edge = tx >= 0 ? 'R' : 'L'
    bcx = tx >= 0 ? hw : -hw
    const iy = tx !== 0 ? (ty * bcx) / tx : 0
    bcy = cl(iy, -hh + VGAP, hh - VGAP)
  }

  if (edge === 'B') {
    return `M${-hw + R} ${-hh} L${hw - R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh + R} L${hw} ${hh - R} Q${hw} ${hh} ${hw - R} ${hh} L${bcx + TW} ${hh} L${tx} ${ty} L${bcx - TW} ${hh} L${-hw + R} ${hh} Q${-hw} ${hh} ${-hw} ${hh - R} L${-hw} ${-hh + R} Q${-hw} ${-hh} ${-hw + R} ${-hh} Z`
  }
  if (edge === 'T') {
    return `M${-hw + R} ${-hh} L${bcx - TW} ${-hh} L${tx} ${ty} L${bcx + TW} ${-hh} L${hw - R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh + R} L${hw} ${hh - R} Q${hw} ${hh} ${hw - R} ${hh} L${-hw + R} ${hh} Q${-hw} ${hh} ${-hw} ${hh - R} L${-hw} ${-hh + R} Q${-hw} ${-hh} ${-hw + R} ${-hh} Z`
  }
  if (edge === 'R') {
    return `M${-hw + R} ${-hh} L${hw - R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh + R} L${hw} ${bcy - TW} L${tx} ${ty} L${hw} ${bcy + TW} L${hw} ${hh - R} Q${hw} ${hh} ${hw - R} ${hh} L${-hw + R} ${hh} Q${-hw} ${hh} ${-hw} ${hh - R} L${-hw} ${-hh + R} Q${-hw} ${-hh} ${-hw + R} ${-hh} Z`
  }
  // L
  return `M${-hw + R} ${-hh} L${hw - R} ${-hh} Q${hw} ${-hh} ${hw} ${-hh + R} L${hw} ${hh - R} Q${hw} ${hh} ${hw - R} ${hh} L${-hw + R} ${hh} Q${-hw} ${hh} ${-hw} ${hh - R} L${-hw} ${bcy + TW} L${tx} ${ty} L${-hw} ${bcy - TW} L${-hw} ${-hh + R} Q${-hw} ${-hh} ${-hw + R} ${-hh} Z`
}

interface NoteProperties {
  noteText: string
  tailX: number
  tailY: number
  noteBgColor: string
  noteTextColor: string
  noteFontSize: number
  noteFontWeight: string
  noteFontStyle: string
}

/** Registered Fabric class: inherited Promise-based fromObject restores note metadata. */
export class NoteBubbleClass
  extends fabric.FabricObject
  implements NoteProperties
{
  static type = 'NoteBubble'
  static customProperties = [
    'noteText',
    'tailX',
    'tailY',
    'noteBgColor',
    'noteTextColor',
    'noteFontSize',
    'noteFontWeight',
    'noteFontStyle',
  ]

  noteText: string
  tailX: number
  tailY: number
  noteBgColor: string
  noteTextColor: string
  noteFontSize: number
  noteFontWeight: string
  noteFontStyle: string
  isEditing = false

  constructor(
    options: Partial<fabric.FabricObjectProps> & Partial<NoteProperties> = {},
  ) {
    super({
      width: 180,
      height: 80,
      originX: 'left',
      originY: 'top',
      strokeWidth: 0,
      ...options,
    })
    this.noteText = options.noteText ?? 'Add note...'
    this.tailX = options.tailX ?? 0
    this.tailY = options.tailY ?? 70
    this.noteBgColor = options.noteBgColor ?? '#fde68a'
    this.noteTextColor = options.noteTextColor ?? '#1a1a1a'
    this.noteFontSize = options.noteFontSize ?? 13
    this.noteFontWeight = options.noteFontWeight ?? 'normal'
    this.noteFontStyle = options.noteFontStyle ?? 'normal'
    this.objectCaching = false // the tail extends beyond the body bounds
    this._setupControls()
    if (!options.width && !options.height) this._recalcSize()
  }

  _recalcSize(keepWidth?: boolean) {
    const text = this.noteText as string
    const fs = this.noteFontSize as number
    const fw = this.noteFontWeight as string
    const fs2 = this.noteFontStyle as string
    if (keepWidth) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = `${fs2} ${fw} ${fs}px sans-serif`
      const W = this.width as number
      const lines = wrapText(ctx, text, W - 20)
      const h = Math.max(50, lines.length * fs * 1.4 + 20)
      this.set({ height: Math.round(h) })
    } else {
      const { width, height } = measureNoteSize(text, fs, fw, fs2)
      this.set({ width, height })
    }
    this._clampTail()
    this.setCoords()
    this.dirty = true
  }

  _clampTail() {
    const hw = ((this.width as number) || 180) / 2
    const hh = ((this.height as number) || 80) / 2
    const MARGIN = 20
    let tx = this.tailX as number,
      ty = this.tailY as number
    const ax = Math.abs(tx),
      ay = Math.abs(ty)
    const exitsTB = ax === 0 || (ay > 0 && ay / ax >= hh / hw)
    if (exitsTB) {
      const minDist = hh + MARGIN
      if (Math.abs(ty) < minDist) ty = ty >= 0 ? minDist : -minDist
    } else {
      const minDist = hw + MARGIN
      if (Math.abs(tx) < minDist) tx = tx >= 0 ? minDist : -minDist
    }
    this.tailX = tx
    this.tailY = ty
  }

  _setupControls() {
    // mt/mb hidden — height is driven by content + fontSize
    this.setControlsVisibility({ mt: false, mb: false })
    this.controls.tail = new fabric.Control({
      x: 0,
      y: 0,
      offsetX: 0,
      offsetY: 0,
      cursorStyle: 'crosshair',
      actionName: 'moveTail',
      render(ctx: CanvasRenderingContext2D, left: number, top: number) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(left, top, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#4540E8'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      },
      positionHandler(
        _dim: unknown,
        finalMatrix: fabric.TMat2D,
        fabricObject: fabric.FabricObject,
      ) {
        const nb = fabricObject as NoteBubbleClass
        return fabric.util.transformPoint(
          new fabric.Point(
            nb.tailX * (nb.scaleX || 1),
            nb.tailY * (nb.scaleY || 1),
          ),
          finalMatrix,
        )
      },
      actionHandler(
        eventData: fabric.TPointerEvent,
        transform: fabric.Transform,
      ) {
        const nb = transform.target as NoteBubbleClass
        const canvas = nb.canvas
        if (!canvas) return false
        const pointer = canvas.getScenePoint(eventData)
        const matrix = nb.calcTransformMatrix()
        const inv = fabric.util.invertTransform(matrix)
        const local = fabric.util.transformPoint(
          new fabric.Point(pointer.x, pointer.y),
          inv,
        )

        nb.tailX = local.x
        nb.tailY = local.y
        nb._clampTail()
        nb.dirty = true
        canvas.requestRenderAll()
        return true
      },
      sizeX: 12,
      sizeY: 12,
    })
  }

  _render(ctx: CanvasRenderingContext2D) {
    const W = this.width as number
    const H = this.height as number
    const fs = this.noteFontSize as number

    const pathStr = buildBubblePath(
      W,
      H,
      10,
      this.tailX as number,
      this.tailY as number,
    )
    const p2d = new Path2D(pathStr)

    ctx.save()
    ctx.fillStyle = this.noteBgColor as string
    ctx.fill(p2d)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.stroke(p2d)
    ctx.restore()

    if (!this.isEditing) {
      ctx.save()
      ctx.fillStyle = this.noteTextColor as string
      ctx.font = `${this.noteFontStyle} ${this.noteFontWeight} ${fs}px sans-serif`
      ctx.textBaseline = 'top'
      const maxW = W - 20
      const lines = wrapText(ctx, this.noteText as string, maxW)
      const lineH = fs * 1.4
      const totalH = lines.length * lineH
      const startY = -H / 2 + Math.max(10, (H - totalH) / 2)
      lines.forEach((line, i) => {
        ctx.fillText(line, -W / 2 + 10, startY + i * lineH, maxW)
      })
      ctx.restore()
    }
  }
}

fabric.classRegistry.setClass(NoteBubbleClass)
