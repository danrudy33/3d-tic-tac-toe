import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { coordinateFromId, cellId, type CellId, type Coordinate } from '../game/coordinates'
import { cellIsInLayer, layerCellIds, type LayerSelection } from '../game/layers'
import { completedLines } from '../game/selectors'
import {
  isCellRestricted,
  OPENING_RESTRICTION_PLIES,
  type GameState,
  type Player,
} from '../game/state'

const CELL_SPACING = 1.35
const HIT_SIZE = 1.08
const GUIDE_EXTENT = 1.89
const DRAG_THRESHOLD = 6

export type BoardInteraction = Readonly<{
  onPlace: (cellId: CellId) => void
  onHover: (cellId: CellId | null) => void
  onCursor: (cellId: CellId) => void
}>

export class BoardView {
  readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  private readonly controls: OrbitControls
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly hitTargets: THREE.Mesh[] = []
  private readonly marks = new THREE.Group()
  private readonly locks = new THREE.Group()
  private readonly effects = new THREE.Group()
  private readonly layerFocusGuide = new THREE.Group()
  private readonly scorePulses = new THREE.Group()
  private readonly hoverMesh: THREE.Mesh
  private readonly guideMaterials: THREE.LineBasicMaterial[] = []
  private readonly reducedMotion: boolean
  private unlockFadeStart: number | null = null
  private scorePulseStart: number | null = null
  private state: GameState
  private layer: LayerSelection = 'all'
  private keyboardCell: CellId = 13
  private pointerStart: { x: number; y: number } | null = null
  private dragging = false
  private resizeObserver: ResizeObserver

  constructor(canvas: HTMLCanvasElement, state: GameState, interaction: BoardInteraction) {
    this.canvas = canvas
    this.state = state
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x0b1020)
    this.camera.position.set(5.2, 4.6, 5.2)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    this.controls.minDistance = 5.8
    this.controls.maxDistance = 12
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(35)
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(82)
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.controls.enableDamping = !this.reducedMotion
    this.controls.dampingFactor = 0.08
    this.controls.update()

    this.scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x151d31, 1.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 2)
    keyLight.position.set(5, 8, 6)
    this.scene.add(keyLight)
    this.scene.add(this.marks, this.locks, this.effects, this.layerFocusGuide, this.scorePulses)
    this.createGuides()
    this.createLayerFocusGuide()
    this.createHitTargets()

    this.hoverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x8debca, wireframe: true, transparent: true, opacity: 0.9 }),
    )
    this.hoverMesh.visible = false
    this.effects.add(this.hoverMesh)

    canvas.addEventListener('pointerdown', (event) => {
      this.pointerStart = { x: event.clientX, y: event.clientY }
      this.dragging = false
      canvas.style.cursor = 'grabbing'
    })
    canvas.addEventListener('pointermove', (event) => {
      if (this.pointerStart) {
        this.dragging ||= Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > DRAG_THRESHOLD
      }
      if (!this.dragging) this.updatePointerHover(event, interaction)
    })
    canvas.addEventListener('pointerleave', () => {
      this.pointerStart = null
      this.dragging = false
      this.setHover(null, false)
      interaction.onHover(null)
      canvas.style.cursor = 'grab'
    })
    canvas.addEventListener('pointerup', (event) => {
      const shouldPlace = this.pointerStart !== null && !this.dragging
      this.pointerStart = null
      this.dragging = false
      const picked = this.pick(event)
      canvas.style.cursor = picked !== null && this.state.board[picked] === null && !isCellRestricted(this.state, picked) ? 'pointer' : 'grab'
      if (shouldPlace && picked !== null) interaction.onPlace(picked)
    })

    canvas.addEventListener('keydown', (event) => {
      const coordinate = coordinateFromId(this.keyboardCell)
      const next = this.keyboardCoordinate(coordinate, event.key)
      if (next) {
        event.preventDefault()
        this.keyboardCell = cellId(next)
        this.setHover(this.keyboardCell, true)
        interaction.onCursor(this.keyboardCell)
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        interaction.onPlace(this.keyboardCell)
      }
    })
    canvas.addEventListener('focus', () => {
      this.setHover(this.keyboardCell, true)
      interaction.onCursor(this.keyboardCell)
    })
    canvas.addEventListener('blur', () => this.setHover(null, false))

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
    this.sync(state)
    this.animate()
  }

  sync(state: GameState): void {
    const previousState = this.state
    const restrictionsWereActive = previousState.status === 'playing' && previousState.moveCount < OPENING_RESTRICTION_PLIES
    const scoringMove = state.variation === 'fairest' && state.moveCount > previousState.moveCount
    this.state = state
    if (scoringMove) {
      const previousKeys = new Set([
        ...completedLines(previousState.board, 'X'),
        ...completedLines(previousState.board, 'O'),
      ].map((line) => line.join(',')))
      const newLines = [
        ...completedLines(state.board, 'X').map((line) => ({ line, player: 'X' as const })),
        ...completedLines(state.board, 'O').map((line) => ({ line, player: 'O' as const })),
      ].filter(({ line }) => !previousKeys.has(line.join(',')))
      this.scorePulses.clear()
      newLines.forEach(({ line, player }) => this.addScorePulse(line, player))
      if (newLines.length > 0) this.canvas.dataset.scoringPulses = String(newLines.length)
      else delete this.canvas.dataset.scoringPulses
      this.scorePulseStart = newLines.length > 0 ? performance.now() : null
    }
    this.marks.clear()
    this.effects.children.filter((child) => child !== this.hoverMesh).forEach((child) => this.effects.remove(child))
    const focused = this.layer !== 'all'
    this.guideMaterials.forEach((material) => {
      material.opacity = focused ? 0.1 : state.status === 'won' && state.variation === 'classic' ? 0.25 : 0.45
    })
    this.layerFocusGuide.visible = focused
    if (focused) {
      const centerId = layerCellIds(this.layer)[4]
      this.layerFocusGuide.position.z = coordinateFromId(centerId).z * CELL_SPACING
    }

    if (state.status === 'playing' && state.moveCount < OPENING_RESTRICTION_PLIES) {
      this.locks.clear()
      this.unlockFadeStart = null
      state.board.forEach((_cell, id) => {
        if (!isCellRestricted(state, id)) return
        const lock = this.createLockMarker()
        const { x, y, z } = coordinateFromId(id)
        lock.position.set(x * CELL_SPACING, y * CELL_SPACING, z * CELL_SPACING)
        if (!cellIsInLayer(id, this.layer)) lock.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          const material = object.material as THREE.MeshBasicMaterial
          const fadedOpacity = Number(material.userData.baseOpacity ?? material.opacity) * 0.25
          material.userData.baseOpacity = fadedOpacity
          material.opacity = fadedOpacity
        })
        this.locks.add(lock)
      })
    } else if (restrictionsWereActive && !this.reducedMotion && this.locks.children.length > 0) {
      this.unlockFadeStart = performance.now()
    } else {
      this.locks.clear()
      this.unlockFadeStart = null
    }

    state.board.forEach((player, id) => {
      if (!player) return
      const winning = state.winningLine?.includes(id) ?? false
      const mark = this.createMark(player, winning)
      const { x, y, z } = coordinateFromId(id)
      mark.position.set(x * CELL_SPACING, y * CELL_SPACING, z * CELL_SPACING)
      if (state.status === 'won' && state.variation === 'classic' && !winning) mark.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material.transparent = true
          object.material.opacity = 0.55
        }
      })
      if (!cellIsInLayer(id, this.layer)) mark.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material.transparent = true
          object.material.opacity = 0.25
        }
      })
      this.marks.add(mark)
    })

    if (state.winningLine) this.addWinningLine(state.winningLine)
    if (state.status !== 'playing') this.setHover(null, false)
  }

  setLayer(layer: LayerSelection): void {
    if (layer === this.layer) return
    this.layer = layer
    if (!cellIsInLayer(this.keyboardCell, layer)) this.keyboardCell = layerCellIds(layer)[4]
    this.setHover(null, false)
    this.sync(this.state)
  }

  focusCell(id: CellId): void {
    if (!cellIsInLayer(id, this.layer)) return
    this.keyboardCell = id
    this.setHover(id, true)
  }

  private createGuides(): void {
    const positions = [-GUIDE_EXTENT, -CELL_SPACING / 2, CELL_SPACING / 2, GUIDE_EXTENT]
    for (const y of [-CELL_SPACING, 0, CELL_SPACING]) {
      const points: THREE.Vector3[] = []
      for (const offset of positions) {
        points.push(new THREE.Vector3(-GUIDE_EXTENT, y, offset), new THREE.Vector3(GUIDE_EXTENT, y, offset))
        points.push(new THREE.Vector3(offset, y, -GUIDE_EXTENT), new THREE.Vector3(offset, y, GUIDE_EXTENT))
      }
      const material = new THREE.LineBasicMaterial({ color: 0x71809a, transparent: true, opacity: 0.45 })
      this.guideMaterials.push(material)
      this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material))
    }
    const connectorPoints: THREE.Vector3[] = []
    for (const x of positions) for (const z of positions) {
      if (x !== -GUIDE_EXTENT && x !== GUIDE_EXTENT && z !== -GUIDE_EXTENT && z !== GUIDE_EXTENT) continue
      connectorPoints.push(new THREE.Vector3(x, -CELL_SPACING, z), new THREE.Vector3(x, CELL_SPACING, z))
    }
    const connectorMaterial = new THREE.LineBasicMaterial({ color: 0x71809a, transparent: true, opacity: 0.2 })
    this.guideMaterials.push(connectorMaterial)
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(connectorPoints), connectorMaterial))
  }

  private createLayerFocusGuide(): void {
    const positions = [-GUIDE_EXTENT, -CELL_SPACING / 2, CELL_SPACING / 2, GUIDE_EXTENT]
    const points: THREE.Vector3[] = []
    for (const offset of positions) {
      points.push(new THREE.Vector3(-GUIDE_EXTENT, offset, 0), new THREE.Vector3(GUIDE_EXTENT, offset, 0))
      points.push(new THREE.Vector3(offset, -GUIDE_EXTENT, 0), new THREE.Vector3(offset, GUIDE_EXTENT, 0))
    }
    const material = new THREE.LineBasicMaterial({
      color: 0x5dd6ff,
      transparent: true,
      opacity: 0.86,
      depthTest: false,
    })
    const guide = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material)
    guide.renderOrder = 2
    this.layerFocusGuide.add(guide)
    this.layerFocusGuide.visible = false
  }

  private createHitTargets(): void {
    const geometry = new THREE.BoxGeometry(HIT_SIZE, HIT_SIZE, HIT_SIZE)
    for (let id = 0; id < 27; id++) {
      const { x, y, z } = coordinateFromId(id)
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      mesh.position.set(x * CELL_SPACING, y * CELL_SPACING, z * CELL_SPACING)
      mesh.userData.cellId = id
      this.hitTargets.push(mesh)
      this.scene.add(mesh)
    }
  }

  private createLockMarker(): THREE.Group {
    const group = new THREE.Group()
    const cageMaterial = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
      depthWrite: false,
    })
    cageMaterial.userData.baseOpacity = 0.16
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), cageMaterial))

    const lockMaterial = new THREE.MeshBasicMaterial({
      color: 0xaab5c5,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
    lockMaterial.userData.baseOpacity = 0.72
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.11), lockMaterial)
    body.position.y = -0.08
    group.add(body)
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 20, Math.PI), lockMaterial.clone())
    shackle.material.userData.baseOpacity = 0.72
    shackle.position.y = 0.1
    group.add(shackle)
    return group
  }

  private createMark(player: Player, winning: boolean): THREE.Group {
    const group = new THREE.Group()
    const color = winning ? 0xf8e16c : player === 'X' ? 0x5dd6ff : 0xffb454
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, emissive: winning ? 0x554800 : 0x000000 })
    if (player === 'X') {
      const geometry = new THREE.BoxGeometry(0.16, 1, 0.16)
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(geometry, material.clone())
        bar.rotation.z = angle
        group.add(bar)
      }
    } else {
      group.add(new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.1, 16, 40), material))
    }
    return group
  }

  private addScorePulse(line: readonly [CellId, CellId, CellId], player: Player): void {
    const startCoordinate = coordinateFromId(line[0])
    const endCoordinate = coordinateFromId(line[2])
    const start = new THREE.Vector3(startCoordinate.x, startCoordinate.y, startCoordinate.z).multiplyScalar(CELL_SPACING)
    const end = new THREE.Vector3(endCoordinate.x, endCoordinate.y, endCoordinate.z).multiplyScalar(CELL_SPACING)
    const direction = end.clone().sub(start)
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, direction.length() + 0.28, 12),
      new THREE.MeshBasicMaterial({
        color: player === 'X' ? 0x5dd6ff : 0xffb454,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    )
    cylinder.position.copy(start).add(end).multiplyScalar(0.5)
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    cylinder.scale.setScalar(0.85)
    cylinder.renderOrder = 4
    this.scorePulses.add(cylinder)
  }

  private addWinningLine(line: readonly [CellId, CellId, CellId]): void {
    const startCoordinate = coordinateFromId(line[0])
    const endCoordinate = coordinateFromId(line[2])
    const start = new THREE.Vector3(startCoordinate.x, startCoordinate.y, startCoordinate.z).multiplyScalar(CELL_SPACING)
    const end = new THREE.Vector3(endCoordinate.x, endCoordinate.y, endCoordinate.z).multiplyScalar(CELL_SPACING)
    const direction = end.clone().sub(start)
    const length = direction.length() + 0.36
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, length, 16),
      new THREE.MeshBasicMaterial({ color: 0xf8e16c }),
    )
    cylinder.position.copy(start).add(end).multiplyScalar(0.5)
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    this.effects.add(cylinder)
  }

  private pick(event: PointerEvent): CellId | null {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const targets = this.layer === 'all'
      ? this.hitTargets
      : this.hitTargets.filter((target) => cellIsInLayer(target.userData.cellId as number, this.layer))
    return (this.raycaster.intersectObjects(targets, false)[0]?.object.userData.cellId as CellId | undefined) ?? null
  }

  private updatePointerHover(event: PointerEvent, interaction: BoardInteraction): void {
    const id = this.pick(event)
    const valid = id !== null
      && cellIsInLayer(id, this.layer)
      && this.state.status === 'playing'
      && this.state.board[id] === null
      && !isCellRestricted(this.state, id)
    this.setHover(valid ? id : null, false)
    interaction.onHover(valid ? id : null)
    this.canvas.style.cursor = valid ? 'pointer' : this.pointerStart ? 'grabbing' : 'grab'
  }

  private setHover(id: CellId | null, keyboard: boolean): void {
    const valid = id !== null
      && cellIsInLayer(id, this.layer)
      && this.state.status === 'playing'
      && this.state.board[id] === null
      && !isCellRestricted(this.state, id)
    this.hoverMesh.visible = valid
    if (!valid || id === null) return
    const { x, y, z } = coordinateFromId(id)
    this.hoverMesh.position.set(x * CELL_SPACING, y * CELL_SPACING, z * CELL_SPACING)
    const material = this.hoverMesh.material as THREE.MeshBasicMaterial
    material.color.setHex(keyboard ? 0xffffff : 0x8debca)
  }

  private keyboardCoordinate(current: Coordinate, key: string): Coordinate | null {
    let { x, y, z } = current
    if (this.layer !== 'all') {
      if (key === 'ArrowLeft') x = Math.max(-1, x - 1) as Coordinate['x']
      else if (key === 'ArrowRight') x = Math.min(1, x + 1) as Coordinate['x']
      else if (key === 'ArrowUp') y = Math.min(1, y + 1) as Coordinate['y']
      else if (key === 'ArrowDown') y = Math.max(-1, y - 1) as Coordinate['y']
      else return null
      return { x, y, z }
    }
    if (key === 'ArrowLeft') x = Math.max(-1, x - 1) as Coordinate['x']
    else if (key === 'ArrowRight') x = Math.min(1, x + 1) as Coordinate['x']
    else if (key === 'ArrowUp') z = Math.min(1, z + 1) as Coordinate['z']
    else if (key === 'ArrowDown') z = Math.max(-1, z - 1) as Coordinate['z']
    else if (key === 'PageUp') y = Math.min(1, y + 1) as Coordinate['y']
    else if (key === 'PageDown') y = Math.max(-1, y - 1) as Coordinate['y']
    else return null
    return { x, y, z }
  }

  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth)
    const height = Math.max(1, this.canvas.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    const angle = Math.atan2(this.camera.position.x, this.camera.position.z)
    this.marks.children.forEach((mark) => { mark.rotation.y = angle })
    this.locks.children.forEach((lock) => { lock.rotation.y = angle })
    if (this.unlockFadeStart !== null) {
      const progress = Math.min(1, (performance.now() - this.unlockFadeStart) / 220)
      this.locks.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const material = object.material as THREE.MeshBasicMaterial
        material.opacity = Number(material.userData.baseOpacity ?? material.opacity) * (1 - progress)
      })
      if (progress === 1) {
        this.locks.clear()
        this.unlockFadeStart = null
      }
    }
    if (this.scorePulseStart !== null) {
      const progress = Math.min(1, (performance.now() - this.scorePulseStart) / 650)
      const pulseScale = 0.85 + Math.sin(progress * Math.PI) * 0.22
      this.scorePulses.children.forEach((object) => {
        object.scale.setScalar(pulseScale)
        if (object instanceof THREE.Mesh) {
          const material = object.material as THREE.MeshBasicMaterial
          material.opacity = 0.9 * (1 - progress)
        }
      })
      if (progress === 1) {
        this.scorePulses.clear()
        delete this.canvas.dataset.scoringPulses
        this.scorePulseStart = null
      }
    }
    this.renderer.render(this.scene, this.camera)
  }
}
