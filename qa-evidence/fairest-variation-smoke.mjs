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

  assert(await page.locator('[data-variation]').count() === 0, 'no variation selector is user-reachable')
  assert(await page.locator('[data-ruleset-name]').textContent() === 'Most Three in a Row Lines Wins', 'single ruleset title')
  const boardBeforeHelp = await page.locator('[data-cell-id]').allTextContents()
  await page.locator('[data-how-to-play]').click()
  const dialog = page.locator('[data-rules-dialog]')
  assert(await dialog.isVisible(), 'How to play opens a modal dialog')
  const dialogText = await dialog.textContent()
  for (const phrase of ['center', '13 marks', 'one cell', 'does not end', '49', 'draw']) {
    assert(dialogText.toLowerCase().includes(phrase), `instructions cover ${phrase}`)
  }
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-close-rules')), 'dialog takes focus')
  await page.keyboard.press('Tab')
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-close-rules')), 'dialog contains forward focus')
  await page.keyboard.press('Shift+Tab')
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-close-rules')), 'dialog contains backward focus')
  await page.keyboard.press('Escape')
  assert(!(await dialog.isVisible()), 'Escape closes instructions')
  assert(await page.evaluate(() => document.activeElement?.hasAttribute('data-how-to-play')), 'focus returns to How to play')
  assert(JSON.stringify(await page.locator('[data-cell-id]').allTextContents()) === JSON.stringify(boardBeforeHelp), 'instructions never mutate game state')
  await page.locator('details').evaluate((node) => { node.open = true })

  const snapshot = () => page.evaluate(() => ({
    variation: document.querySelector('[data-active-rules]')?.getAttribute('data-active-rules'),
    status: document.querySelector('[data-testid="game-status"]')?.textContent,
    score: document.querySelector('[data-line-score]')?.textContent,
    scoreHidden: document.querySelector('[data-fairest-scoreboard]')?.hidden,
    progress: document.querySelector('[data-mark-progress]')?.textContent,
    scoringPulses: document.querySelector('canvas')?.getAttribute('data-scoring-pulses'),
    restriction: document.querySelector('[data-restriction-status]')?.textContent,
    enabled: [...document.querySelectorAll('[data-cell-id]')].filter((node) => !node.disabled).length,
    locked: document.querySelectorAll('[data-locked="true"]').length,
    board: [...document.querySelectorAll('[data-cell-id]')].map((node) => node.textContent),
    live: document.querySelector('[data-live-status]')?.textContent,
  }))

  let state = await snapshot()
  assert(state.variation === 'fairest' && state.status === "X's turn", 'Fairest selector must reset to X')
  assert(state.enabled === 26 && state.locked === 1, 'only center is restricted on X move one')
  assert(state.score === 'X lines 0 · O lines 0' && state.progress === 'Marks: X 0/13 · O 0/13' && !state.scoreHidden, 'score chips and placement progress must persist')
  assert(state.restriction?.includes('unlocks for O on move 2'), 'Fairest opening rule copy')

  await page.locator('[data-layer="middle"]').click()
  await page.locator('details').evaluate((node) => { node.open = false })
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert(box, 'canvas bounding box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const rejected = await snapshot()
  result.openingBefore = state
  result.openingRejected = rejected
  assert(rejected.board.join('') === state.board.join('') && rejected.status === state.status && rejected.score === state.score, 'rejected X center must change nothing')

  await page.locator('[data-layer="all"]').click()
  await page.locator('details').evaluate((node) => { node.open = true })
  await page.locator('[data-cell-id="1"]').click()
  state = await snapshot()
  assert(state.status === "O's turn" && state.enabled === 26 && state.locked === 0, 'center unlocks for O on ply two')
  await page.locator('[data-cell-id="13"]').click()
  assert((await snapshot()).board[13] === 'O', 'O may occupy center on move two')

  await page.locator('[data-testid="reset-game"]').click()
  for (const id of [0, 3, 1, 4, 2]) await page.locator(`[data-cell-id="${id}"]`).click()
  state = await snapshot()
  assert(state.score === 'X lines 1 · O lines 0' && state.status === "O's turn" && state.scoringPulses === '1', 'early line increments score and pulses without ending play')
  result.earlyLine = state

  await page.locator('[data-testid="reset-game"]').click()
  for (let id = 0; id < 26; id += 1) await page.locator(`[data-cell-id="${id}"]`).click()
  state = await snapshot()
  assert(state.status === 'X wins — 9 lines to 6' && state.score === 'X lines 9 · O lines 6' && state.progress === 'Marks: X 13/13 · O 13/13', 'higher final score wins with explicit summary')
  assert(state.board.filter((cell) => cell === 'X').length === 13 && state.board.filter((cell) => cell === 'O').length === 13, 'final board has 13 marks each')
  assert(state.board.filter((cell) => cell === '·').length === 1 && state.board[26] === '·' && state.enabled === 0, 'exactly one cell remains empty and game locks')
  result.finalWinner = state

  await page.locator('[data-testid="reset-game"]').click()
  const drawSequence = [3, 1, 5, 2, 6, 4, 8, 7, 9, 10, 11, 16, 12, 18, 13, 20, 14, 21, 15, 22, 17, 23, 19, 24, 26, 25]
  for (const id of drawSequence) await page.locator(`[data-cell-id="${id}"]`).click()
  state = await snapshot()
  assert(state.status === 'Draw — 6 lines each' && state.score === 'X lines 6 · O lines 6', 'equal final scores draw with explicit summary')
  result.finalDraw = state

  await page.locator('[data-testid="reset-game"]').click()
  await page.locator('[data-mode="bot"]').click()
  await page.locator('[data-cell-id="1"]').click()
  await page.waitForTimeout(450)
  state = await snapshot()
  assert(state.board[1] === 'X' && state.board[13] === 'O' && state.status === "X's turn", 'Fairest bot replies automatically and may take center as O')
  await page.locator('[data-human-side]').selectOption('O')
  await page.waitForTimeout(450)
  state = await snapshot()
  assert(state.board[13] !== 'X' && state.board.filter((cell) => cell === 'X').length === 1 && state.status === "O's turn", 'Fairest bot obeys X first-move center restriction')
  result.bot = state

  assert(errors.length === 0, `browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({ verdict: 'PASS', result }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: error.message, errors, result }, null, 2))
  process.exitCode = 1
} finally {
  await browser.close()
}
