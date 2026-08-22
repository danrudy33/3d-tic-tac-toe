import type { CellId } from './coordinates'

export type LayerSelection = 'all' | 'front' | 'middle' | 'back'

export const LAYER_ORDER: readonly LayerSelection[] = ['all', 'front', 'middle', 'back']

const LAYER_INDEX: Readonly<Record<Exclude<LayerSelection, 'all'>, number>> = {
  back: 0,
  middle: 1,
  front: 2,
}

export function cellIsInLayer(cellId: number, layer: LayerSelection): boolean {
  return layer === 'all' || Math.floor(cellId / 9) === LAYER_INDEX[layer]
}

export function layerCellIds(layer: LayerSelection): CellId[] {
  const ids: CellId[] = []
  for (let id = 0; id < 27; id += 1) {
    if (cellIsInLayer(id, layer)) ids.push(id as CellId)
  }
  return ids
}

export function cycleLayer(layer: LayerSelection, direction: -1 | 1): LayerSelection {
  const index = LAYER_ORDER.indexOf(layer)
  return LAYER_ORDER[(index + direction + LAYER_ORDER.length) % LAYER_ORDER.length]
}

export function layerLabel(layer: LayerSelection): string {
  return layer === 'all' ? 'All layers' : `${layer[0].toUpperCase()}${layer.slice(1)} layer`
}
