export type AxisCoordinate = -1 | 0 | 1

export type Coordinate = Readonly<{
  x: AxisCoordinate
  y: AxisCoordinate
  z: AxisCoordinate
}>

export type CellId = number

const isAxisCoordinate = (value: number): value is AxisCoordinate =>
  Number.isInteger(value) && value >= -1 && value <= 1

export function isCellId(value: number): value is CellId {
  return Number.isInteger(value) && value >= 0 && value < 27
}

export function cellId({ x, y, z }: Readonly<{ x: number; y: number; z: number }>): CellId {
  if (![x, y, z].every(isAxisCoordinate)) {
    throw new RangeError('Coordinates must be integers from -1 to 1')
  }
  return (x + 1) + 3 * (y + 1) + 9 * (z + 1)
}

export function coordinateFromId(id: number): Coordinate {
  if (!isCellId(id)) {
    throw new RangeError('Cell id must be an integer from 0 to 26')
  }
  return {
    x: (id % 3) - 1 as AxisCoordinate,
    y: (Math.floor(id / 3) % 3) - 1 as AxisCoordinate,
    z: Math.floor(id / 9) - 1 as AxisCoordinate,
  }
}
