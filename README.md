# markilux — Atlanta Private Sale (Claude Code handoff)

Three related front-end deliverables for the markilux USA "Atlanta Private Sale" program, plus a Google-Sheet form backend. All are **plain HTML + CSS + vanilla JS** design references / working prototypes — recreate them in your target stack (React/Next recommended) using that project's patterns, or run them as-is for the event.

## Files

| File | What it is | Fidelity |
| --- | --- | --- |
| `private-sale-v2.html` | **Primary.** Long-scroll landing page with a real-time **3D awning configurator** (Three.js r158). | Hi-fi layout/copy/pricing; 3D model is medium-fi (upgrade target) |
| `index.html` | The original v1 landing page (same content, photo-based configurator, no 3D). Kept as reference/fallback. | Hi-fi |
| `investfest-signup.html` | Event lead-capture page for InvestFest 2026: sign-up form, kiosk mode, confirmation screen, organizer panel (list, CSV, copy, QR), Google-Sheet sync with offline queue. | Hi-fi, production-usable |
| `SHEET-SETUP.md` | 5-minute setup for the Google Apps Script backend the sign-up page posts to. | — |

## Design system (binding)
**Modernist** — flat, architectural, zero border-radius, 2px rules, flush-left everything, single red accent.
- Colors: markilux red `#E3000B` (dark `#B00009`), ink `#201e1d`, ground `#f3f2f2`, divider = ink @ ~40%.
- Type: **Archivo** headings (weight 800), **Open Sans** 400/600 body/labels.
- Rhythm: `--leading: 28px`, `--half: 14px`. No rounded corners anywhere. Red used sparingly — primary actions, kickers, and full-field "poster" bands.
- Stylesheet: `_ds/modernist-<id>/styles.css` (carries tokens + Archivo). Copy it in, or replace with your own token layer using the values above.

## private-sale-v2.html — page order
Sticky nav + scroll-progress bar → Ken-Burns hero (staggered reveal) → count-up stats (300ft²/20ft/30yr/50yr) → Collection (3 config cards, hover-lift, "Most popular" tag) + in-use video facade → Specs → **Configurator** → Heritage (native `assets/factory.mp4`) → Pricing (5-step horizontal timeline + not-included grid) → Market tiers (3 + red markilux band) → Estimated timeline → Process (6 steps) → Communities (3 phases) → red close/contact → footer. Plus a **payment/reserve modal** (installation video, card form, confirmation, deposit math).

Motion: `.rv` reveal (IntersectionObserver, staggered via `--d`), count-up stats, price tick, Ken Burns, slide-in modal. All respect `prefers-reduced-motion` where set.

## The 3D configurator (main upgrade area)
One IIFE at the bottom of `private-sale-v2.html`, global `THREE` r158 from CDN.

- **Scene**: procedural brick wall + wood deck (canvas-generated textures), lawn, 5 framed windows w/ reflective glass + limestone sills, French doors, furnished patio (wicker sofas, cushions, round table, rug, planters, lanterns that glow at dusk), fog.
- **Awning**: coverboard = `ExtrudeGeometry` from a hand-authored bezier `hoodShape` (approximates the 1600 semi-cassette, informed by a DXF section); fabric `PlaneGeometry` with the selected swatch jpg as repeating `map`; round front profile + rounded ends + chrome domes + badge; two-segment folding arms (flat box profiles) with chrome elbow/shoulder pins; sculpted end caps; wall sealing profile; torsion bar; per-width fabric panel seams; shadeplus drop screen; contact-shadow plane.
- **Materials**: `MeshPhysicalMaterial` clearcoat frame (color from selection), fabric `MeshStandardMaterial`, chrome (metalness 1 / roughness .07).
- **Day cycle**: `updateSun(t)` lerps 3 keyframes (dawn/noon/dusk) → sun position/color/intensity, canvas equirect sky env map, fog, exposure, ambient warmth, lantern emissive; view-dependent sun-flare sprite.
- **Controls**: pointer-drag orbit (damped), Extend/Retract, Time slider, and a scene-tweaks panel (Light exposure, Zoom, Shadows).
- **Sync**: configurator `render()` dispatches `cfg:change` on `document`; `sync()` reads the summary DOM (`#sum-width|fabric|frame|shadeplus`) → model width (retract→resize→re-extend), fabric texture, frame color, shadeplus state.

### Fidelity upgrade path
1. **Best:** get a real markilux 1600 mesh (STEP/GLB/OBJ via the dealer/brand portal), load with `GLTFLoader`, and keep the existing option-binding logic driving materials/scale. True parity.
2. Otherwise: export **clean single closed polylines per part** from CAD (the supplied DXF's outline is fragmented across entities, which defeated automated tracing) and extrude those exactly; add PBR normal/roughness maps for fabric weave and powder-coat; swap the canvas sky for an HDRI (`RGBELoader`); add SSAO/baked AO.
3. Fabric currently tiles a flat photo swatch — give it proper UVs following the projection plus a subtle catenary sag.

## Configurator options & pricing (must match exactly)
- **Width / configuration**: The Patio 10ft **$4,969** · The Terrace 15ft **$5,899** (Most popular) · The Outdoor Room 20ft **$6,999** — delivered prices, and the price base.
- **Fabric** (10; `assets/fabrics/<code>.jpg`): 41488, 41480, 31009, 30709, 30927, 30209, 41415, 31487, 31595, 31597.
- **Frame finish** (`assets/frames/<code>.jpg`; 3D color): 5233 Off-white `#E7E2D8` · RAL 9006 Aluminium `#9DA1A4` · 5215 Stone grey `#7E827F` · 5204 Anthracite `#34373A`.
- **shadeplus**: With **+$650** / Without (default Without).
- **Mounting**: Face / Soffit / Top-Roof fixture. **Motor side**: Left / Right. **Wind sensor**: Vibrabox White / Grey / None. **Installation**: Certified install ($1,000–1,500, quoted separately) / Self-install DIY.
- **Total** = width base + $650 if shadeplus. **Financing** line = total / 12 per month. **Deposit** = 50% of total, balance due before last-mile delivery. Multi-unit: 5% off two, 10% off three or more. Warranty: **12 years**.
- Contact: `privatesales@markilux.us`.

## investfest-signup.html
- Screens: kiosk **welcome** → **form** → **confirmation** (auto-returns after 7s in kiosk mode).
- Fields: Name*, Email*, Phone, City/state; **You are*** (Property owner / Contractor or builder / Designer or architect); **Would you be interested in** (markilux 1600 / other product lines, multi); **Timeline** (Ready now / Next 90 days / Later this year); Notes; consent checkbox* .
- **Organizer panel** — footer link, code `MKX-2026` (constant `ORGANIZER_CODE`): sign-up table with Sent/Queued status, CSV download, copy-to-clipboard, kiosk toggle, QR generator (qrcodejs CDN), and a **Backend** tab to paste the Apps Script URL, send a test row, and force-sync.
- **Persistence**: every entry saves to `localStorage` (`mkx.investfest.signups`) *and* POSTs JSON to the Apps Script Web App (URL in `mkx.investfest.endpoint`). Failures queue with `synced: false`, retry every 20s and on `online`; a red bar shows the pending count. The script de-dupes on `id`.
- Production hardening worth doing: move the endpoint to a build-time env var, add server-side validation/rate limiting, replace the client-side organizer code with real auth, and post to your ESP (Mailchimp/Klaviyo) with role + interest tags.

## Assets (`assets/`)
`fabrics/*.jpg` (10 swatches), `frames/*.jpg` (4 finishes), `hero-bg.png`, `awning-hero.png`, `config-scene-1600.jpg` (3D fallback still), `factory.mp4` + `factory-poster.jpg`, `markilux-wordmark.png`, plus additional product photos. YouTube facade video id (awning in use): `jxpzAPe5g_Q`.

## Caveats
- Three.js and qrcodejs load from CDN; in an offline/locked bundle the 3D viewer falls back to `config-scene-1600.jpg`. Install `three` via npm in a real app.
- The published-artifact host blocks external network, so CDN scripts and YouTube embeds don't run there — bundle deps and use local `<video>` for production.
- `index.html` and `private-sale-v2.html` share content; if you keep both, extract the copy/pricing into one data module so they can't drift.
