import { describe, expect, it } from 'vitest'
import { cellIsInLayer, cycleLayer, layerCellIds, type LayerSelection } from './layers'

describe('layer selection', () => {
  it.each([
    ['back', [0, 1, 2, 3, 4, 5, 6, 7, 8]],
    ['middle', [9, 10, 11, 12, 13, 14, 15, 16, 17]],
    ['front', [18, 19, 20, 21, 22, 23, 24, 25, 26]],
  ] as const)('maps %s to its canonical z plane', (layer, expected) => {
    expect(layerCellIds(layer)).toEqual(expected)
    for (let id = 0; id < 27; id += 1) {
      expect(cellIsInLayer(id, layer)).toBe(expected.some((expectedId) => expectedId === id))
    }
  })

  it('treats all as unfiltered', () => {
    expect(layerCellIds('all')).toEqual(Array.from({ length: 27 }, (_, id) => id))
    expect(Array.from({ length: 27 }, (_, id) => cellIsInLayer(id, 'all')).every(Boolean)).toBe(true)
  })

  it('cycles in segmented-control order in both directions', () => {
    const order: LayerSelection[] = ['all', 'front', 'middle', 'back']
    expect(order.map((layer) => cycleLayer(layer, 1))).toEqual(['front', 'middle', 'back', 'all'])
    expect(order.map((layer) => cycleLayer(layer, -1))).toEqual(['back', 'all', 'front', 'middle'])
  })
})
