export const CHARACTERS = ['ninja', 'pink', 'mask', 'virtual']

export const CHARACTER_NAMES = {
  ninja: 'NINJA FROG',
  pink: 'PINK MAN',
  mask: 'MASK DUDE',
  virtual: 'VIRTUAL GUY',
}

// Per-hero identity: a signature colour for every slash and a unique heavy attack.
//   tint  — colours all of that hero's slash FX
//   dashV — forward lunge speed on the heavy (mobility vs. rooted casting)
//   heavy.kind — dash/cleave: pure melee; wave: melee + forward shockwave; bolt: ranged
export const HERO_KITS = {
  ninja: { tint: 0x6ff0c0, dashV: 215, heavy: { kind: 'dash', range: 30, dmg: 12, crit: 0.2, knock: 1.6 } },
  pink: { tint: 0xff8fd0, dashV: 95, heavy: { kind: 'wave', range: 26, dmg: 14, crit: 0.22, knock: 1.9 } },
  mask: { tint: 0xffb14d, dashV: 120, heavy: { kind: 'cleave', range: 24, dmg: 22, crit: 0.42, knock: 2.2 } },
  virtual: { tint: 0x6fd0ff, dashV: 60, heavy: { kind: 'bolt', dmg: 14, crit: 0.28 } },
}

export function heroKit(key) {
  return HERO_KITS[key] || HERO_KITS.ninja
}

export const COLORS = {
  accent: '#ffe066',
  text: '#cdd7ee',
  dim: '#8ea0c0',
  good: '#7cfc98',
  danger: '#e06a6a',
}
