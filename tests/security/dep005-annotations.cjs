const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../..')
const base = path.join(__dirname, 'fixtures/dep005')
const host = root
const hostRequire = createRequire(path.join(root, 'package.json'))
const esbuild = hostRequire('esbuild')
const { chromium } = hostRequire('playwright')
const sourceRoot = process.env.DEP005_ANNOTATION_SOURCE || root
const fabricRoot = process.env.DEP005_FABRIC_ROOT || root
const fabricEntry = createRequire(
  path.join(fabricRoot, 'package.json'),
).resolve('fabric')
;(async () => {
  let browser, server
  try {
    const code = `import React from'react';import{createRoot}from'react-dom/client';import{AnnotationCanvas}from'${path.join(sourceRoot, 'src/AnnotationCanvas.tsx')}';const image=document.createElement('canvas');image.width=160;image.height=90;const ctx=image.getContext('2d');ctx.fillStyle='#18213a';ctx.fillRect(0,0,160,90);ctx.fillStyle='#f0f0ff';ctx.fillRect(2,2,12,8);const screenshot=image.toDataURL();window.fixtureRoot=createRoot(document.getElementById('root'));window.setFixtureScreenshot=screenshot=>window.fixtureRoot.render(React.createElement(AnnotationCanvas,{screenshot,ref:handle=>window.annotationHandle=handle}));window.setFixtureScreenshot(screenshot);`
    const built = await esbuild.build({
      stdin: { contents: code, resolveDir: host, loader: 'ts' },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      write: false,
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [
        {
          name: 'owned-observation-boundaries',
          setup(build) {
            build.onResolve(
              { filter: /^(react|react-dom)(\/.*)?$/ },
              (args) => ({ path: hostRequire.resolve(args.path) }),
            )
            build.onResolve({ filter: /^lucide-react$/ }, (args) => ({
              path: hostRequire.resolve(args.path),
            }))
            build.onResolve({ filter: /^fabric$/ }, () => ({
              path: 'tracked-fabric',
              namespace: 'fixture',
            }))
            build.onResolve({ filter: /^owned-actual-fabric$/ }, () => ({
              path: fabricEntry,
            }))
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
              contents: `import*as module from'owned-actual-fabric';export*from'owned-actual-fabric';const actual=module.fabric||module;class TrackedCanvas extends actual.Canvas{constructor(...args){super(...args);(window.__depCanvases||=[]).push(this);}}export{TrackedCanvas as Canvas};export const fabric={...actual,Canvas:TrackedCanvas};`,
              resolveDir: host,
            }))
          },
        },
      ],
    })
    server = http.createServer((req, res) => {
      if (req.url === '/fixture.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(built.outputFiles[0].text)
      } else {
        res.setHeader('Content-Type', 'text/html')
        res.end(
          '<!doctype html><style>body{margin:0;background:#111827;color:white;font-family:sans-serif}#root{width:960px;margin:20px}</style><div id="root"></div><script defer src="/fixture.js"></script>',
        )
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.DEP_EDITOR_CHROME_PATH ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    })
    const page = await browser.newPage({
      viewport: { width: 1100, height: 800 },
    })
    const errors = []
    page.on('pageerror', (error) => {
      errors.push(String(error))
      console.error('Owned annotation error:', String(error))
    })
    await page.addInitScript(() => {
      const add = window.addEventListener.bind(window),
        remove = window.removeEventListener.bind(window)
      window.__ownedKeys = new Set()
      window.addEventListener = (type, listener, ...rest) => {
        if (type === 'keydown') window.__ownedKeys.add(listener)
        return add(type, listener, ...rest)
      }
      window.removeEventListener = (type, listener, ...rest) => {
        if (type === 'keydown') window.__ownedKeys.delete(listener)
        return remove(type, listener, ...rest)
      }
    })
    await page.goto('http://127.0.0.1:' + server.address().port)
    await page.waitForFunction(() =>
      window.__depCanvases?.[0]
        ?.getObjects()
        .some((object) => object.type === 'image'),
    )
    const canvas = page.locator('canvas.upper-canvas')
    const box = await canvas.boundingBox()
    assert.ok(box)
    for (const [title, x, y, w, h] of [
      ['Rectangle (R)', 70, 70, 130, 75],
      ['Ellipse (E)', 270, 70, 120, 70],
      ['Arrow (A)', 450, 70, 130, 80],
    ]) {
      await page.getByTitle(title, { exact: true }).click()
      await page.mouse.move(box.x + x, box.y + y)
      await page.mouse.down()
      await page.mouse.move(box.x + x + w, box.y + y + h, { steps: 5 })
      await page.mouse.up()
    }
    await page.getByTitle('Text (T)', { exact: true }).click()
    await canvas.click({ position: { x: 75, y: 280 } })
    await page.keyboard.type('Owned text')
    await page.keyboard.press('Escape')
    await page.getByTitle('Note (N)', { exact: true }).click()
    await canvas.click({ position: { x: 420, y: 270 } })
    const textarea = page.getByPlaceholder('Add note...', { exact: true })
    await textarea.fill('Owned note')
    await page.getByTitle('Select (V)', { exact: true }).click()
    const snapshot = await page.evaluate(() => {
      const canvas = window.__depCanvases[0]
      canvas.discardActiveObject()
      canvas.renderAll()
      return {
        width: canvas.getWidth(),
        height: canvas.getHeight(),
        objects: canvas
          .getObjects()
          .map((object) => ({
            type: object.type,
            left: object.left,
            top: object.top,
            width: object.width,
            height: object.height,
            scaleX: object.scaleX,
            scaleY: object.scaleY,
            originX: object.originX,
            originY: object.originY,
            text: object.text,
            noteText: object.noteText,
            tailX: object.tailX,
            tailY: object.tailY,
          })),
        comments: window.annotationHandle.getNoteComments(),
        png: window.annotationHandle.getAnnotatedImage(),
      }
    })
    assert.equal(snapshot.objects.length, 6)
    assert.deepEqual(snapshot.comments, [
      { text: 'Owned note', metadata: { note_color: '#fde68a' } },
    ])
    const output =
      process.env.DEP005_ANNOTATION_OUTPUT ||
      path.join(
        fs.mkdtempSync(
          path.join(require('node:os').tmpdir(), 'dep005-annotation-'),
        ),
        'candidate',
      )
    fs.writeFileSync(
      output + '.png',
      Buffer.from(snapshot.png.split(',')[1], 'base64'),
    )
    delete snapshot.png
    fs.writeFileSync(output + '.json', JSON.stringify(snapshot, null, 2) + '\n')
    // Compare actual raster output after the migration, not just object counts.
    const baseline = JSON.parse(
      fs.readFileSync(path.join(base, 'annotation-baseline.json')),
    )
    const normalize = (value) =>
      JSON.parse(
        JSON.stringify(value, (key, v) =>
          key === 'type'
            ? String(v).toLowerCase()
            : typeof v === 'number'
              ? Math.round(v * 1e9) / 1e9
              : v,
        ),
      )
    assert.deepEqual(normalize(snapshot), normalize(baseline))
    const oldPNG = fs
      .readFileSync(path.join(base, 'annotation-baseline.png'))
      .toString('base64')
    const newPNG = fs.readFileSync(output + '.png').toString('base64')
    const pixels = await page.evaluate(
      async ([a, b]) => {
        const read = async (src) => {
          const img = new Image()
          img.src = 'data:image/png;base64,' + src
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          return ctx.getImageData(0, 0, img.width, img.height).data
        }
        const x = await read(a),
          y = await read(b)
        let count = 0
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) count++
        return count
      },
      [oldPNG, newPNG],
    )
    assert.equal(pixels, 0)
    // Undo/redo must restore the finished geometry, metadata, and original stacking order.
    const state = () =>
      page.evaluate(() =>
        window.__depCanvases[0].getObjects().map((o) => o.toObject()),
      )
    const expected = await state()
    await page.getByTitle('Undo (Ctrl+Z)', { exact: true }).click()
    await page.waitForFunction(
      () => window.annotationHandle.getNoteComments().length === 0,
    )
    await page.getByTitle('Redo (Ctrl+Shift+Z)', { exact: true }).click()
    await page.waitForFunction(
      () => window.annotationHandle.getNoteComments()[0]?.text === 'Owned note',
    )
    assert.deepEqual(await state(), expected)
    // Clear all and successive history restoration must keep the screenshot excluded.
    await page.getByTitle('Clear all', { exact: true }).click()
    assert.equal((await state()).length, 1)
    for (let i = 0; i < 5; i++) {
      await page.getByTitle('Undo (Ctrl+Z)', { exact: true }).click()
      await page.waitForTimeout(25)
    }
    assert.equal((await state()).length, 6)
    assert.deepEqual(
      (await state()).map((o) => o.type),
      expected.map((o) => o.type),
    )
    // Real note overlay editing and style updates survive the registered-class reload.
    await canvas.dblclick({ position: { x: 450, y: 290 } })
    await textarea.fill('Edited <script>plain text</script>')
    await page.getByTitle('Select (V)', { exact: true }).click()
    assert.equal(
      (await page.evaluate(() => window.annotationHandle.getNoteComments()))[0]
        .text,
      'Edited <script>plain text</script>',
    )
    await canvas.click({ position: { x: 450, y: 290 } })
    await page.getByTitle('Bold', { exact: true }).click()
    await page.getByTitle('Italic', { exact: true }).click()
    await page.getByTitle('Font size', { exact: true }).selectOption('24')
    assert.equal((await state()).at(-1).noteFontWeight, 'bold')
    assert.equal((await state()).at(-1).noteFontStyle, 'italic')
    assert.equal((await state()).at(-1).noteFontSize, 24)
    const styled = await state()
    await page.getByTitle('Undo (Ctrl+Z)', { exact: true }).click()
    await page.waitForTimeout(25)
    await page.getByTitle('Redo (Ctrl+Shift+Z)', { exact: true }).click()
    await page.waitForTimeout(25)
    assert.deepEqual(await state(), styled)
    // Tail is a real Fabric control; drag it outside the note, preserving the body anchor.
    const tail = await page.evaluate(() => {
      const c = window.__depCanvases[0],
        n = c.getObjects().at(-1)
      c.setActiveObject(n)
      n.setCoords()
      c.renderAll()
      return {
        x: n.oCoords.tail.x,
        y: n.oCoords.tail.y,
        left: n.left,
        top: n.top,
        tailX: n.tailX,
        tailY: n.tailY,
      }
    })
    await page.mouse.move(box.x + tail.x, box.y + tail.y)
    await page.mouse.down()
    await page.mouse.move(box.x + tail.x + 40, box.y + tail.y + 25, {
      steps: 5,
    })
    await page.mouse.up()
    const movedTail = (await state()).at(-1)
    assert.notEqual(movedTail.tailX, tail.tailX)
    assert.equal(movedTail.left, tail.left)
    assert.equal(movedTail.top, tail.top)
    // Invalid image errors are visible and a subsequent valid local image still loads.
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: 'bad.png',
        mimeType: 'image/png',
        buffer: Buffer.from('not an image'),
      })
    await page
      .getByRole('status')
      .filter({ hasText: 'Could not load the selected image' })
      .waitFor()
    const beforeImage = (await state()).length
    await page
      .locator('input[type=file]')
      .setInputFiles({
        name: 'owned.png',
        mimeType: 'image/png',
        buffer: fs.readFileSync(path.join(base, 'annotation-baseline.png')),
      })
    await page.waitForFunction(
      (count) => window.__depCanvases[0].getObjects().length === count + 1,
      beforeImage,
    )
    assert.equal((await state()).at(-1).type, 'Image')
    // ResizeObserver must adapt the canvas without shifting stored object positions.
    const beforeResize = await state()
    await page.evaluate(
      () => (document.getElementById('root').style.width = '720px'),
    )
    await page.waitForFunction(() => window.__depCanvases[0].getWidth() === 720)
    assert.equal(
      await page.evaluate(() => window.__depCanvases[0].getHeight()),
      405,
    )
    assert.deepEqual(await state(), beforeResize)
    console.log(
      'Annotation regression: pixel identity, complete-shape history, note edit/style/tail, invalid-image recovery, upload and resize passed',
    )
    await page.evaluate(() =>
      window.setFixtureScreenshot(
        'data:image/png;base64,bm90LWEtcmVhbC1pbWFnZQ==',
      ),
    )
    await page.waitForTimeout(100)
    await page
      .getByRole('status')
      .filter({ hasText: 'Could not load the screenshot' })
      .waitFor()
    assert.equal(
      await page.evaluate(() => window.__depCanvases[0].disposed),
      true,
    )
    assert.equal(
      await page.evaluate(() => window.__depCanvases[0].destroyed),
      true,
    )
    assert.equal(await page.evaluate(() => window.__ownedKeys.size), 1)
    await page.evaluate(() => window.fixtureRoot.unmount())
    await page.waitForTimeout(50)
    assert.equal(await page.evaluate(() => window.__ownedKeys.size), 0)
    assert.equal(await page.locator('canvas').count(), 0)
    assert.equal(
      await page.evaluate(() =>
        window.__depCanvases.every(
          (canvas) => canvas.disposed && canvas.destroyed,
        ),
      ),
      true,
    )
    assert.deepEqual(errors, [])
    console.log(
      'Image-effect replacement/unmount disposes canvases and removes key listeners',
    )
    console.log(
      'Actual AnnotationCanvas geometry/PNG/comment baseline captured:',
      output,
      JSON.stringify(snapshot.objects),
    )
  } finally {
    if (browser) await browser.close()
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
