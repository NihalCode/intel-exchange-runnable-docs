# Performance

- No new network calls for visuals (palette uses client registry + auth context)
- SVG topology is inline and lightweight
- Atmosphere uses CSS gradients/masks (no images)
- Motion limited to CSS; disabled under `prefers-reduced-motion`
- Product hub remains SSG/server-rendered with existing `listProductManifests`
- Avoided full-screen blur and continuous heavy canvas effects

Gate: `npm run build` must complete without material regression vs prior structural UI wave.
