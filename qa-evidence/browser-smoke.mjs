import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const baseURL = 'http://127.0.0.1:5173/'
const outDir = new URL('./', import.meta.url).pathname
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = {}
const errors = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const state = async (page) => page.evaluate(() => ({
  status: document.querySelector('[data-testid="game-status"]')?.textContent,
  enabled: [...document.querySelectorAll('[data-cell-id]')].filter((node) => !node.disabled).length,
  occupied: [...document.querySelectorAll('[data-cell-id]')].filter((node) => node.textContent === 'X' || node.textContent === 'O').length,
  locked: document.querySelectorAll('[data-locked="true"]').length,
  winning: document.querySelectorAll('[data-winning="true"]').length,
  live: document.querySelector('[data-live-status]')?.textContent,
}))

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  await page.goto(baseURL, { waitUntil: 'networkidle' })

  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const reset = document.querySelector('[data-testid="reset-game"]')
    const grid = document.querySelector('[role="grid"]')
    const live = document.querySelector('[role="status"]')
    return {
      status: document.querySelector('[data-testid="game-status"]')?.textContent,
      cells: document.querySelectorAll('[data-cell-id]').length,
      enabled: [...document.querySelectorAll('[data-cell-id]')].filter((node) => !node.disabled).length,
      locked: document.querySelectorAll('[data-locked="true"]').length,
      resetName: reset?.textContent,
      canvasLabel: canvas?.getAttribute('aria-label'),
      canvasTabIndex: canvas?.tabIndex,
      gridName: grid?.getAttribute('aria-label'),
      liveMode: live?.getAttribute('aria-live'),
      cssSize: [canvas?.clientWidth, canvas?.clientHeight],
      backingSize: [canvas?.width, canvas?.height],
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert(initial.status === "X's turn", 'initial status')
  assert(initial.cells === 27 && initial.enabled === 26 && initial.locked === 1, '27 cells with only X opening center locked')
  assert(initial.resetName === 'Reset game' && initial.canvasLabel && initial.canvasTabIndex === 0, 'named reset and focusable canvas')
  assert(initial.gridName && initial.liveMode === 'polite', 'named grid and polite live region')
  assert(initial.horizontalOverflow === 0, 'desktop horizontal overflow')
  results.initialDesktop = initial
  await page.screenshot({ path: `${outDir}desktop-initial.png`, fullPage: true })
  await page.locator('details').evaluate((node) => { node.open = true })

  await page.locator('[data-cell-id="1"]').click()
  let current = await state(page)
  assert(current.status === "O's turn" && current.occupied === 1 && current.enabled === 26 && current.locked === 0, 'semantic placement and alternation')
  results.semanticPlacement = current
  await page.locator('[data-testid="reset-game"]').click()

  for (const id of [1, 3, 5, 7, 9, 10, 12, 14]) await page.locator(`[data-cell-id="${id}"]`).click()

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert(box, 'canvas bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  current = await state(page)
  assert(current.occupied === 9 && current.status === "O's turn" && current.locked === 0, 'raycast center click places once after opening unlock')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  current = await state(page)
  assert(current.occupied === 9 && current.status === "O's turn" && current.live === 'Cell occupied', 'occupied raycast click rejected')
  await page.locator('[data-testid="reset-game"]').click()
  await page.locator('[data-cell-id="4"]').focus()
  await canvas.focus()
  await page.keyboard.press('Enter')
  current = await state(page)
  assert(current.occupied === 1 && current.status === "O's turn", 'canvas keyboard Enter places')
  await page.keyboard.press('Enter')
  current = await state(page)
  assert(current.occupied === 1 && current.status === "O's turn" && current.live === 'Cell occupied', 'occupied canvas keyboard activation rejected')
  results.raycastAndOccupiedRejection = current
  await page.locator('[data-testid="reset-game"]').click()

  for (let id = 0; id < 26; id += 1) await page.locator(`[data-cell-id="${id}"]`).click()
  current = await state(page)
  assert(current.status === 'X wins — 9 lines to 6' && current.winning === 0 && current.enabled === 0, 'scored terminal state and lockout')
  await canvas.focus()
  await page.keyboard.press('Enter')
  current = await state(page)
  assert(current.occupied === 26 && current.live === 'Game over. Reset to play again.', 'post-game lockout')
  results.winAndLockout = current
  await page.screenshot({ path: `${outDir}desktop-win.png`, fullPage: true })
  await page.locator('[data-testid="reset-game"]').click()
  current = await state(page)
  assert(current.status === "X's turn" && current.enabled === 26 && current.locked === 1 && current.winning === 0, 'reset clears game and restores opening center lock')
  results.reset = current

  const beforeDragOccupied = current.occupied
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.70, box.y + box.height * 0.62, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(2000)
  current = await state(page)
  assert(current.occupied === beforeDragOccupied, 'drag must not place')
  await page.mouse.move(10, 10)
  await page.evaluate(() => document.activeElement?.blur())
  const oriented = await canvas.screenshot({ path: `${outDir}canvas-after-drag.png` })
  await page.locator('[data-cell-id="1"]').click()
  await page.locator('[data-testid="reset-game"]').click()
  await page.waitForTimeout(2000)
  await page.mouse.move(10, 10)
  await page.evaluate(() => document.activeElement?.blur())
  const afterReset = await canvas.screenshot({ path: `${outDir}canvas-after-reset.png` })
  const cameraHashes = { afterDrag: hash(oriented), afterReset: hash(afterReset) }
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(500)
  const zoomed = await canvas.screenshot({ path: `${outDir}canvas-after-zoom.png` })
  assert(hash(afterReset) !== hash(zoomed), 'wheel changes zoom')
  results.camera = { dragDidNotPlace: true, cameraHashes, wheelChangedView: true }

  await canvas.focus()
  const outline = await canvas.evaluate((node) => getComputedStyle(node).outlineStyle)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('PageUp')
  await page.keyboard.press('Space')
  current = await state(page)
  assert(current.occupied === 1, 'canvas keyboard navigation and Space placement')
  await page.locator('[data-testid="reset-game"]').click()
  await page.locator('details').evaluate((node) => { node.open = true })
  await page.locator('[data-cell-id="3"]').focus()
  await page.keyboard.press('ArrowRight')
  const focusedCell = await page.evaluate(() => document.activeElement?.getAttribute('data-cell-id'))
  assert(focusedCell === '4', 'semantic grid arrow navigation')
  await page.keyboard.press('Enter')
  current = await state(page)
  assert(current.occupied === 1 && current.status === "O's turn", 'semantic grid Enter placement')
  results.keyboard = { canvasOutline: outline, movedToCell: focusedCell, enterPlaced: true, spacePlaced: true }

  await page.setViewportSize({ width: 320, height: 568 })
  await page.waitForTimeout(200)
  const mobile = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const status = document.querySelector('[data-testid="game-status"]')?.getBoundingClientRect()
    const reset = document.querySelector('[data-testid="reset-game"]')?.getBoundingClientRect()
    return {
      viewport: [innerWidth, innerHeight],
      cssSize: [canvas?.clientWidth, canvas?.clientHeight],
      backingSize: [canvas?.width, canvas?.height],
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      statusVisible: Boolean(status && status.width && status.height),
      resetVisible: Boolean(reset && reset.width && reset.height),
      resetHeight: reset?.height,
    }
  })
  assert(mobile.horizontalOverflow === 0 && mobile.statusVisible && mobile.resetVisible, 'mobile visibility and no horizontal overflow')
  assert((mobile.resetHeight ?? 0) >= 44, 'mobile reset touch target')
  assert(mobile.backingSize[0] !== initial.backingSize[0] || mobile.backingSize[1] !== initial.backingSize[1], 'canvas backing resized')
  results.mobile = mobile
  await page.screenshot({ path: `${outDir}mobile-320x568.png`, fullPage: true })

  const focusPage = await context.newPage()
  await focusPage.goto(baseURL, { waitUntil: 'networkidle' })
  const tabOrder = []
  for (let index = 0; index < 9; index += 1) {
    await focusPage.keyboard.press('Tab')
    tabOrder.push(await focusPage.evaluate(() => {
      const active = document.activeElement
      return active?.getAttribute('data-testid')
        ?? (active?.hasAttribute('data-how-to-play') ? 'how-to-play' : null)
        ?? active?.getAttribute('data-mode')
        ?? active?.getAttribute('data-layer')
        ?? active?.tagName
    }))
  }
  const keyboardOutline = await focusPage.locator('canvas').evaluate((node) => getComputedStyle(node).outlineStyle)
  results.keyboard.tabOrder = tabOrder
  assert(JSON.stringify(tabOrder) === JSON.stringify(['reset-game', 'how-to-play', 'local', 'bot', 'all', 'front', 'middle', 'back', 'board-canvas']), 'Tab reaches reset, instructions, mode controls, layer controls, then canvas')
  assert(keyboardOutline !== 'none', 'keyboard focus indicator is visible')
  results.keyboard.keyboardOutline = keyboardOutline
  await focusPage.close()
  await context.close()

  const reducedContext = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: 'reduce' })
  const reducedPage = await reducedContext.newPage()
  reducedPage.on('console', (message) => { if (message.type() === 'error') errors.push(`reduced console: ${message.text()}`) })
  reducedPage.on('pageerror', (error) => errors.push(`reduced pageerror: ${error.message}`))
  await reducedPage.goto(baseURL, { waitUntil: 'networkidle' })
  const reduced = await reducedPage.evaluate(() => ({
    mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
    transitionDuration: getComputedStyle(document.querySelector('[data-testid="reset-game"]')).transitionDuration,
  }))
  await reducedPage.locator('details').evaluate((node) => { node.open = true })
  await reducedPage.locator('[data-cell-id="1"]').click()
  const reducedState = await state(reducedPage)
  assert(reduced.mediaMatches && reduced.transitionDuration === '0s' && reducedState.status === "O's turn", 'reduced motion immediate state')
  results.reducedMotion = { ...reduced, state: reducedState }
  await reducedContext.close()

  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`)
  results.consoleErrors = errors
  console.log(JSON.stringify({ verdict: 'PASS', results }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: error.message, results, errors }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
