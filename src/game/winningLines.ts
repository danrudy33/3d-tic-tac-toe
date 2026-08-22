import { cellId, coordinateFromId, type CellId } from './coordinates'

export type WinningLine = readonly [CellId, CellId, CellId]
export type LineCategory = 'axis' | 'face' | 'space'

const VALUES = [-1, 0, 1] as const
const inBounds = (value: number) => value >= -1 && value <= 1

function generateWinningLines(): readonly WinningLine[] {
  const lines = new Map<string, WinningLine>()

  for (const dx of VALUES) {
    for (const dy of VALUES) {
      for (const dz of VALUES) {
        if (dx === 0 && dy === 0 && dz === 0) continue
        const firstNonZero = [dx, dy, dz].find((value) => value !== 0)
        if (firstNonZero !== 1) continue

        for (const x of VALUES) {
          for (const y of VALUES) {
            for (const z of VALUES) {
              const previous = [x - dx, y - dy, z - dz]
              const next = [x + dx, y + dy, z + dz]
              const last = [x + 2 * dx, y + 2 * dy, z + 2 * dz]
              if (previous.every(inBounds) || !next.every(inBounds) || !last.every(inBounds)) continue

              const ids = [
                cellId({ x, y, z }),
                cellId({ x: next[0], y: next[1], z: next[2] }),
                cellId({ x: last[0], y: last[1], z: last[2] }),
              ].sort((a, b) => a - b) as [CellId, CellId, CellId]
              const frozen = Object.freeze(ids) as WinningLine
              lines.set(ids.join(','), frozen)
            }
          }
        }
      }
    }
  }

  return Object.freeze(
    [...lines.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
  )
}

export const WINNING_LINES = generateWinningLines()

export function classifyLine(line: WinningLine): LineCategory {
  const [start, middle] = line.map(coordinateFromId)
  const changingAxes = [middle.x - start.x, middle.y - start.y, middle.z - start.z]
    .filter((step) => step !== 0).length
  return changingAxes === 1 ? 'axis' : changingAxes === 2 ? 'face' : 'space'
}
