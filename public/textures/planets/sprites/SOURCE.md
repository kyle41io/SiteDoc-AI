# Planet sticker sprites

These PNGs are **derived assets**. Each one is a single planet cut out of
`../planets.jpeg`, with the sheet's white background made transparent so the
hero porthole colour shows through.

| File | Tier | Crop from `planets.jpeg` (x, y, w, h) |
| --- | --- | --- |
| `moon.png` | moon (score < 40) | 8, 781, 232, 232 |
| `mars.png` | mars (40–59) | 205, 958, 216, 216 |
| `saturn.png` | saturn (60–79) | 14, 20, 358, 217 |
| `earth.png` | earth (80–89) | 38, 289, 285, 286 |
| `sun.png` | sun (90–99) | 366, 6, 303, 302 |

A perfect 100 uses `../galaxy.jpeg` directly, full bleed.

The cutouts are produced in five steps:

1. **Background removal** — a border-seeded flood fill over near-white pixels
   (min channel > 232, saturation < 16), so white *inside* a sticker — its
   outline and highlights — is preserved while the surrounding sheet is cleared.
2. **Largest blob only** — some crop boxes overlap a neighbouring sticker (the
   sun's box clips Saturn's rings), so only the biggest surviving connected
   shape is kept and stray fragments are dropped.
3. **Erode 2px** — JPEG ringing leaves a pale cream halo just inside where the
   flood fill stops. Untouched, it shows as a dirty outline against the
   porthole colour, so the mask is eroded past it.
4. **Colour bleed** — the sticker's own colours are grown outward into the
   eroded band, so the new boundary is the planet's hue, not the halo's cream.
5. **Soft alpha** — the mask edge gets a 3x3 box blur, so the rim anti-aliases
   against whatever colour the porthole is instead of stair-stepping.

Stickers whose art has its own dark outline (Saturn) keep it; the outline blocks
the flood fill, so the white ring inside it survives untouched.

> **Licensing:** `planets.jpeg` and `galaxy.jpeg` were supplied by the project
> maintainer; their origin and licence are not recorded here. Confirm the rights
> for these two source images before shipping publicly.
