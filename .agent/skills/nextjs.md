# Next.js Skill — FloodRoute Frontend

Conventions for the `frontend/` package. See `PRD.md`, `AGENT.md`, `DESIGN.md` at repo root before editing.

## Framework

- **Next.js 15** with **App Router** (`src/app/`). Server components by default; add `'use client'` only when needed (state, effects, browser APIs, Leaflet).
- **TypeScript strict**. No `any`. Types live in `src/types/`.
- **Tailwind CSS v4** via `@theme` block in `globals.css`. No CSS modules, no styled-components, no inline `style` attributes except for dynamic route colors on Polyline strokes.

## Typography — Manrope only

Import from `next/font/google` in `src/app/layout.tsx`:

```tsx
import { Manrope } from 'next/font/google'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-manrope',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={manrope.variable}>
      <body className="font-[var(--font-manrope)]">{children}</body>
    </html>
  )
}
```

Never introduce sohne-var, Inter, or system-ui as visible text fonts. Weight 300 is the default; use 400 only for buttons and 12–16px UI text, 500 only for statistic numbers.

## react-leaflet — dynamic import (no SSR)

Leaflet touches `window` on import. Wrap every Leaflet-containing tree with `dynamic(() => import(...), { ssr: false })`:

```tsx
// src/components/map/map-container.tsx
'use client'
import dynamic from 'next/dynamic'

const MapInner = dynamic(() => import('./map-inner'), { ssr: false })

export function MapContainer() {
  return <MapInner />
}
```

Import `leaflet/dist/leaflet.css` **once** in `src/app/layout.tsx` (not in every map component).

## Component rules

- One component per file. Filename kebab-case (`results-panel.tsx`); export PascalCase (`ResultsPanel`).
- Props interface named `<Component>Props`, defined above the component.
- No default exports for feature components — use named exports so grep works.
- Colocate small child components in the same folder as the parent (e.g., `components/sidebar/param-input.tsx`).

## API layer

All fetches go through `src/lib/api.ts`. Never call `fetch` from a component directly. No `axios`. Handle non-`ok` responses by throwing so callers can `try/catch`.

## State

`useState` / `useReducer` only. No Redux/Zustand/Jotai. No `localStorage` / `sessionStorage`. Optimization result lives in the root client-boundary component and is passed down via props or context.

## Design tokens

Use CSS variables from `@theme` (e.g., `bg-[var(--color-mist)]`, `text-[var(--color-midnight-ink)]`). Never write hex codes in JSX except the two route-color arrays. **No `box-shadow` anywhere** — depth comes from tint shifts (see DESIGN.md).
