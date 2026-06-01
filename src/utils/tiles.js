// Terrain frames index into the Kenney pixel-platformer sheet (key 'terrain',
// 21x21 tiles, 30 columns). The sheet holds several biomes in one image, so
// each world picks its own region:
//   - matlab (marsh):   green grass  (rows 4-5)
//   - c (caverns):      grey stone   — TODO: point at the grey biome when built
//   - cpp (citadel):    purple block — TODO: point at the purple biome when built
// top = surface caps [left, mid, right]; fill = underground body; oneway = the
// thin drop-through ledge; ladderTint recolors the procedural vine.
export const TERRAIN_THEMES = {
  matlab: { top: [121, 123, 125], fill: [154, 154, 154], oneway: 8, ladderTint: 0x8fbf5a },
  c: { top: [121, 123, 125], fill: [154, 154, 154], oneway: 8, ladderTint: 0x9fb6c8 },
  cpp: { top: [181, 183, 185], fill: [214, 214, 214], oneway: 8, ladderTint: 0xc79be6 },
}

export const TILE = 21
