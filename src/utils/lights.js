// Shared night-lighting constants and cached radial light textures, used by the
// NIGHT HUNT forest and the finale lair. Textures are created once per game.
export const LIGHT_RADIUS = 104 // player light WITH a torch
export const SMALL_LIGHT = 30 // player light without a torch (immediate surroundings only)
export const TORCH_LIGHT = 80 // ambient pool cast by a map torch

function makeLight(scene, key, radius, peak) {
  if (scene.textures.exists(key)) return
  const d = radius * 2
  const c = scene.textures.createCanvas(key, d, d)
  const ctx = c.getContext()
  const g = ctx.createRadialGradient(radius, radius, radius * 0.12, radius, radius, radius)
  g.addColorStop(0, `rgba(255,255,255,${peak})`)
  g.addColorStop(0.62, `rgba(255,255,255,${peak * 0.82})`)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, d, d)
  c.refresh()
}

export function ensureHuntLights(scene) {
  makeLight(scene, 'hunt-light', LIGHT_RADIUS, 1)
  makeLight(scene, 'hunt-light-sm', SMALL_LIGHT, 0.85)
  makeLight(scene, 'hunt-torch-light', TORCH_LIGHT, 0.9)
}
