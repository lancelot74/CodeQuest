// HTML overlay above the Phaser canvas — used for the lesson card and codex
// entries so code renders crisp and syntax-colored (no canvas-font blur).

const CSS = `
.cq-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(8,10,22,0.80);z-index:9999;font-family:ui-monospace,"Courier New",monospace}
.cq-card{width:min(560px,90vw);max-height:86vh;overflow:auto;background:#141a2e;
  border:3px solid #ffe066;border-radius:6px;padding:22px 24px;color:#cdd7ee;
  box-shadow:0 0 0 3px #0b0d1a,0 12px 40px rgba(0,0,0,0.6)}
.cq-badge{font-family:"Press Start 2P",monospace;font-size:9px;color:#7cfc98;letter-spacing:1px;margin-bottom:12px}
.cq-title{font-family:"Press Start 2P",monospace;font-size:15px;color:#ffe066;line-height:1.5;margin:0 0 14px}
.cq-body{font-size:13px;line-height:1.6;margin:0 0 16px;color:#cdd7ee}
.cq-code{background:#0b0f1d;border:1px solid #2a3350;border-radius:4px;padding:12px 14px;margin:0 0 18px;
  font-size:13px;line-height:1.55;overflow-x:auto;white-space:pre;color:#cfe3ff}
.cq-code .tok-c{color:#6b7a99;font-style:italic}
.cq-code .tok-s{color:#e6b86a}
.cq-code .tok-n{color:#7fd0ff}
.cq-code .tok-k{color:#c792ea}
.cq-foot{display:flex;align-items:center}
.cq-btn{font-family:"Press Start 2P",monospace;font-size:11px;color:#0b0d1a;background:#ffe066;border:none;
  border-radius:4px;padding:10px 18px;cursor:pointer}
.cq-btn:hover{background:#fff0a0}
.cq-hint{font-size:10px;color:#8ea0c0;margin-left:14px}
.cq-opt{display:block;width:100%;text-align:left;margin:0 0 10px;background:#223052;color:#eaf1ff}
.cq-opt:hover{background:#2e4070}
.cq-opt.cq-wrong{background:#7a2f33;color:#ffd9d9;cursor:default}
`

const TOKEN =
  /(%[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'])*'|"(?:\\.|[^"])*")|(\b\d+(?:\.\d+)?\b)|(\b(?:for|end|if|else|elseif|while|function|return|int|float|double|char|bool|void|include|import|using|namespace|std|cout|cin|endl|disp|fprintf|printf|sprintf|true|false|const|struct|class|public|private|new|delete|main)\b)/g

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlight(code) {
  return esc(code).replace(TOKEN, (m, comment, str, num, kw) => {
    if (comment) return `<span class="tok-c">${comment}</span>`
    if (str) return `<span class="tok-s">${str}</span>`
    if (num) return `<span class="tok-n">${num}</span>`
    if (kw) return `<span class="tok-k">${kw}</span>`
    return m
  })
}

let overlayEl = null
let keyHandler = null

function ensureStyles() {
  if (document.getElementById('cq-overlay-style')) return
  const s = document.createElement('style')
  s.id = 'cq-overlay-style'
  s.textContent = CSS
  document.head.appendChild(s)
}

export function hideOverlay() {
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler, true)
    keyHandler = null
  }
  if (overlayEl) {
    overlayEl.remove()
    overlayEl = null
  }
}

// Multiple-choice code question over the canvas. Wrong answers turn red and stay
// on screen (retry teaches); the right one closes the card and reports whether it
// was found on the first try, so callers can scale rewards.
export function showQuestionCard(q, onDone, badge = 'CODE QUESTION') {
  ensureStyles()
  hideOverlay()

  const el = document.createElement('div')
  el.className = 'cq-overlay'
  const opts = q.options.map((o, i) => `<button class="cq-btn cq-opt" data-i="${i}">${esc(o)}</button>`).join('')
  el.innerHTML = `
    <div class="cq-card" role="dialog" aria-modal="true">
      <div class="cq-badge">${esc(badge)}</div>
      <h2 class="cq-title">${esc(q.prompt)}</h2>
      ${opts}
    </div>`
  document.body.appendChild(el)
  overlayEl = el

  let firstTry = true
  el.querySelectorAll('.cq-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (Number(btn.dataset.i) !== q.answer) {
        btn.classList.add('cq-wrong')
        firstTry = false
        return
      }
      hideOverlay()
      onDone?.(firstTry)
    })
  })
}

export function showLessonCard(lesson, onClose, badge = 'LESSON UNLOCKED') {
  ensureStyles()
  hideOverlay()

  const el = document.createElement('div')
  el.className = 'cq-overlay'
  el.innerHTML = `
    <div class="cq-card" role="dialog" aria-modal="true">
      <div class="cq-badge">${esc(badge)}</div>
      <h2 class="cq-title">${esc(lesson.title)}</h2>
      <p class="cq-body">${esc(lesson.body)}</p>
      <pre class="cq-code"><code>${highlight(lesson.code || '')}</code></pre>
      <div class="cq-foot">
        <button class="cq-btn">GOT IT</button>
        <span class="cq-hint">Enter / Esc</span>
      </div>
    </div>`
  document.body.appendChild(el)
  overlayEl = el

  const close = () => {
    hideOverlay()
    onClose?.()
  }
  el.querySelector('.cq-btn').addEventListener('click', close)
  keyHandler = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  window.addEventListener('keydown', keyHandler, true)
  el.querySelector('.cq-btn').focus()
}
