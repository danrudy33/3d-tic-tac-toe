import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const errors = []
const result = {}
const assert = (condition, message) => { if (!condition) throw new Error(message) }

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.locator('details').evaluate((node) => { node.open = true })

  const snapshot = () => page.evaluate(() => ({
    status: document.querySelector('[data-testid="game-status"]')?.textContent,
    restriction: document.querySelector('[data-restriction-status]')?.textContent,
    restrictionHidden: document.querySelector('[data-restriction-status]')?.hidden,
    locked: document.querySelectorAll('[data-locked="true"]').length,
    enabled: [...document.querySelectorAll('[data-cell-id]')].filter((node) => !node.disabled).length,
    board: [...document.querySelectorAll('[data-cell-id]')].map((node) => node.textContent),
    localPressed: document.querySelector('[data-mode="local"]')?.getAttribute('aria-pressed'),
    botPressed: document.querySelector('[data-mode="bot"]')?.getAttribute('aria-pressed'),
  }))

  let state = await snapshot()
  assert(state.locked === 1 && state.enabled === 26, 'opening must lock only center from X')
  assert(state.restriction === 'X cannot play the center on move 1; it unlocks for O on move 2.', 'opening restriction')
  result.opening = state

  await page.locator('[data-layer="middle"]').click()
  const canvasBox = await page.locator('canvas').boundingBox()
  assert(canvasBox, 'canvas bounding box')
  await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2)
  const rejected = await snapshot()
  assert(rejected.restriction === state.restriction && rejected.board.join('') === state.board.join(''), 'rejected locked selection must not advance visible progress')
  result.rejectedLock = rejected

  await page.locator('[data-layer="all"]').click()
  await page.locator('[data-cell-id="1"]').click()
  state = await snapshot()
  assert(state.locked === 0 && state.enabled === 26 && state.restrictionHidden, 'center unlocks immediately for O')
  assert(await page.locator('[data-cell-id="13"]').isEnabled(), 'center must unlock on ply two')
  result.unlocked = state

  await page.locator('[data-mode="bot"]').click()
  state = await snapshot()
  assert(state.botPressed === 'true' && state.localPressed === 'false', 'bot mode must activate')
  assert(await page.locator('[data-human-side]').isVisible(), 'human-side selector must be visible')
  await page.locator('[data-cell-id="1"]').click()
  await page.waitForTimeout(450)
  state = await snapshot()
  assert(state.board[1] === 'X' && state.board[13] === 'O', 'deterministic legal bot reply for human X')
  assert(state.status === "X's turn" && state.locked === 0 && state.restriction === '', 'turn must return to human after bot reply')
  result.humanX = state

  await page.locator('[data-human-side]').selectOption('O')
  await page.waitForTimeout(450)
  state = await snapshot()
  assert(state.board[0] === 'X' && state.board[13] !== 'X' && state.status === "O's turn", 'bot must open automatically and avoid center as X')
  await page.locator('[data-cell-id="3"]').click()
  await page.waitForTimeout(450)
  state = await snapshot()
  assert(state.board[3] === 'O' && state.board.filter((cell) => cell === 'X').length === 2 && state.status === "O's turn", 'bot must reply automatically and legally')
  result.humanO = state

  await page.locator('[data-mode="local"]').click()
  state = await snapshot()
  assert(state.localPressed === 'true' && state.enabled === 26 && state.locked === 1 && state.board.every((cell) => cell === '🔒' || cell === '·'), 'switching to local resets cleanly')
  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`)
  result.localReset = state
  console.log(JSON.stringify({ verdict: 'PASS', result }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: error.message, errors, result }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
