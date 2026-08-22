import { describe, expect, it } from 'vitest'
import { coordinateFromId } from './coordinates'
import { completedLines } from './selectors'
import { classifyLine, WINNING_LINES } from './winningLines'

describe('canonical winning lines', () => {
  it('generates 49 unique, valid, lexicographically sorted lines', () => {
    expect(WINNING_LINES).toHaveLength(49)
    expect(new Set(WINNING_LINES.map((line) => line.join(',')))).toHaveLength(49)
    expect([...WINNING_LINES].map(String)).toEqual([...WINNING_LINES].map(String).sort((a, b) => {
      const left = a.split(',').map(Number)
      const right = b.split(',').map(Number)
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
    }))
    for (const line of WINNING_LINES) {
      expect(new Set(line)).toHaveLength(3)
      line.forEach((id) => expect(id).toBeGreaterThanOrEqual(0))
      line.forEach((id) => expect(id).toBeLessThan(27))
    }
  })

  it('contains 27 axis, 18 face, and 4 space lines', () => {
    const counts = { axis: 0, face: 0, space: 0 }
    WINNING_LINES.forEach((line) => counts[classifyLine(line)]++)
    expect(counts).toEqual({ axis: 27, face: 18, space: 4 })
  })

  it('makes every line collinear with equal spacing', () => {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line.map(coordinateFromId)
      expect([b.x - a.x, b.y - a.y, b.z - a.z]).toEqual([
        c.x - b.x,
        c.y - b.y,
        c.z - b.z,
      ])
    }
  })

  it('recognizes every one of the 49 generated lines', () => {
    for (const line of WINNING_LINES) {
      const board = Array<'X' | null>(27).fill(null)
      line.forEach((cellId) => { board[cellId] = 'X' })
      expect(completedLines(board, 'X')).toContainEqual(line)
    }
  })

  it('proves no complete X/O assignment avoids a winning line', () => {
    const linesByCell = Array.from({ length: 27 }, () => [] as (typeof WINNING_LINES)[number][])
    for (const line of WINNING_LINES) {
      for (const cellId of line) linesByCell[cellId].push(line)
    }

    const searchOrder = Array.from({ length: 27 }, (_, cellId) => cellId)
      .sort((left, right) => linesByCell[right].length - linesByCell[left].length || left - right)
    const assignment = Array<'X' | 'O' | null>(27).fill(null)
    let survivingCompleteAssignments = 0

    const search = (index: number): void => {
      if (index === searchOrder.length) {
        survivingCompleteAssignments++
        return
      }

      const cellId = searchOrder[index]
      for (const player of ['X', 'O'] as const) {
        assignment[cellId] = player
        const completesLine = linesByCell[cellId]
          .some((line) => line.every((lineCellId) => assignment[lineCellId] === player))
        if (!completesLine) search(index + 1)
      }
      assignment[cellId] = null
    }

    search(0)

    expect(survivingCompleteAssignments).toBe(0)
  })
})
