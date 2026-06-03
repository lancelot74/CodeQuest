// On-screen touch controls (DOM overlay) for phones/tablets. DOM is used instead
// of in-canvas buttons so multi-touch (move + jump + attack at once) works
// natively and stays crisp regardless of the canvas FIT-scaling. Buttons just
// write the shared TouchState; Player reads it. Shown only on touch devices and
// only while a gameplay scene is active (z below the lesson card at 9999).
import { TouchState, resetTouch } from '../systems/TouchState.js'

let mounted = false
let root = null
let rotateEl = null

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
#tc-dpad { position: absolute; pointer-events: none;
  left: calc(env(safe-area-inset-left) + 18px);
  bottom: calc(env(safe-area-inset-bottom) + 18px);
  display: grid; grid-template-columns: repeat(3, 62px); grid-template-rows: repeat(3, 62px); gap: 6px; }
#tc-dpad .tc-btn { position: static; width: 62px; height: 62px; border-radius: 14px; }
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

function mount() {
  if (mounted || typeof document === 'undefined') return
  mounted = true

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  root = document.createElement('div')
  root.id = 'tc'
  root.innerHTML = `
    <div id="tc-dpad">
      <div class="tc-btn" data-k="up"    style="grid-column:2;grid-row:1">▲</div>
      <div class="tc-btn" data-k="left"  style="grid-column:1;grid-row:2">◀</div>
      <div class="tc-btn" data-k="right" style="grid-column:3;grid-row:2">▶</div>
      <div class="tc-btn" data-k="down"  style="grid-column:2;grid-row:3">▼</div>
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

  root.querySelectorAll('#tc-dpad .tc-btn').forEach((el) => bind(el, el.dataset.k))
  bind(root.querySelector('#btn-jump'), 'jump')
  bind(root.querySelector('#btn-attack'), 'attackL')
  bind(root.querySelector('#btn-heavy'), 'attackH')
}

export function showTouchControls() {
  if (!isTouchDevice()) return
  mount()
  root.classList.add('tc-on')
  rotateEl.classList.add('tc-armed')
}

export function hideTouchControls() {
  root?.classList.remove('tc-on')
  rotateEl?.classList.remove('tc-armed')
  resetTouch() // drop any buttons still held when leaving the scene
}
