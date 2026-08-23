import { chromium } from 'playwright'
import * as THREE from 'three'

const browser = await chromium.launch({ headless: true })
const errors = []
const result = {}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const baseURL = 'http://127.0.0.1:5173/'

const snapshot = (page) => page.evaluate(() => ({
  selection: document.querySelector('[data-layer-status]')?.textContent,
  live: document.querySelector('[data-live-status]')?.textContent,
  status: document.querySelector('[data-testid="game-status"]')?.textContent,
  enabled: [...document.querySelectorAll('[data-cell-id]')].filter((node) => !node.disabled).length,
  outside: document.querySelectorAll('[data-outside-layer="true"]').length,
  board: [...document.querySelectorAll('[data-cell-id]')].map((node) => node.textContent),
  pressed: document.querySelector('[data-layer][aria-pressed="true"]')?.getAttribute('data-layer'),
}))

function projectedPoint(cellId, box) {
  const camera = new THREE.PerspectiveCamera(42, box.width / box.height, 0.1, 100)
  camera.position.set(5.2, 4.6, 5.2)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const x = (cellId % 3) - 1
  const y = (Math.floor(cellId / 3) % 3) - 1
  const z = Math.floor(cellId / 9) - 1
  const projected = new THREE.Vector3(x * 1.35, y * 1.35, z * 1.35).project(camera)
  return {
    x: box.x + ((projected.x + 1) / 2) * box.width,
    y: box.y + ((1 - projected.y) / 2) * box.height,
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(baseURL, { waitUntil: 'networkidle' })

  const desktopControl = await page.evaluate(() => {
    const group = document.querySelector('.layer-controls')
    const labelId = group?.getAttribute('aria-labelledby')
    const label = labelId ? document.getElementById(labelId) : null
    const bounds = group?.getBoundingClientRect()
    return {
      label: label?.textContent,
      accessibleName: label?.textContent,
      width: bounds?.width,
      buttonHeights: [...document.querySelectorAll('.layer-controls button')].map((button) => button.getBoundingClientRect().height),
    }
  })
  assert(desktopControl.label === 'Select layer for easier placement' && desktopControl.accessibleName === desktopControl.label, 'visible and accessible layer labels must match')
  assert(desktopControl.buttonHeights.every((height) => height === 32) && (desktopControl.width ?? 999) < 270, 'desktop layer control must be compact with 32px buttons')
  result.desktopControl = desktopControl

  let state = await snapshot(page)
  assert(state.selection === 'Selecting: All layers' && state.enabled === 26, 'All must be the initial unfiltered mode')
  await page.locator('[data-layer="middle"]').click()
  state = await snapshot(page)
  assert(state.selection === 'Selecting: Middle layer' && state.pressed === 'middle', 'Middle control and persistent status')
  assert(state.enabled === 8 && state.outside === 18, 'Middle must expose only its eight opening-legal cells')

  await page.locator('details').evaluate((node) => { node.open = true })
  await page.locator('[data-cell-id="9"]').click()
  const afterMove = await snapshot(page)
  assert(afterMove.board[9] === 'X' && afterMove.status === "O's turn", 'focused semantic selection places in active plane')
  await page.locator('[data-layer="front"]').click()
  await page.locator('[data-layer="all"]').click()
  state = await snapshot(page)
  assert(state.board.join('') === afterMove.board.join('') && state.status === afterMove.status, 'filter changes must preserve game state')
  result.statePreservation = state

  await page.locator('[data-testid="reset-game"]').click()
  await page.keyboard.press(']')
  assert((await snapshot(page)).selection === 'Selecting: Front layer', '] cycles to Front')
  await page.keyboard.press(']')
  assert((await snapshot(page)).selection === 'Selecting: Middle layer', '] cycles to Middle')
  await page.keyboard.press(']')
  assert((await snapshot(page)).selection === 'Selecting: Back layer', '] cycles to Back')
  await page.keyboard.press(']')
  assert((await snapshot(page)).selection === 'Selecting: All layers', '] wraps to All')
  await page.keyboard.press('[')
  state = await snapshot(page)
  assert(state.selection === 'Selecting: Back layer' && state.live === 'Selecting: Back layer', '[ cycles backward and announces')
  result.shortcuts = state

  await page.locator('[data-layer="all"]').click()
  await page.locator('details').evaluate((node) => { node.open = true })
  for (const id of [1, 3, 5, 7, 9, 10, 12, 14]) await page.locator(`[data-cell-id="${id}"]`).click()
  await page.locator('details').evaluate((node) => { node.open = false })
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert(box, 'canvas bounding box')

  for (const [layer, cellId, expectedMark] of [['back', 4, 'X'], ['middle', 13, 'O'], ['front', 22, 'X']]) {
    await page.locator(`[data-layer="${layer}"]`).click()
    const point = projectedPoint(cellId, box)
    await page.mouse.click(point.x, point.y)
    const mark = await page.locator(`[data-cell-id="${cellId}"]`).textContent()
    assert(mark === expectedMark, `${layer} plane center must be directly raycast-selectable`)
  }
  result.layerCenters = await snapshot(page)

  await page.setViewportSize({ width: 320, height: 568 })
  await page.waitForTimeout(100)
  await page.locator('[data-controls-toggle]').click()
  await page.waitForTimeout(50)
  const mobile = await page.evaluate(() => {
    const group = document.querySelector('.layer-controls')?.getBoundingClientRect()
    const buttons = [...document.querySelectorAll('.layer-controls button')].map((button) => button.getBoundingClientRect())
    return {
      groupWidth: group?.width,
      viewportWidth: innerWidth,
      buttonHeights: buttons.map((rect) => rect.height),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  assert((mobile.groupWidth ?? 0) > 250 && mobile.buttonHeights.every((height) => height >= 44), 'mobile layer control must be full-width with 44px targets')
  assert(mobile.horizontalOverflow === 0, 'mobile layer control must not overflow')
  result.mobile = mobile

  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({ verdict: 'PASS', result }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: error.message, errors, result }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
