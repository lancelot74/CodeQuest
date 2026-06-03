// Shared virtual-input state written by the on-screen touch controls and read by
// Player. Kept as a single module singleton so neither side needs a scene ref.
export const TouchState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false, // space semantics: ground/double jump + ladder hop
  attackL: false,
  attackH: false,
}

export function resetTouch() {
  for (const k in TouchState) TouchState[k] = false
}
