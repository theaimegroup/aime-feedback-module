import { domToPng } from 'modern-screenshot'

const PROPS = ['position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'boxSizing'] as const

export async function captureScreenshot(): Promise<string> {
  const { scrollX, scrollY, innerWidth, innerHeight, devicePixelRatio } = window

  // When scrolled, `transform` on <html> breaks position:fixed — fixed elements
  // become positioned relative to the transformed ancestor in foreignObject SVG.
  // Fix: convert fixed elements to absolute with equivalent document coordinates
  // before capture, then restore. The <html> translate then positions them correctly.
  type Saved = { el: HTMLElement; vals: Record<string, string> }
  const saved: Saved[] = []

  if (scrollX || scrollY) {
    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (el.id === '__aime-fb__') return
      if (getComputedStyle(el).position !== 'fixed') return
      const rect = el.getBoundingClientRect()
      const vals: Record<string, string> = {}
      PROPS.forEach((p) => { vals[p] = el.style[p] })
      saved.push({ el, vals })
      el.style.position = 'absolute'
      el.style.top = `${rect.top + scrollY}px`
      el.style.left = `${rect.left + scrollX}px`
      el.style.width = `${rect.width}px`
      el.style.height = `${rect.height}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.boxSizing = 'border-box'
    })
  }

  try {
    return await domToPng(document.documentElement, {
      scale: Math.min(devicePixelRatio, 2),
      filter: (node) => (node as Element).id !== '__aime-fb__',
      width: innerWidth,
      height: innerHeight,
      style: (scrollX || scrollY) ? {
        transform: `translate(${-scrollX}px, ${-scrollY}px)`,
      } : undefined,
    })
  } finally {
    saved.forEach(({ el, vals }) => {
      PROPS.forEach((p) => { el.style[p] = vals[p] })
    })
  }
}
