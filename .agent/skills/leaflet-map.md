# Leaflet Map Skill — FloodRoute Map Layer

Guidance for everything under `frontend/src/components/map/`.

## Marker types

Three node classes render as three distinct visual encodings:

| Marker | Node type | Component | Visual |
|--------|-----------|-----------|--------|
| Flood point | `flood` | `<CircleMarker>` | Filled circle, radius scales with volume, fill color from SI palette, 1px white stroke |
| Depot | `depot` | `<Marker>` custom `divIcon` | Squared 20×20 chip, `--color-indigo-ink` fill, white flame icon |
| IF (river) | `if` | `<Marker>` custom `divIcon` | Squared 20×20 chip, `--color-steel` fill, white droplet icon |

Prefer `CircleMarker` for flood points because size/color are the only encodings we need — no rotation, no anchor drift. Use `divIcon` for depots and IFs so we can style with CSS variables and skip PNG assets.

## SI color palette (map only)

Use these tokens on flood point markers. **Never** use them in sidebar UI.

```ts
export const SI_PALETTE = [
  { max: 0.2, token: 'var(--color-si-low)',      hex: '#22c55e', label: 'Rendah'    },
  { max: 0.4, token: 'var(--color-si-moderate)', hex: '#84cc16', label: 'Sedang'    },
  { max: 0.6, token: 'var(--color-si-elevated)', hex: '#eab308', label: 'Waspada'   },
  { max: 0.8, token: 'var(--color-si-high)',     hex: '#f97316', label: 'Tinggi'    },
  { max: 1.0, token: 'var(--color-si-critical)', hex: '#ef4444', label: 'Kritis'    },
]

export function siColor(si: number): string {
  for (const bucket of SI_PALETTE) if (si <= bucket.max) return bucket.hex
  return SI_PALETTE[SI_PALETTE.length - 1].hex
}
```

`react-leaflet` currently needs literal color strings on `CircleMarker.pathOptions.fillColor`, so `siColor()` returns the hex directly. UI SI legend chips can use the CSS-variable tokens.

## Route polylines

- One `<Polyline>` per vehicle. Color assigned by index modulo 8 from `--color-route-0` … `--color-route-7`.
- `weight` = 4 by default, 6 on hover.
- `dashArray` optional accessibility fallback for color-blind users (e.g., `'6 4'` on even indices).
- Route sequence: depot → visits (flood/IF) → depot. Draw the depot return leg explicitly.

## Popup styling — no shadow

Leaflet's default popup ships with a `box-shadow`. Override once in `globals.css`:

```css
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
  box-shadow: none !important;
  border: 1px solid var(--color-frost);
  border-radius: var(--radius-lg);
  background: var(--color-pure-white);
}
.leaflet-popup-content {
  font-family: var(--font-manrope);
  color: var(--color-midnight-ink);
  margin: 12px 14px;
}
```

Popup body follows DESIGN.md `Map Marker Popup`: title in heading-sm weight 300, body in body-sm weight 400, SI value shown as a colored pill (background from `SI_PALETTE`, white text, 9999px radius).

## Common gotchas

- Import `leaflet/dist/leaflet.css` **once** at the top of `src/app/layout.tsx` — not per-component.
- Do not mutate the default marker icon by importing PNGs. Use `divIcon` with inline SVG strings.
- Leaflet needs an explicit height on its container. The map wrapper must have `height: 100%` and a parent with a fixed height (`calc(100vh - var(--navbar-height))`).
- Never render `<MapContainer>` on the server — always via `next/dynamic` with `ssr: false`.
