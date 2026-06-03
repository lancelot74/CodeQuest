// Terrain frames index into the Kenney pixel-platformer sheet (key 'terrain',
// 21x21 tiles, 30 columns). The sheet is bright/pastel, so each world picks a
// neutral stone biome and recolors it with `tint` (multiply) for mood:
//   - matlab (marsh):   grey stone tinted dark slate-blue (a shadowy bog)
//   - c (caverns):      grey stone   — TODO: own tint when built
//   - cpp (citadel):    purple block — TODO: own tint when built
// top = surface caps [left, mid, right]; fill = underground body; oneway = the
// drop-through ledge (rendered a shade lighter); tint multiplies every terrain
// tile; ladderTint recolors the procedural vine.
export const TERRAIN_THEMES = {
  matlab: {
    top: [301, 303, 305],
    fill: [334, 334, 334],
    oneway: 334,
    tint: 0x47566e,
    onewayTint: 0x8597b0,
    ladderTint: 0xb7c6dc,
    bgTint: 0x3c4660,
    hillTint: 0x2b3450,
    reedTint: 0x4f6f59,
    moteTint: 0xbfe9c4,
  },
  c: { top: [301, 303, 305], fill: [334, 334, 334], oneway: 334, tint: 0x5a6b7e, onewayTint: 0x8aa0b2, ladderTint: 0x9fb6c8 },
  cpp: { top: [181, 183, 185], fill: [214, 214, 214], oneway: 214, tint: 0x6e5a86, onewayTint: 0xa48fc0, ladderTint: 0xc79be6 },
}

export const TILE = 21
