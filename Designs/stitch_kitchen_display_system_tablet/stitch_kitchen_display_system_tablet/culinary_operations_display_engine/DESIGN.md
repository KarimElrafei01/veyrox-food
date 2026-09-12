---
name: Culinary Operations Display Engine
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bbcabf'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#86948a'
  outline-variant: '#3c4a42'
  surface-tint: '#4edea3'
  primary: '#4edea3'
  on-primary: '#003824'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#006c49'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#ff7a73'
  on-tertiary-container: '#79000e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Chivo
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
  headline-lg:
    fontFamily: Chivo
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Chivo
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
  headline-sm:
    fontFamily: Chivo
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  body-lg:
    fontFamily: Chivo
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-md:
    fontFamily: Chivo
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 22px
  body-sm:
    fontFamily: Chivo
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 18px
  timer-display:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 28px
  timer-display-sm:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  touch-min: 3rem
  touch-target: 3.5rem
  gutter-ticket: 0.75rem
  column-gap: 1rem
  ticket-padding-x: 1rem
  ticket-padding-y: 0.875rem
  item-row-gap: 0.5rem
  edge-safe-margin: 1.25rem
---

## Brand & Style

The design system is engineered specifically for mission-critical commercial kitchen display systems (KDS) deployed on wall-mounted and station-side tablet hardware. In an environment characterized by heat, steam, ambient glare, greasy touch surfaces, and relentless pace, the visual language prioritizes immediate scannability from 4 to 8 feet away.

The design movement combines **Industrial Utility** with **High-Contrast Functionalism**. Visual clutter is eradicated; typography, deliberate color zoning, and tactile physical targets guide line cooks, expeditors, and kitchen managers under extreme cognitive load. Every pixel serves situational awareness: tickets communicate chronological urgency, dietary modifiers stand out without hesitation, and touch feedback is immediate and unmistakable.

## Colors

The palette is tuned to cut through condensation, smoke, and overhead industrial fluorescent lighting while minimizing cook eye strain during 12-hour shifts.

- **Background & Canvas (`#0f172a`)**: Deep obsidian-slate base ensuring pitch-dark backdrop contrast and OLED energy efficiency.
- **Surface Elevation (`#1e293b`)**: Muted secondary slate providing sharp ticket card containment.
- **Surface Highlight / Dividers (`#334155`)**: High-definition demarcation lines separating columns, modifiers, and sub-orders.
- **Kitchen Green (`#10b981`)**: Primary action driver; signals active connectivity, freshly started orders, and completed/bumped dish states.
- **Alert Amber (`#f59e0b`)**: Secondary driver; flags orders approaching target window thresholds (warning phase: 8–12 minutes).
- **Emergent Red (`#ef4444`)**: Tertiary driver; signifies overdue tickets (>15 minutes), critical allergy alerts, or station hold states.
- **Warm Gold (`#eab308`)**: Specialized functional accent indicating VIP, priority delivery tiers, or catering bulk orders.
- **Text & Foreground**: Primary crisp white (`#f8fafc`) for maximum contrast ratios (>12:1 against dark surfaces), with muted secondary text (`#94a3b8`) reserved exclusively for non-urgent metadata.

## Typography

The typographic hierarchy pairs the high-velocity legibility of **Chivo** for structural hierarchy, ticket names, and line items, with the mechanical rigor of **JetBrains Mono** for numerical values, elapsed timers, order IDs, and modifiers.

- Headings and line items use bold weights to ensure text never breaks or thins out under severe screen glare or oil smudges.
- All elapsed and countdown timers strictly use monospaced figures (`JetBrains Mono`) to eliminate horizontal jitter when seconds tick.
- Item modifiers (e.g., "NO ONION", "EXTRA CHEESE") use bold uppercase styling at `label-lg` with heightened tracking (+0.05em) for instantaneous recognition.

## Layout & Spacing

The layout operates on an adaptable Multi-Column Ticket Rail:
- **Tablet Landscape & Wall Displays (10"–22")**: A multi-column horizontal flow containing 3 to 6 ticket columns simultaneously based on display width. Columns do not shrink below `300px` width; overflow tickets paginate or scroll via wide edge paddles.
- **Touch Targets**: Buttons, bump bars, and status triggers must measure at least `48px` (ideally `56px`, referenced as `touch-target`) to accommodate damp fingers, gloved operations, or rapid glancing taps.
- **Rhythm**: Internal card spacing preserves dense vertical packing (`8px`–`14px`) to show the maximum number of items per ticket without scrolling, while ticket-to-ticket gutters are fixed at `12px` (`0.75rem`) to maintain unambiguous perimeter separation.

## Elevation & Depth

This system intentionally rejects ambient blur shadows and soft neomorphic skeuomorphism, which wash out in bright, reflective kitchen environments. Visual hierarchy is established through **Surface Tiering** and **High-Contrast Solid Outlines**:

- **Level 0 (Base Grid)**: Deepest slate tone (`#0f172a`).
- **Level 1 (Standard Ticket Container)**: Elevated surface (`#1e293b`) with a continuous 1.5px perimeter outline (`#334155`).
- **Level 2 (Active/Selected Card)**: Elevated surface (`#1e293b`) bordered by an unmistakable 2px illuminated outline corresponding directly to ticket health: Kitchen Green (`#10b981`), Alert Amber (`#f59e0b`), or Emergent Red (`#ef4444`).
- **Level 3 (Modal / Expeditor Override Sheet)**: Darkened overlay backdrop (`#020617` at 85% opacity) with a solid `#1e293b` dialog surface reinforced with a 2px high-visibility `#475569` border.

## Shapes

The design system enforces compact corner profiles (`roundedness: 1`, 4px base radius) across all interactive elements and ticket containers. 

Soft or fully rounded pill surfaces are restricted exclusively to small status badges. Clean, block-like geometry maximizes available screen real estate, aligns tightly with industrial hardware bezels, and reinforces the rugged efficiency expected in commercial back-of-house culinary workstations.

## Components

### 1. Ticket Cards
- Built on surface `#1e293b` with a dedicated header band indicating order source (Dine-In, Takeout, Delivery partner), table number, and order ID.
- The ticket header features a full-width colored top status bar (4px) corresponding to order age (Green -> Amber -> Red).
- Monospaced persistent timer locked in the top-right corner.
- Dedicated footer containing the primary bump button spanning the full width of the card.

### 2. Bump & Action Buttons
- Minimum height of 56px (`touch-target`).
- Full-bleed or ticket-wide layout with prominent text labels in `headline-sm` or `label-lg`.
- Tactile pressed feedback: immediate scale shift (`0.98`) accompanied by a solid contrast inversion (e.g., solid `#10b981` surface flashing bright white `#f8fafc` on touch release).

### 3. Order Item Rows & Modifiers
- Completed line items toggle through strikethrough styling and 40% opacity drop on single tap.
- Allergen and special-instruction chips render with an inverted high-contrast background: Alert Amber or Emergent Red with pure black text `#000000` to prevent missed instructions.

### 4. Status Chips & Badges
- Compact rectangles with 4px border radius.
- Always include an icon and bold text label to avoid color-only reliance for color-blind kitchen staff.
- Priority and VIP tags render in solid Warm Gold (`#eab308`) with deep charcoal text (`#0f172a`).

### 5. Expeditor Summary Bar
- Sticky bar at the bottom or top of the screen displaying real-time aggregates: Active Count, Average Ticket Time, Overdue Count, and Recall Last Bump button.