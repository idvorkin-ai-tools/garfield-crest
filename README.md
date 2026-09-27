# Garfield High School crest

A 3D assembly animation of the Garfield High School (Seattle) crest: seven real components of the crest hold in an opening composition, then travel through depth and settle into the complete crest in about three seconds. Replay, Separate/Reassemble and Pause controls; drag (mouse or touch) to orbit. Respects `prefers-reduced-motion`.

Live: https://idvorkin-ai-tools.github.io/garfield-crest/

## How it is built

- `crest.png` is the source artwork. `tools/segment.py` cuts it into the seven pieces in `pieces/` (G and base, bulldog, mountain panel, Space Needle panel, winged shoe panel, shield frame, banner) plus `pieces/manifest.json` with each piece's pixel box. It is a connected-component cut along the artwork's dark outlines, with a mirror repair for the parts the bulldog covers. Run `uv run tools/segment.py` to regenerate.
- `app.js` renders the pieces as layered textured planes in Three.js (loaded from jsdelivr via an import map), with the choreography, orbit, trails and background effects. `style.css` is the chrome.
- No build step: a static site served by GitHub Pages from `main`.
