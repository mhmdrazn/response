# FloodRoute Surabaya -- Design System
> indigo-ink ledger on frosted glass

**Theme:** light

FloodRoute uses a near-monochrome financial-instrument language adapted for a spatial decision support tool: a soft cool-white canvas with deep navy headings, almost no decorative chrome, and one vivid indigo (#533afd) that earns the right to be a button, link, or icon stroke. Typography is exclusively Manrope at weight 300 -- even at 56px display size -- which reads as confident restraint rather than corporate shouting; letter-spacing tightens aggressively as size grows. Buttons are small, squared at 4px, and use violet fills or hairline violet outlines. The system avoids shadows entirely; depth comes from background tint shifts (white -> #f8fafd -> #e5edf5 -> violet washes) rather than elevation. The map area is the hero: it dominates the viewport while the sidebar delivers dense, ledger-like controls and metrics in a compact column.

## Tokens -- Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Indigo Ink | `#533afd` | `--color-indigo-ink` | Violet action color for filled buttons, selected navigation states, and focused conversion moments. |
| Indigo Hover | `#7389ff` | `--color-indigo-hover` | Violet text accent for links, tags, and emphasized short phrases. Do not promote it to the primary CTA color. |
| Midnight Ink | `#061b31` | `--color-midnight-ink` | Primary heading and body text -- deep near-black with a cool blue undertone that anchors the entire type system. |
| Slate | `#64748d` | `--color-slate` | Secondary text for labels, captions, and metadata. |
| Steel | `#50617a` | `--color-steel` | Tertiary body text and helper copy -- sits between slate and the muted violet tints used on sub-labels. |
| Smoke | `#839bc8` | `--color-smoke` | Muted violet-tinted text for large decorative headings and supporting copy -- never for body paragraphs. |
| Pure White | `#ffffff` | `--color-pure-white` | Page canvas and elevated card surfaces. |
| Mist | `#f8fafd` | `--color-mist` | Sidebar background and section banding -- a barely-perceptible cool tint that separates regions without a visible line. |
| Frost | `#e5edf5` | `--color-frost` | Primary border color, subtle surface tint, and button hover backgrounds; the workhorse neutral that divides content. |
| Lavender Border | `#b9b9f9` | `--color-lavender-border` | Hairline outline button border (1px) -- the violet companion to indigo fills. |
| Lilac Border | `#d6d9fc` | `--color-lilac-border` | Secondary outline button border and softer dividers. |
| Periwinkle Wash | `#e8e9ff` | `--color-periwinkle-wash` | Lightest violet surface -- soft tinted backgrounds for highlighted cards, tag pills, and subtle emphasis blocks. |
| Deep Violet | `#182659` | `--color-deep-violet` | Heaviest accent stroke -- rare use for emphasized borders or graphic frames. |
| Amethyst Edge | `#7f71e6` | `--color-amethyst-edge` | Mid-violet outline border for secondary interactive elements. |

### Severity Index Palette (Map Only)

These colors are used exclusively on the map for flood point markers. They form a diverging green-yellow-red scale that communicates severity at a glance. These are NOT part of the general UI palette.

| SI Range | Color | Token | Meaning |
|----------|-------|-------|---------|
| 0.0 -- 0.2 | `#22c55e` | `--si-low` | Low severity |
| 0.2 -- 0.4 | `#84cc16` | `--si-moderate` | Moderate severity |
| 0.4 -- 0.6 | `#eab308` | `--si-elevated` | Elevated severity |
| 0.6 -- 0.8 | `#f97316` | `--si-high` | High severity |
| 0.8 -- 1.0 | `#ef4444` | `--si-critical` | Critical severity |

### Vehicle Route Colors (Map Only)

A curated set of hues chosen for distinguishability on the map tile background. Assigned round-robin to vehicles.

| Index | Color | Token |
|-------|-------|-------|
| 0 | `#533afd` | `--route-0` |
| 1 | `#e11d48` | `--route-1` |
| 2 | `#0891b2` | `--route-2` |
| 3 | `#c026d3` | `--route-3` |
| 4 | `#ea580c` | `--route-4` |
| 5 | `#059669` | `--route-5` |
| 6 | `#7c3aed` | `--route-6` |
| 7 | `#0284c7` | `--route-7` |

---

## Tokens -- Typography

### Manrope -- Sole type family across the entire interface -- headings, body, navigation, buttons, and labels. Weight 300 dominates even at 56px display size, which is the signature: headlines whisper instead of shout, earning authority through restraint rather than volume. Weight 400 appears only at 14-16px for navigation and button text where small-size readability needs the extra stroke. Weight 500 reserved for metric/stat numbers only. - `--font-manrope`

- **Source:** Google Fonts (`https://fonts.google.com/specimen/Manrope`)
- **Weights:** 300, 400, 500
- **Sizes:** 12, 14, 16, 18, 20, 22, 26, 32, 48, 56
- **Line height:** 1.00, 1.03, 1.10, 1.12, 1.20, 1.40, 1.45
- **Letter spacing:** -0.0100em at 26px and below; -0.0200em at 32-48px; -0.0250em at 56px -- tracking tightens as type grows, creating the characteristic 'pulled-in' feel of the headlines
- **OpenType features:** `"tnum" on` (tabular numerals for metrics and tables)

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Token |
|------|------|--------|-------------|----------------|-------|
| caption | 12px | 300 | 1.45 | -0.12px | `--text-caption` |
| body-sm | 14px | 400 | 1.4 | -0.14px | `--text-body-sm` |
| body | 16px | 400 | 1.2 | -0.16px | `--text-body` |
| body-lg | 20px | 300 | 1.4 | -0.2px | `--text-body-lg` |
| subheading | 22px | 300 | 1.1 | -0.22px | `--text-subheading` |
| heading-sm | 26px | 300 | 1.12 | -0.26px | `--text-heading-sm` |
| heading | 32px | 300 | 1.1 | -0.64px | `--text-heading` |
| heading-lg | 48px | 300 | 1.03 | -0.96px | `--text-heading-lg` |
| display | 56px | 300 | 1.03 | -1.4px | `--text-display` |
| stat | 48px | 500 | 1.00 | -0.96px | `--text-stat` |

---

## Tokens -- Spacing & Shapes

**Base unit:** 8px

**Density:** comfortable for sidebar; compact for results tables

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 24 | 24px | `--spacing-24` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 48 | 48px | `--spacing-48` |
| 64 | 64px | `--spacing-64` |

### Border Radius

| Element | Value |
|---------|-------|
| tags / pills | 9999px |
| cards | 8px |
| inputs | 6px |
| buttons | 6px |
| map container | 0px (flush with viewport edge) |

### Layout

- **Sidebar width:** 380px (collapsible on smaller screens)
- **Navbar height:** 56px
- **Sidebar internal padding:** 24px
- **Card padding:** 16px (sidebar cards are compact)
- **Element gap:** 8px
- **Section gap within sidebar:** 24px
- **Map area:** fills remaining viewport (calc(100vw - 380px))

---

## Components

### Primary Filled Button
**Role:** Main action -- "Jalankan Optimasi", "Bandingkan Algoritma"

Background #533afd, white text (#ffffff), 6px radius, padding 10px 20px. Typography: Manrope weight 400 at 14px. On hover, lightens to #7389ff. No shadow. Compact sizing for sidebar context.

### Ghost Outline Button
**Role:** Secondary action -- "Reset Parameter", "Export Hasil"

Transparent background, violet text (#533afd), 1px border in #b9b9f9, 6px radius, padding 9px 20px. Manrope 400 at 14px. The lavender border is intentionally lighter than the text.

### Sidebar Section Card
**Role:** Grouping related controls or results in the sidebar

White (#ffffff) surface on mist (#f8fafd) sidebar background. 1px border in #e5edf5. 8px radius. 16px internal padding. Section title: Manrope 300 at 14px in #64748d, uppercase, letter-spacing 0.5px. Content below with 12px gap.

### Parameter Input
**Role:** Number inputs for algorithm parameters

6px radius, 1px border #e5edf5, background white. Label above in caption style (12px, #64748d). Input text: Manrope 400 at 14px, #061b31. Focus border: #533afd. Compact height: 36px.

### Metric Block
**Role:** Displaying optimization results -- "Z = 42.7", "Total: 87.3 km"

Number rendered at stat size (Manrope 500 at 32-48px, #061b31, tight letter-spacing) with a slate-colored label below at caption size. No card border -- the number carries the visual weight. Tabular numerals enabled.

### Map Marker Popup
**Role:** Information shown when clicking a flood point, depot, or IF marker

White background, 8px radius, max-width 280px. Title in heading-sm weight. Body in body-sm. SI value shown as a colored pill matching the severity palette. No shadow on popup (override Leaflet default).

### Results Table
**Role:** Per-vehicle breakdown of route results

Compact table with 1px #e5edf5 row borders. Header row: caption size, uppercase, #64748d. Body rows: body-sm, #061b31. Alternate row background: transparent / #f8fafd. Cell padding: 8px 12px.

### Convergence Chart
**Role:** Line chart of best Z vs iteration

Rendered via Recharts. Background transparent. Grid lines in #e5edf5. Line color: #533afd for Hybrid ACS, #ef4444 for VNS. Axis labels in caption style. No chart border.

### Navbar
**Role:** Top-level navigation bar

White background, 1px #e5edf5 bottom border. Left: app name "FloodRoute" in Manrope 400 at 18px, #061b31, with a small indigo dot or flame icon. Right: dark mode toggle (P2). Fixed height 56px.

---

## Do's and Don'ts

### Do
- Use #533afd exclusively for primary actions, active links, and icon strokes
- Set all headings to Manrope weight 300 -- the whisper-weight is the signature
- Tighten letter-spacing as type size grows
- Apply font-feature-settings: 'tnum' on to all numeric displays
- Use 6px border-radius on buttons and inputs, 8px on cards
- Let the map be the visual hero -- the sidebar is the ledger, the map is the canvas
- Use the SI severity palette only on map markers, never in sidebar UI
- Separate sidebar sections with 1px #e5edf5 dividers and 24px gaps

### Don't
- Do not use shadows, blurs, or any form of CSS elevation on cards, buttons, or panels -- depth comes from background tint, never from box-shadow
- Do not introduce accent colors outside the defined palettes
- Do not use semibold or bold weights for headings -- weight 300 at display size is the typographic identity
- Do not fill large areas with #533afd -- the indigo appears in small functional doses
- Do not override Leaflet's map tile styling or add custom map backgrounds -- use the standard OSM tiles
- Do not center text in the sidebar -- all sidebar text is left-aligned
- Do not use sohne-var, Inter, or any font other than Manrope

---

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas | `#ffffff` | Map area background, card surfaces |
| 1 | Mist | `#f8fafd` | Sidebar background, banding |
| 2 | Frost | `#e5edf5` | Borders, dividers, hover backgrounds |
| 3 | Periwinkle | `#e8e9ff` | Highlighted cards, active states |
| 4 | Indigo | `#533afd` | Filled button surfaces, selected tab |

## Elevation

No shadows. Depth and hierarchy are created through background tint progression (white -> mist -> frost -> periwinkle -> indigo), hairline 1px dividers, and whitespace. No card has a box-shadow. No button has a shadow on any state.

---

## Quick Start

### Next.js + Tailwind v4 Setup

Import Manrope from Google Fonts in `app/layout.tsx`:

```tsx
import { Manrope } from 'next/font/google'

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-manrope',
  display: 'swap',
})

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={manrope.variable}>
      <body>{children}</body>
    </html>
  )
}
```

### CSS Custom Properties

```css
@theme {
  /* Colors */
  --color-indigo-ink: #533afd;
  --color-indigo-hover: #7389ff;
  --color-midnight-ink: #061b31;
  --color-slate: #64748d;
  --color-steel: #50617a;
  --color-smoke: #839bc8;
  --color-pure-white: #ffffff;
  --color-mist: #f8fafd;
  --color-frost: #e5edf5;
  --color-lavender-border: #b9b9f9;
  --color-lilac-border: #d6d9fc;
  --color-periwinkle-wash: #e8e9ff;
  --color-deep-violet: #182659;
  --color-amethyst-edge: #7f71e6;

  /* SI Palette (map markers only) */
  --color-si-low: #22c55e;
  --color-si-moderate: #84cc16;
  --color-si-elevated: #eab308;
  --color-si-high: #f97316;
  --color-si-critical: #ef4444;

  /* Route Colors */
  --color-route-0: #533afd;
  --color-route-1: #e11d48;
  --color-route-2: #0891b2;
  --color-route-3: #c026d3;
  --color-route-4: #ea580c;
  --color-route-5: #059669;
  --color-route-6: #7c3aed;
  --color-route-7: #0284c7;

  /* Typography */
  --font-manrope: 'Manrope', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography -- Scale */
  --text-caption: 12px;
  --leading-caption: 1.45;
  --tracking-caption: -0.12px;
  --text-body-sm: 14px;
  --leading-body-sm: 1.4;
  --tracking-body-sm: -0.14px;
  --text-body: 16px;
  --leading-body: 1.2;
  --tracking-body: -0.16px;
  --text-body-lg: 20px;
  --leading-body-lg: 1.4;
  --tracking-body-lg: -0.2px;
  --text-subheading: 22px;
  --leading-subheading: 1.1;
  --tracking-subheading: -0.22px;
  --text-heading-sm: 26px;
  --leading-heading-sm: 1.12;
  --tracking-heading-sm: -0.26px;
  --text-heading: 32px;
  --leading-heading: 1.1;
  --tracking-heading: -0.64px;
  --text-heading-lg: 48px;
  --leading-heading-lg: 1.03;
  --tracking-heading-lg: -0.96px;
  --text-display: 56px;
  --leading-display: 1.03;
  --tracking-display: -1.4px;

  /* Typography -- Weights */
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;

  /* Layout */
  --sidebar-width: 380px;
  --navbar-height: 56px;
  --sidebar-padding: 24px;
  --card-padding: 16px;
  --element-gap: 8px;
  --section-gap: 24px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 9999px;

  /* Surfaces */
  --surface-canvas: #ffffff;
  --surface-mist: #f8fafd;
  --surface-frost: #e5edf5;
  --surface-periwinkle: #e8e9ff;
  --surface-indigo: #533afd;
}
```
