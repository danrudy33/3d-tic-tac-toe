import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const errors = []
const result = {}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'


const layout = (page) => page.evaluate(() => {
  const rect = (selector) => {
    const bounds = document.querySelector(selector)?.getBoundingClientRect()
    return bounds ? { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, width: bounds.width, height: bounds.height } : null
  }
  const panel = document.querySelector('[data-controls-panel]')
  const toggle = document.querySelector('[data-controls-toggle]')
  const score = document.querySelector('[data-fairest-scoreboard]')?.getBoundingClientRect()
  return {
    viewport: [innerWidth, innerHeight],
    sidebar: rect('.game-sidebar'),
    stage: rect('.board-stage'),
    canvas: rect('canvas'),
    panelDisplay: panel ? getComputedStyle(panel).display : null,
    panelInert: panel?.hasAttribute('inert'),
    toggleVisible: Boolean(toggle && getComputedStyle(toggle).display !== 'none'),
    expanded: toggle?.getAttribute('aria-expanded'),
    scoreVisible: Boolean(score && score.width > 0 && score.height > 0),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})

function assertNoOverlap(state, mobile) {
  assert(state.sidebar && state.stage && state.canvas, 'layout regions must exist')
  if (mobile) assert(state.sidebar.bottom <= state.stage.top + 1, 'phone score bar must not overlap board stage')
  else assert(state.sidebar.right <= state.stage.left + 1, 'desktop/tablet sidebar must reserve width beside board')
  assert(state.canvas.width >= 200 && state.canvas.height >= 200, 'board must remain directly playable')
  assert(state.overflow === 0, 'layout must not overflow horizontally')
  assert(state.scoreVisible, 'score must remain visible')
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL, { waitUntil: 'networkidle' })

  let current = await layout(page)
  assertNoOverlap(current, false)
  assert(!current.toggleVisible && current.panelDisplay !== 'none' && !current.panelInert, 'desktop controls stay visible in sidebar')
  result.desktop = current

  await page.locator('details').evaluate((node) => { node.open = true })
  await page.locator('[data-cell-id="1"]').click()
  await page.locator('[data-layer="middle"]').click()
  await page.locator('details').evaluate((node) => { node.open = false })
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert(box, 'canvas bounds')
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.62, { steps: 8 })
  await page.mouse.up()
  await page.mouse.wheel(0, -450)
  await page.mouse.move(2, 2)
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(1000)
  const beforeResize = await canvas.getAttribute('data-camera-state')
  assert(beforeResize, 'camera state is observable')

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(150)
    current = await layout(page)
    assertNoOverlap(current, true)
    assert(current.toggleVisible && current.expanded === 'false' && current.panelDisplay === 'none' && current.panelInert, 'phone controls drawer is collapsed by default')
    assert(await page.locator('[data-cell-id="1"]').textContent() === 'X', 'resize preserves game state')
    assert(await page.locator('[data-layer="middle"]').getAttribute('aria-pressed') === 'true', 'resize preserves selected layer')
    result[`${width}x${height}`] = current
  }

  const boardBeforeDrawer = await page.locator('[data-cell-id]').allTextContents()
  await page.locator('[data-controls-toggle]').click()
  current = await layout(page)
  assertNoOverlap(current, true)
  assert(current.expanded === 'true' && current.panelDisplay !== 'none' && !current.panelInert, 'Game controls opens the drawer')
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-controls-panel')), 'drawer receives focus')
  assert(JSON.stringify(await page.locator('[data-cell-id]').allTextContents()) === JSON.stringify(boardBeforeDrawer), 'drawer does not mutate game state')
  await page.keyboard.press('Escape')
  current = await layout(page)
  assert(current.expanded === 'false' && current.panelDisplay === 'none' && current.panelInert, 'Escape collapses drawer')
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-controls-toggle')), 'drawer returns focus to toggle')

  for (const [width, height] of [[768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(200)
    current = await layout(page)
    assertNoOverlap(current, false)
    assert(!current.toggleVisible && current.panelDisplay !== 'none' && !current.panelInert, 'tablet/desktop controls remain in reserved sidebar')
    assert(await page.locator('[data-cell-id="1"]').textContent() === 'X', 'live resize preserves game state')
    assert(await page.locator('[data-layer="middle"]').getAttribute('aria-pressed') === 'true', 'live resize preserves layer')
    result[`${width}x${height}`] = current
  }

  await page.mouse.move(2, 2)
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForTimeout(1000)
  const afterResize = await canvas.getAttribute('data-camera-state')
  const beforeVector = beforeResize.split(',').map(Number)
  const afterVector = afterResize?.split(',').map(Number) ?? []
  const cameraDrift = Math.hypot(...beforeVector.map((value, index) => value - afterVector[index]))
  const beforeRadius = Math.hypot(...beforeVector)
  const afterRadius = Math.hypot(...afterVector)
  result.cameraState = { beforeResize, afterResize, cameraDrift, radiusDrift: Math.abs(beforeRadius - afterRadius) }
  assert(cameraDrift < 0.02 && Math.abs(beforeRadius - afterRadius) < 0.001, 'live resize preserves camera orientation and zoom')
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({ verdict: 'PASS', result }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: error.message, errors, result }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
