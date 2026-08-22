import { lineScores } from './selectors'
import type { GameState } from './state'

export function gameStatusText(state: GameState): string {
  if (state.variation === 'fairest' && state.status !== 'playing') {
    const scores = lineScores(state.board)
    if (state.status === 'draw') return `Draw — ${scores.X} ${scores.X === 1 ? 'line' : 'lines'} each`
    const winner = state.winner ?? 'X'
    const winnerScore = scores[winner]
    const loserScore = scores[winner === 'X' ? 'O' : 'X']
    return `${winner} wins — ${winnerScore} ${winnerScore === 1 ? 'line' : 'lines'} to ${loserScore}`
  }
  if (state.status === 'won') return `${state.winner} wins`
  if (state.status === 'draw') return 'Draw'
  return `${state.currentPlayer}'s turn`
}
