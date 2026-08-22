import type { CellId } from './coordinates'
import { completedLines } from './selectors'
import { isCellRestricted, type GameState, type Player } from './state'

const PREFERRED_CELLS: readonly CellId[] = [13, 0, 2, 6, 8, 18, 20, 24, 26]

export function legalMoves(state: GameState): CellId[] {
  if (state.status !== 'playing') return []
  const moves: CellId[] = []
  for (let id = 0; id < 27; id += 1) {
    const cellId = id as CellId
    if (state.board[cellId] === null && !isCellRestricted(state, cellId)) moves.push(cellId)
  }
  return moves
}

function completesLine(state: GameState, cellId: CellId, player: Player): boolean {
  const board = [...state.board]
  board[cellId] = player
  return completedLines(board, player).length > 0
}

export function chooseBotMove(state: GameState): CellId | null {
  const moves = legalMoves(state)
  if (moves.length === 0) return null

  const opponent: Player = state.currentPlayer === 'X' ? 'O' : 'X'
  if (state.variation === 'fairest') {
    const ownLines = completedLines(state.board, state.currentPlayer).length
    const opponentLines = completedLines(state.board, opponent).length
    const preferenceRank = (cellId: CellId): number => {
      const rank = PREFERRED_CELLS.indexOf(cellId)
      return rank === -1 ? PREFERRED_CELLS.length + cellId : rank
    }
    return [...moves].sort((left, right) => {
      const score = (cellId: CellId): number => {
        const ownBoard = [...state.board]
        ownBoard[cellId] = state.currentPlayer
        const opponentBoard = [...state.board]
        opponentBoard[cellId] = opponent
        const lineGain = completedLines(ownBoard, state.currentPlayer).length - ownLines
        const blockedGain = completedLines(opponentBoard, opponent).length - opponentLines
        return lineGain * 100 + blockedGain * 20
      }
      return score(right) - score(left) || preferenceRank(left) - preferenceRank(right)
    })[0]
  }

  const winningMove = moves.find((cellId) => completesLine(state, cellId, state.currentPlayer))
  if (winningMove !== undefined) return winningMove

  const blockingMove = moves.find((cellId) => completesLine(state, cellId, opponent))
  if (blockingMove !== undefined) return blockingMove

  return PREFERRED_CELLS.find((cellId) => moves.includes(cellId)) ?? moves[0]
}
