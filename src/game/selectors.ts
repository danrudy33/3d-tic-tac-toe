import type { Cell } from './state'
import { WINNING_LINES, type WinningLine } from './winningLines'

export function completedLines(board: readonly Cell[], player: Exclude<Cell, null>): readonly WinningLine[] {
  return WINNING_LINES.filter((line) => line.every((cellId) => board[cellId] === player))
}

export type LineScores = Readonly<{ X: number; O: number }>

export function lineScores(board: readonly Cell[]): LineScores {
  return {
    X: completedLines(board, 'X').length,
    O: completedLines(board, 'O').length,
  }
}
