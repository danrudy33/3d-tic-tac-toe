import { describe, expect, it } from 'vitest'
import { chooseBotMove, legalMoves } from './bot'
import { createInitialState, type Cell, type GameState } from './state'

const stateWith = (
  marks: ReadonlyArray<readonly [number, Exclude<Cell, null>]>,
  currentPlayer: 'X' | 'O',
  moveCount = 8,
): GameState => {
  const board = Array<Cell>(27).fill(null)
  for (const [id, player] of marks) board[id] = player
  return { ...createInitialState(), board, currentPlayer, moveCount }
}

describe('deterministic bot', () => {
  it('uses only legal unrestricted cells during the opening', () => {
    const state = createInitialState()
    expect(legalMoves(state)).toEqual([1, 3, 4, 5, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19, 21, 22, 23, 25])
    expect(chooseBotMove(state)).toBe(1)
  })

  it('takes an immediate winning move', () => {
    const state = stateWith([[0, 'X'], [1, 'X'], [4, 'O'], [5, 'O']], 'X')
    expect(chooseBotMove(state)).toBe(2)
  })

  it('blocks the opponent immediate win', () => {
    const state = stateWith([[0, 'O'], [1, 'O'], [4, 'X']], 'X')
    expect(chooseBotMove(state)).toBe(2)
  })

  it('prefers the center, then corners, after opening restrictions lift', () => {
    expect(chooseBotMove(stateWith([], 'X'))).toBe(13)
    expect(chooseBotMove(stateWith([[13, 'O']], 'X'))).toBe(0)
  })

  it('uses Fairest opening legality and allows center immediately after X moves', () => {
    const initial = createInitialState('fairest')
    expect(legalMoves(initial)).toEqual(Array.from({ length: 27 }, (_, id) => id).filter((id) => id !== 13))
    expect(chooseBotMove(initial)).not.toBe(13)
    const afterX = { ...initial, board: initial.board.map((cell, id) => id === 1 ? 'X' as const : cell), currentPlayer: 'O' as const, moveCount: 1 }
    expect(legalMoves(afterX)).toContain(13)
  })

  it('maximizes immediate line gain in Fairest mode instead of stopping at the first line', () => {
    const state = {
      ...stateWith([[0, 'X'], [1, 'X'], [3, 'X'], [5, 'X'], [7, 'X'], [9, 'O']], 'X'),
      variation: 'fairest' as const,
    }
    expect(chooseBotMove(state)).toBe(4)
  })

  it('returns no move after the game ends', () => {
    const won = { ...createInitialState(), status: 'won' as const, winner: 'X' as const }
    expect(chooseBotMove(won)).toBeNull()
    expect(legalMoves(won)).toEqual([])
  })
})
