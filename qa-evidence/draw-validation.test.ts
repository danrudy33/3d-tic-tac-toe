import { expect, test } from 'vitest'
import { WINNING_LINES } from '../src/game/winningLines'

test('proves no legal full-board draw coloring exists', () => {
  const byCell = Array.from({ length: 27 }, () => [] as (readonly [number, number, number])[])
  for (const line of WINNING_LINES) for (const cell of line) byCell[cell].push(line)
  const order = Array.from({ length: 27 }, (_, id) => id).sort((a, b) => byCell[b].length - byCell[a].length)
  const assignment: ('X' | 'O' | null)[] = Array(27).fill(null)
  let visitedAssignments = 0

  const search = (index: number, xCount: number, oCount: number): boolean => {
    visitedAssignments++
    if (xCount > 14 || oCount > 13 || xCount + 27 - index < 14 || oCount + 27 - index < 13) return false
    if (index === 27) return xCount === 14 && oCount === 13
    const cell = order[index]
    for (const player of ['X', 'O'] as const) {
      assignment[cell] = player
      const createsLine = byCell[cell].some((line) => line.every((id) => assignment[id] === player))
      if (!createsLine && search(index + 1, xCount + Number(player === 'X'), oCount + Number(player === 'O'))) return true
    }
    assignment[cell] = null
    return false
  }

  expect(search(0, 0, 0)).toBe(false)
  console.log(`no-draw-coloring; visited-assignments=${visitedAssignments}`)
})
