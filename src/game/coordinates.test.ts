import { describe, expect, it } from 'vitest'
import { cellId, coordinateFromId, isCellId } from './coordinates'

describe('coordinates', () => {
  it('round-trips all 27 unique canonical cells', () => {
    const coordinates = Array.from({ length: 27 }, (_, id) => coordinateFromId(id))
    expect(new Set(coordinates.map(({ x, y, z }) => `${x},${y},${z}`))).toHaveLength(27)
    coordinates.forEach((coordinate, id) => expect(cellId(coordinate)).toBe(id))
  })

  it.each([-1, 27, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid id %s', (id) => {
    expect(isCellId(id)).toBe(false)
    expect(() => coordinateFromId(id)).toThrow(RangeError)
  })

  it('rejects invalid coordinates instead of clamping', () => {
    expect(() => cellId({ x: 2, y: 0, z: 0 })).toThrow(RangeError)
    expect(() => cellId({ x: 0.5, y: 0, z: 0 })).toThrow(RangeError)
  })
})
