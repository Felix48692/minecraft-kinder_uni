type BlockType = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaf' | 'redleaf' | 'blueearth' | 'yellowcrystal'

type ItemType = BlockType | 'axe' | 'pickaxe'

type Block = { x: number; y: number; type: BlockType }

type Player = {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
}

const canvas = document.getElementById('game') as HTMLCanvasElement | null
const stats = document.getElementById('stats')

if (!canvas) throw new Error('Canvas not found')
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('2D context not available')

const TILE = 32
const GRAVITY = 0.55
const MOVE_SPEED = 2.8
const JUMP_POWER = 10.2
const WORLD_W = 140
const WORLD_H = 60

const palette: Record<BlockType, string> = {
  grass: '#6cbc46',
  dirt: '#8a5b33',
  stone: '#8b9099',
  wood: '#a97142',
  leaf: '#3aa83f',
  redleaf: '#d94a4a',
  blueearth: '#3a72d6',
  yellowcrystal: '#ffd84d',
}

const blocks = new Map<string, BlockType>()
const inventoryItems: ItemType[] = []
const placementCounts = new Map<BlockType, number>()
const key = (x: number, y: number) => `${x},${y}`
const setBlock = (x: number, y: number, type: BlockType) => blocks.set(key(x, y), type)
const removeBlock = (x: number, y: number) => blocks.delete(key(x, y))
const hasBlock = (x: number, y: number) => blocks.has(key(x, y))
const getBlock = (x: number, y: number) => blocks.get(key(x, y))

for (let x = 0; x < WORLD_W; x++) {
  const isCrystalBiome = x >= Math.floor(WORLD_W / 2)
  const ground = isCrystalBiome ? 24 + Math.floor(Math.sin(x / 5) * 3) : 28 + Math.floor(Math.sin(x / 4) * 2)
  for (let y = ground; y < WORLD_H; y++) {
    if (isCrystalBiome) {
      if (y === ground) setBlock(x, y, 'blueearth')
      else if (y < ground + 3) setBlock(x, y, 'blueearth')
      else setBlock(x, y, 'stone')
    } else {
      if (y === ground) setBlock(x, y, 'grass')
      else if (y < ground + 4) setBlock(x, y, 'dirt')
      else setBlock(x, y, 'stone')
    }
  }

  if (!isCrystalBiome && x % 11 === 4) {
    for (let t = 0; t < 4; t++) setBlock(x, ground - 1 - t, 'wood')
    setBlock(x - 1, ground - 5, 'wood')
    setBlock(x + 1, ground - 5, 'wood')

    for (let lx = -2; lx <= 2; lx++) {
      for (let ly = -7; ly <= -4; ly++) {
        const distance = Math.abs(lx) + Math.abs(ly + 5)
        if (distance <= 4 && Math.random() > 0.15) {
          setBlock(x + lx, ground + ly, 'leaf')
        }
      }
    }
    setBlock(x, ground - 6, 'leaf')
  }

  if (isCrystalBiome) {
    if (x % 14 === 0) {
      for (let h = 0; h < 4; h++) setBlock(x, ground - 1 - h, 'wood')
      for (let ox = -3; ox <= 3; ox++) {
        for (let oy = -6; oy <= -3; oy++) {
          if (Math.abs(ox) + Math.abs(oy + 4) <= 4 && Math.random() > 0.12) {
            setBlock(x + ox, ground + oy, 'redleaf')
          }
        }
      }
      setBlock(x, ground - 7, 'redleaf')
      setBlock(x - 1, ground - 5, 'redleaf')
      setBlock(x + 1, ground - 5, 'redleaf')
    }
    if (x % 6 === 2) {
      setBlock(x, ground - 1, 'blueearth')
      setBlock(x, ground - 2, 'stone')
    }
    if (x % 10 === 0 && !blocks.has(key(x, ground - 1))) {
      const heightRoll = x % 5
      const crystalHeight = heightRoll === 0 ? 1 : heightRoll <= 2 ? 2 : 3
      for (let h = 0; h < crystalHeight; h++) {
        setBlock(x, ground - 1 - h, 'yellowcrystal')
      }
      setBlock(x, ground - crystalHeight - 1, 'yellowcrystal')
    }
  }
}

const player: Player = { x: 200, y: 100, w: 22, h: 30, vx: 0, vy: 0, onGround: false }
const keys = new Set<string>()
let selected: ItemType = 'axe'
const inventoryCounts = new Map<ItemType, number>()
const collectedBlocks = new Set<BlockType>()
let mouseX = 0
let mouseY = 0
let inventoryOpen = false
let selectedIndex = 0
let particles: Particle[] = []
let craftingGrid: (BlockType | null)[][] = [[null, null], [null, null]]
let craftingResult: 'crafting_table' | null = null
let draggedItem: BlockType | null = null
let draggedSource: 'inventory' | 'crafting' | null = null
let draggedFromSlot: { row: number; col: number } | null = null

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string }

window.addEventListener('keydown', (e) => {
  const keyLower = e.key.toLowerCase()
  if (keyLower === 'e') {
    inventoryOpen = true
    return
  }
  if (keyLower === 'r') {
    inventoryOpen = false
    return
  }
  if (inventoryOpen) {
    if (inventoryItems.length > 0) {
      if (e.key === 'ArrowLeft') selectedIndex = (selectedIndex - 1 + inventoryItems.length) % inventoryItems.length
      if (e.key === 'ArrowRight') selectedIndex = (selectedIndex + 1) % inventoryItems.length
      selected = inventoryItems[selectedIndex]
    }
    return
  }
  keys.add(e.key.toLowerCase())
  if (['1', '2', '3', '4'].includes(e.key)) {
    selected = ({ '1': 'grass', '2': 'dirt', '3': 'stone', '4': 'wood' } as const)[e.key as '1' | '2' | '3' | '4']
    selectedIndex = inventoryItems.indexOf(selected)
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
window.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect()
  mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width
  mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height
})
window.addEventListener('mousedown', (e) => {
  if (inventoryOpen) {
    if (draggedItem) {
      handleDropOnInventory(e.button)
      return
    }
    handleInventoryClick(e.button)
    return
  }
  const world = screenToWorld(mouseX, mouseY)
  const tx = Math.floor(world.x / TILE)
  const ty = Math.floor(world.y / TILE)
  const target = getBlock(tx, ty)
  if (e.button === 0) {
    if (target) {
      spawnBreakParticles(tx * TILE, ty * TILE, target)
      removeBlock(tx, ty)
      giveItem(target)
    }
  } else if (e.button === 0) {
    const item = selected as BlockType
    const count = placementCounts.get(item) ?? 0
    if (count > 0 && !intersectsPlayer(tx * TILE, ty * TILE, TILE, TILE)) {
      setBlock(tx, ty, item)
      placementCounts.set(item, count - 1)
    }
  }
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
window.addEventListener('resize', resize)

function resize() {
  const scale = Math.min(window.innerWidth / canvas.width, (window.innerHeight - 120) / canvas.height)
  canvas.style.width = `${canvas.width * Math.max(1, scale)}px`
  canvas.style.height = `${canvas.height * Math.max(1, scale)}px`
}

function screenToWorld(x: number, y: number) {
  const camX = player.x + player.w / 2 - canvas.width / 2
  const camY = player.y + player.h / 2 - canvas.height / 2
  return { x: x + camX, y: y + camY }
}

function intersectsPlayer(x: number, y: number, w: number, h: number) {
  return !(player.x + player.w <= x || player.x >= x + w || player.y + player.h <= y || player.y >= y + h)
}

function collides(x: number, y: number, w: number, h: number) {
  const left = Math.floor(x / TILE)
  const right = Math.floor((x + w - 1) / TILE)
  const top = Math.floor(y / TILE)
  const bottom = Math.floor((y + h - 1) / TILE)
  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (hasBlock(tx, ty)) return true
    }
  }
  return false
}

function giveItem(item: BlockType) {
  collectedBlocks.add(item)
  if (!inventoryItems.includes(item)) inventoryItems.push(item)
  inventoryCounts.set(item, (inventoryCounts.get(item) ?? 0) + 1)
  placementCounts.set(item, (placementCounts.get(item) ?? 0) + 1)
  if (inventoryItems.length === 1) selectedIndex = 0
}
function updateCraftingResult() {
  craftingResult = craftingGrid.flat().every((v) => v === 'wood') ? 'crafting_table' : null
}

function handleInventoryClick(button: number) {
  const panelX = 180
  const panelY = 90
  const invX = 220
  const invY = 220
  const invSlotW = 130
  const invSlotH = 80
  const invGapX = 160
  const invGapY = 110
  const collected = Array.from(collectedBlocks)
  const index = collected.findIndex((item, i) => {
    const sx = invX + (i % 4) * invGapX
    const sy = invY + Math.floor(i / 4) * invGapY
    return mouseX >= sx && mouseX <= sx + invSlotW && mouseY >= sy && mouseY <= sy + invSlotH
  })

  if (button === 2 && index !== -1) {
    draggedItem = collected[index]
    draggedSource = 'inventory'
    draggedFromSlot = null
    return
  }

  if (button !== 0) return
  const closeX = panelX + 18
  const closeY = panelY + 18
  const closeW = 44
  const closeH = 44
  if (mouseX >= closeX && mouseX <= closeX + closeW && mouseY >= closeY && mouseY <= closeY + closeH) {
    inventoryOpen = false
    return
  }

  const craftX = 520
  const craftY = 420
  const slot = 56
  const relX = mouseX - panelX
  const relY = mouseY - panelY

  if (relX >= craftX && relX < craftX + slot * 2 && relY >= craftY && relY < craftY + slot * 2) {
    const col = Math.floor((relX - craftX) / slot)
    const row = Math.floor((relY - craftY) / slot)
    const current = craftingGrid[row][col]

    if (current) {
      craftingGrid[row][col] = null
      giveItem(current)
    } else if ((inventoryCounts.get('wood') ?? 0) > 0) {
      craftingGrid[row][col] = 'wood'
      const woodLeft = Math.max(0, (inventoryCounts.get('wood') ?? 0) - 1)
      inventoryCounts.set('wood', woodLeft)
      const placedLeft = Math.max(0, (placementCounts.get('wood') ?? 0) - 1)
      placementCounts.set('wood', placedLeft)
      if (woodLeft === 0) {
        const idx = inventoryItems.indexOf('wood')
        if (idx !== -1) inventoryItems.splice(idx, 1)
      }
    }
    updateCraftingResult()
    return
  }

  if (craftingResult === 'crafting_table') {
    const rx = 700
    const ry = 430
    if (mouseX >= panelX + rx && mouseX <= panelX + rx + 120 && mouseY >= panelY + ry && mouseY <= panelY + ry + 60) {
      giveItem('crafting_table')
      craftingGrid = [[null, null], [null, null]]
      updateCraftingResult()
    }
  }
}

function handleDropOnInventory(button: number) {
  if (button !== 2 || !draggedItem) return
  const panelX = 180
  const panelY = 90
  const craftX = 520
  const craftY = 420
  const slot = 56
  const relX = mouseX - panelX
  const relY = mouseY - panelY
  if (relX >= craftX && relX < craftX + slot * 2 && relY >= craftY && relY < craftY + slot * 2) {
    const col = Math.floor((relX - craftX) / slot)
    const row = Math.floor((relY - craftY) / slot)
    if (!craftingGrid[row][col]) {
      craftingGrid[row][col] = draggedItem
      const count = inventoryCounts.get(draggedItem) ?? 0
      inventoryCounts.set(draggedItem, Math.max(0, count - 1))
      const placeCount = placementCounts.get(draggedItem) ?? 0
      placementCounts.set(draggedItem, Math.max(0, placeCount - 1))
      if ((inventoryCounts.get(draggedItem) ?? 0) === 0) {
        const idx = inventoryItems.indexOf(draggedItem)
        if (idx !== -1) inventoryItems.splice(idx, 1)
      }
      updateCraftingResult()
    }
  }
  draggedItem = null
  draggedSource = null
  draggedFromSlot = null
}

function spawnBreakParticles(x: number, y: number, type: BlockType) {
  const color = palette[type]
  for (let i = 0; i < 10; i++) {
    particles.push({ x: x + 16, y: y + 16, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 3 - 1, life: 30, color })
  }
}

function updateParticles() {
  particles = particles.filter((p) => p.life > 0).map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.12, life: p.life - 1 }))
}

function update() {
  const left = keys.has('a') || keys.has('arrowleft')
  const right = keys.has('d') || keys.has('arrowright')
  const jump = keys.has(' ') || keys.has('w') || keys.has('arrowup')

  player.vx = (right ? MOVE_SPEED : 0) - (left ? MOVE_SPEED : 0)
  if (jump && player.onGround) {
    player.vy = -JUMP_POWER
    player.onGround = false
  }
  player.vy += GRAVITY

  let nx = player.x + player.vx
  if (!collides(nx, player.y, player.w, player.h)) player.x = nx
  else player.vx = 0

  let ny = player.y + player.vy
  if (!collides(player.x, ny, player.w, player.h)) {
    player.y = ny
    player.onGround = false
  } else {
    if (player.vy > 0) player.onGround = true
    while (!collides(player.x, player.y + Math.sign(player.vy), player.w, player.h)) {
      player.y += Math.sign(player.vy)
    }
    player.vy = 0
  }

  player.x = Math.max(0, Math.min(player.x, WORLD_W * TILE - player.w))
  player.y = Math.min(player.y, WORLD_H * TILE)

  updateParticles()

  if (stats) {
    const inv = inventoryItems.length
      ? inventoryItems.map((item) => `${item}:${inventoryCounts.get(item) ?? 0}`).join(' · ')
      : 'leer'
    stats.textContent = `Inventar: ${inventoryOpen ? 'offen' : 'zu'} · ${inv} · X: ${Math.floor(player.x / TILE)} · Y: ${Math.floor(player.y / TILE)}`
  }
}

function drawBlock(x: number, y: number, type: BlockType) {
  if (type === 'grass') {
    const body = ctx.createLinearGradient(x, y, x, y + TILE)
    body.addColorStop(0, '#78c94f')
    body.addColorStop(0.55, '#5cab3d')
    body.addColorStop(1, '#4c8f31')
    ctx.fillStyle = body
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = '#d5f28b'
    ctx.fillRect(x, y, TILE, 5)
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(x + 3, y + 8, 8, 3)
    ctx.fillRect(x + 17, y + 11, 10, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.fillRect(x + 2, y + 22, 12, 3)
  } else if (type === 'dirt') {
    const body = ctx.createLinearGradient(x, y, x + TILE, y + TILE)
    body.addColorStop(0, '#9b6a3b')
    body.addColorStop(0.5, '#8a5b33')
    body.addColorStop(1, '#6f4526')
    ctx.fillStyle = body
    ctx.fillRect(x, y, TILE, TILE)
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 224, 176, 0.12)' : 'rgba(0,0,0,0.12)'
      ctx.fillRect(x + (i * 5) % 28, y + 7 + ((i * 9) % 20), 3, 3)
    }
  } else if (type === 'stone') {
    const body = ctx.createLinearGradient(x, y, x + TILE, y + TILE)
    body.addColorStop(0, '#a5abb4')
    body.addColorStop(0.55, '#848b95')
    body.addColorStop(1, '#6d737d')
    ctx.fillStyle = body
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x + 4, y + 5, 8, 4)
    ctx.fillRect(x + 18, y + 10, 6, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(x + 12, y + 18, 10, 4)
  } else if (type === 'crystal') {
    const body = ctx.createLinearGradient(x, y, x + TILE, y + TILE)
    body.addColorStop(0, '#7ff7ff')
    body.addColorStop(0.5, '#4ad5ff')
    body.addColorStop(1, '#2477ff')
    ctx.fillStyle = body
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(x + 5, y + 5, 5, 16)
    ctx.fillRect(x + 14, y + 8, 4, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    ctx.fillRect(x + 2, y + 2, 8, 4)
    ctx.fillRect(x + 18, y + 18, 7, 3)
  } else if (type === 'wood') {
    const grad = ctx.createLinearGradient(x, y, x + TILE, y)
    grad.addColorStop(0, '#8a5a33')
    grad.addColorStop(0.5, '#b57a49')
    grad.addColorStop(1, '#7a4a28')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)

    ctx.fillStyle = 'rgba(70, 40, 18, 0.45)'
    ctx.fillRect(x + 6, y + 4, 3, TILE - 8)
    ctx.fillRect(x + 15, y + 3, 2, TILE - 6)
    ctx.fillRect(x + 22, y + 5, 3, TILE - 10)

    ctx.fillStyle = 'rgba(255, 224, 176, 0.28)'
    ctx.fillRect(x + 2, y + 2, TILE - 4, 4)
    ctx.fillRect(x + 3, y + 7, 6, 2)
  } else if (type === 'leaf') {
    const grad = ctx.createRadialGradient(x + 12, y + 12, 4, x + 16, y + 16, 18)
    grad.addColorStop(0, '#60d866')
    grad.addColorStop(1, '#2d8d30')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(x + 5, y + 5, 6, 4)
    ctx.fillRect(x + 18, y + 8, 4, 3)
    ctx.fillRect(x + 10, y + 18, 8, 3)
  } else if (type === 'redleaf') {
    const grad = ctx.createRadialGradient(x + 12, y + 12, 4, x + 16, y + 16, 18)
    grad.addColorStop(0, '#ff8b8b')
    grad.addColorStop(1, '#b61f2d')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(x + 4, y + 4, 8, 4)
    ctx.fillRect(x + 17, y + 9, 5, 3)
    ctx.fillStyle = 'rgba(60,0,0,0.16)'
    ctx.fillRect(x + 7, y + 18, 10, 4)
  } else if (type === 'blueearth') {
    const grad = ctx.createLinearGradient(x, y, x, y + TILE)
    grad.addColorStop(0, '#8ed7ff')
    grad.addColorStop(0.4, '#4da7ff')
    grad.addColorStop(1, '#1d4c9f')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(x + 3, y + 4, 8, 3)
    ctx.fillRect(x + 15, y + 8, 7, 3)
    ctx.fillRect(x + 6, y + 16, 5, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.14)'
    ctx.fillRect(x + 3, y + 21, 10, 3)
    ctx.fillRect(x + 15, y + 24, 7, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(x + 1, y + 1, 4, 4)
    ctx.fillRect(x + 20, y + 2, 3, 6)
  } else if (type === 'yellowcrystal') {
    const h = Math.max(1, Math.round((TILE - y % TILE) / TILE))
    const grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE)
    grad.addColorStop(0, '#fff7a8')
    grad.addColorStop(0.45, '#ffd84d')
    grad.addColorStop(1, '#c88f12')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    ctx.fillRect(x + 4, y + 4, 3, 13)
    ctx.fillRect(x + 13, y + 7, 2, 10)
    ctx.fillRect(x + 19, y + 5, 2, 7)
    ctx.fillStyle = 'rgba(120,80,0,0.18)'
    ctx.fillRect(x + 7, y + 18, 8, 4)
    ctx.fillRect(x + 17, y + 16, 4, 3)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x + 2, y + 2, 5, 3)
    if (h === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillRect(x + 8, y + 2, 8, 3)
    } else {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x + 16, y + 2)
      ctx.lineTo(x + 25, y + 12)
      ctx.lineTo(x + 7, y + 12)
      ctx.closePath()
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fill()
      ctx.restore()
    }
  } else if (type === 'redleaf') {
    const grad = ctx.createRadialGradient(x + 12, y + 12, 4, x + 16, y + 16, 18)
    grad.addColorStop(0, '#ffb4b4')
    grad.addColorStop(1, '#bb1f35')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, TILE, TILE)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(x + 5, y + 5, 6, 3)
    ctx.fillRect(x + 16, y + 8, 5, 3)
    ctx.fillRect(x + 10, y + 18, 8, 3)
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.16)'
  ctx.strokeRect(x, y, TILE, TILE)
}

function render() {
  const camX = player.x + player.w / 2 - canvas.width / 2
  const camY = player.y + player.h / 2 - canvas.height / 2
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height)
  sky.addColorStop(0, '#8fd3ff')
  sky.addColorStop(1, '#dff4ff')
  if (player.x > WORLD_W * TILE / 2) {
    sky.addColorStop(0, '#5ad9ff')
    sky.addColorStop(1, '#effcff')
  }
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (const [id, type] of blocks) {
    const [bx, by] = id.split(',').map(Number)
    const sx = bx * TILE - camX
    const sy = by * TILE - camY
    if (sx > -TILE && sy > -TILE && sx < canvas.width && sy < canvas.height) drawBlock(sx, sy, type)
  }

  for (const p of particles) {
    ctx.fillStyle = p.color
    ctx.globalAlpha = Math.max(0, p.life / 30)
    ctx.fillRect(p.x - camX, p.y - camY, 4, 4)
    ctx.globalAlpha = 1
  }

  const px = player.x - camX
  const py = player.y - camY
  const body = ctx.createLinearGradient(px, py, px, py + player.h)
  body.addColorStop(0, '#ffe27a')
  body.addColorStop(0.5, '#ffbd4f')
  body.addColorStop(1, '#d88a1f')
  ctx.fillStyle = body
  roundRect(px + 3, py + 5, player.w - 6, player.h - 5, 7)
  ctx.fill()
  ctx.fillStyle = '#7b4a18'
  roundRect(px + 4, py + 18, player.w - 8, 10, 4)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  roundRect(px + 6, py + 8, 7, 7, 3)
  ctx.fill()
  ctx.fillStyle = '#222'
  ctx.fillRect(px + 6, py + 10, 3, 3)
  ctx.fillRect(px + 13, py + 10, 3, 3)
  ctx.fillStyle = '#3d2510'
  ctx.fillRect(px + 8, py + 20, 6, 2)
  ctx.fillStyle = '#c9822e'
  ctx.fillRect(px + 1, py + 24, 4, 10)
  ctx.fillRect(px + player.w - 5, py + 24, 4, 10)
  ctx.fillStyle = '#8b541f'
  ctx.fillRect(px + 1, py + 32, 4, 2)
  ctx.fillRect(px + player.w - 5, py + 32, 4, 2)

  if (inventoryOpen) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(18, 24, 40, 0.95)'
    ctx.fillRect(180, 90, canvas.width - 360, canvas.height - 180)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.strokeRect(180, 90, canvas.width - 360, canvas.height - 180)
    ctx.fillStyle = '#fff'
    ctx.font = '28px system-ui, sans-serif'
    ctx.fillText('Inventar', 210, 140)
    ctx.font = '18px system-ui, sans-serif'
    ctx.fillStyle = '#cfe2ff'
    ctx.fillText('Hier siehst du nur Blöcke, die du schon abgebaut hast.', 210, 172)

    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(210, 96, 120, 34)
    ctx.fillStyle = '#fff'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText('Schließen: E', 222, 118)

    const collected = Array.from(collectedBlocks)
    collected.forEach((item, index) => {
      const sx = 220 + (index % 4) * 160
      const sy = 220 + Math.floor(index / 4) * 110
      const count = inventoryCounts.get(item) ?? 0
      ctx.fillStyle = item === draggedItem ? 'rgba(255,220,107,0.22)' : item === selected ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'
      ctx.fillRect(sx, sy, 130, 80)
      ctx.strokeStyle = item === selected ? '#ffd86b' : 'rgba(255,255,255,0.12)'
      ctx.strokeRect(sx, sy, 130, 80)
      ctx.fillStyle = '#fff'
      ctx.fillText(item, sx + 16, sy + 42)
      ctx.fillStyle = '#cfe2ff'
      ctx.fillText(`x${count}`, sx + 16, sy + 64)
      if (count > 1) {
        ctx.fillStyle = '#ffd86b'
        ctx.font = 'bold 18px system-ui, sans-serif'
        ctx.fillText(String(count), sx + 102, sy + 28)
        ctx.font = '18px system-ui, sans-serif'
      }
    })

    const cx = 520
    const cy = 420
    const slot = 56
    ctx.fillStyle = '#fff'
    ctx.fillText('Crafting 2x2', cx, cy - 18)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const x = cx + col * slot
        const y = cy + row * slot
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(x, y, slot - 4, slot - 4)
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.strokeRect(x, y, slot - 4, slot - 4)
        const value = craftingGrid[row][col]
        if (value) {
          ctx.fillStyle = palette[value]
          ctx.fillRect(x + 10, y + 10, slot - 24, slot - 24)
        }
      }
    }

    if (craftingResult) {
      const rx = 700
      const ry = 430
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fillRect(rx, ry, 120, 60)
      ctx.strokeStyle = '#ffd86b'
      ctx.strokeRect(rx, ry, 120, 60)
      ctx.fillStyle = '#fff'
      ctx.fillText('crafting_table', rx + 10, ry + 35)
    }

    if (draggedItem) {
      ctx.save()
      ctx.globalAlpha = 0.85
      const size = 34
      const gx = mouseX - size / 2
      const gy = mouseY - size / 2
      ctx.fillStyle = palette[draggedItem]
      ctx.fillRect(gx, gy, size, size)
      ctx.strokeStyle = '#fff'
      ctx.strokeRect(gx, gy, size, size)
      ctx.fillStyle = '#000'
      ctx.font = '12px system-ui, sans-serif'
      ctx.fillText(draggedItem, gx + 2, gy + 48)
      ctx.restore()
    }
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function loop() {
  update()
  render()
  requestAnimationFrame(loop)
}

resize()
loop()
