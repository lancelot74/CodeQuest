// On-screen touch controls (DOM overlay) for phones/tablets. DOM is used instead
// of in-canvas buttons so multi-touch (move + jump + attack at once) works
// natively and stays crisp regardless of the canvas FIT-scaling. The left side is
// an analog joystick (drag to move/climb in any direction); the right side has the
// jump/attack buttons. Controls just write the shared TouchState; Player reads it.
// Shown only on touch devices and only while a gameplay scene is active.
import { TouchState, resetTouch } from '../systems/TouchState.js'

let mounted = false
let root = null
let rotateEl = null
let knobEl = null
let jumpEl = null
let attackEl = null
let heavyEl = null

// Joystick drag state: which touch owns the stick, the base centre, and the max
// knob travel (px). Direction thresholds are fractions of that travel.
const STICK = { id: null, cx: 0, cy: 0, max: 36 }

export function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0
  )
}

const CSS = `
#tc { position: fixed; inset: 0; z-index: 50; pointer-events: none; display: none;
  user-select: none; -webkit-user-select: none; touch-action: none; }
#tc.tc-on { display: block; }
#tc .tc-btn { position: absolute; pointer-events: auto; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center; color: #e3ecff;
  font-family: system-ui, sans-serif; font-weight: 700; font-size: 26px; line-height: 1;
  background: rgba(28,34,54,0.40); border: 2px solid rgba(150,170,210,0.45);
  border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  -webkit-tap-highlight-color: transparent; transition: background .04s, transform .04s; }
#tc .tc-btn.tc-press { background: rgba(120,180,255,0.62);
  border-color: rgba(225,238,255,0.95); transform: scale(0.94); }
#tc .tc-word { font-size: 14px; letter-spacing: 1px; }
/* analog joystick (bottom-left) */
#tc-stick { position: absolute; pointer-events: auto; touch-action: none;
  left: calc(env(safe-area-inset-left) + 20px);
  bottom: calc(env(safe-area-inset-bottom) + 20px);
  width: 128px; height: 128px; }
#tc-stick .tc-base, #tc-stick .tc-knob { position: absolute;
  background: url('assets/game/ui/joy-knob.png') center/100% 100% no-repeat;
  image-rendering: pixelated; }
#tc-stick .tc-base { inset: 0; opacity: 0.40; }
#tc-stick .tc-knob { width: 56px; height: 56px; left: 36px; top: 36px; opacity: 0.92;
  will-change: transform; transition: transform .03s linear; }
#tc-act { position: absolute; pointer-events: none;
  right: calc(env(safe-area-inset-right) + 18px);
  bottom: calc(env(safe-area-inset-bottom) + 18px); width: 200px; height: 180px; }
#btn-jump { right: 0; bottom: 4px; width: 82px; height: 82px; border-radius: 50%; }
#btn-attack { right: 92px; bottom: 14px; width: 70px; height: 70px; border-radius: 50%; }
#btn-heavy { right: 22px; bottom: 100px; width: 62px; height: 62px; border-radius: 50%; }
#tc-rotate { position: fixed; inset: 0; z-index: 60; display: none;
  background: #0b0d1a; color: #cdd8f0; pointer-events: auto; padding: 24px;
  flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  font-family: system-ui, sans-serif; font-size: 16px; text-align: center; }
#tc-rotate .tc-rot-icon { font-size: 44px; animation: tc-spin 2.4s linear infinite; }
@keyframes tc-spin { to { transform: rotate(360deg); } }
@media (orientation: portrait) and (pointer: coarse) { #tc-rotate.tc-armed { display: flex; } }
`

// --- action buttons (jump / attack / heavy): each writes one TouchState flag ---
function bind(el, key) {
  if (!el) return
  const press = (e) => {
    e.preventDefault()
    TouchState[key] = true
    el.classList.add('tc-press')
  }
  const release = (e) => {
    if (e) e.preventDefault()
    TouchState[key] = false
    el.classList.remove('tc-press')
  }
  el.addEventListener('touchstart', press, { passive: false })
  el.addEventListener('touchend', release, { passive: false })
  el.addEventListener('touchcancel', release, { passive: false })
  el.addEventListener('mousedown', press)
  el.addEventListener('mouseup', release)
  el.addEventListener('mouseleave', () => TouchState[key] && release())
  el.addEventListener('contextmenu', (e) => e.preventDefault())
}

// --- analog joystick: map the drag vector to the four direction flags ---
function pointFor(e) {
  if (e.changedTouches) {
    for (const t of e.touches) if (t.identifier === STICK.id) return t
    return null // our finger has lifted
  }
  return e // mouse
}

function stickStart(stickEl, e) {
  e.preventDefault()
  const t = e.changedTouches ? e.changedTouches[0] : e
  STICK.id = e.changedTouches ? t.identifier : 'mouse'
  const rect = stickEl.getBoundingClientRect()
  STICK.cx = rect.left + rect.width / 2
  STICK.cy = rect.top + rect.height / 2
  stickMove(e)
}

function stickMove(e) {
  if (STICK.id === null) return
  const p = pointFor(e)
  if (!p) return
  if (e.cancelable) e.preventDefault()
  let dx = p.clientX - STICK.cx
  let dy = p.clientY - STICK.cy
  const dist = Math.hypot(dx, dy) || 1
  const m = STICK.max
  if (dist > m) {
    dx = (dx / dist) * m
    dy = (dy / dist) * m
  }
  if (knobEl) knobEl.style.transform = `translate(${dx}px, ${dy}px)`
  // Horizontal triggers easily; vertical needs a firmer push so casual left/right
  // movement doesn't accidentally grab ladders or drop through platforms.
  TouchState.left = dx < -m * 0.34
  TouchState.right = dx > m * 0.34
  TouchState.up = dy < -m * 0.42
  TouchState.down = dy > m * 0.42
}

function stickEnd(e) {
  if (STICK.id === null) return
  if (e.changedTouches) {
    let ours = false
    for (const t of e.changedTouches) if (t.identifier === STICK.id) ours = true
    if (!ours) return
  }
  STICK.id = null
  recenterStick()
}

function recenterStick() {
  if (knobEl) knobEl.style.transform = 'translate(0px, 0px)'
  TouchState.left = TouchState.right = TouchState.up = TouchState.down = false
}

function mount() {
  if (mounted || typeof document === 'undefined') return
  mounted = true

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  root = document.createElement('div')
  root.id = 'tc'
  root.innerHTML = `
    <div id="tc-stick">
      <div class="tc-base"></div>
      <div class="tc-knob"></div>
    </div>
    <div id="tc-act">
      <div class="tc-btn tc-word" id="btn-heavy">HVY</div>
      <div class="tc-btn tc-word" id="btn-attack">ATK</div>
      <div class="tc-btn tc-word" id="btn-jump">JUMP</div>
    </div>`
  document.body.appendChild(root)

  rotateEl = document.createElement('div')
  rotateEl.id = 'tc-rotate'
  rotateEl.innerHTML = `<div class="tc-rot-icon">↻</div><div>Rotate to landscape to play</div>`
  document.body.appendChild(rotateEl)

  const stickEl = root.querySelector('#tc-stick')
  knobEl = root.querySelector('#tc-stick .tc-knob')
  stickEl.addEventListener('touchstart', (e) => stickStart(stickEl, e), { passive: false })
  stickEl.addEventListener('touchmove', stickMove, { passive: false })
  stickEl.addEventListener('touchend', stickEnd, { passive: false })
  stickEl.addEventListener('touchcancel', stickEnd, { passive: false })
  stickEl.addEventListener('mousedown', (e) => stickStart(stickEl, e))
  window.addEventListener('mousemove', (e) => {
    if (STICK.id === 'mouse') stickMove(e)
  })
  window.addEventListener('mouseup', () => {
    if (STICK.id === 'mouse') {
      STICK.id = null
      recenterStick()
    }
  })

  jumpEl = root.querySelector('#btn-jump')
  attackEl = root.querySelector('#btn-attack')
  heavyEl = root.querySelector('#btn-heavy')
  bind(jumpEl, 'jump')
  bind(attackEl, 'attackL')
  bind(heavyEl, 'attackH')
}

// labels lets a scene relabel the three action buttons (they still drive the same
// TouchState flags) — e.g. NIGHT HUNT shows RUN / USE and hides the third button.
export function showTouchControls(labels) {
  if (!isTouchDevice()) return
  mount()
  const L = labels || {}
  jumpEl.textContent = L.jump || 'JUMP'
  attackEl.textContent = L.attack || 'ATK'
  // a scene can pass heavy: null to hide the third button entirely
  heavyEl.style.display = L.heavy === null ? 'none' : ''
  heavyEl.textContent = L.heavy || 'HVY'
  root.classList.add('tc-on')
  rotateEl.classList.add('tc-armed')
}

export function hideTouchControls() {
  STICK.id = null
  recenterStick()
  root?.classList.remove('tc-on')
  rotateEl?.classList.remove('tc-armed')
  resetTouch() // drop any buttons still held when leaving the scene
}
