# Enterprise Design System

## Purpose

This frontend uses an enterprise design system to keep the public site, auth flows, user workspace, and admin console visually consistent, accessible, and easier to extend.

The system is built around:

- shared Tailwind tokens in `tailwind.config.js`
- global utility classes in `src/index.css`
- reusable UI primitives in `src/components/ui`
- i18n resources in `src/i18n/resources.ts`
- shell layouts in `src/components/Layout.tsx` and `src/components/UserLayout.tsx`

## Design Principles

1. Trust first
   Use premium, clear surfaces and strong hierarchy for payment and wallet flows.

2. Operational clarity
   Make critical actions, balances, status, and summaries easy to scan.

3. Local familiarity
   Support Nigerian transaction patterns, terminology, and multilingual access.

4. Accessibility by default
   Preserve focus states, keyboard support, readable contrast, and clear labels.

5. Reuse before reinvention
   Build new screens from existing primitives before adding one-off styling.

## Tokens

Core tokens are defined in `tailwind.config.js`.

### Colors

- `app`: page background
- `ink`: primary text
- `muted`: secondary text
- `primary`: trust, action, active states
- `accent` and `secondary`: premium highlights, emphasis, secondary actions

The current palette supports a finance-oriented identity:

- `primary-600`: main action green
- `primary-700`: deep navigation and emphasis green
- `accent-500`: gold highlight for premium emphasis

### Shadows

- `shadow-soft`: standard card and surface depth
- `shadow-soft-lg`: elevated surfaces like menus and sidebars
- `shadow.focus`: focus-visible ring for accessibility

### Radius

- rounded corners default to large values such as `rounded-2xl`, `rounded-3xl`, and `rounded-4xl`
- this keeps the product soft, premium, and touch-friendly

### Typography

- base family: `Inter, system-ui, sans-serif`
- headings use tighter tracking and larger scale
- supporting copy uses `text-slate-500` or `text-slate-600` for lower emphasis

## Global UI Patterns

Global component classes live in `src/index.css`.

### Buttons

- `.enterprise-button-primary`: primary CTA
- `.enterprise-button-secondary`: secondary CTA

Use primary buttons for:

- account creation
- payment initiation
- admin confirmation actions

Use secondary buttons for:

- supporting navigation
- less critical actions
- alternate paths beside a primary CTA

### Inputs

- `.enterprise-input` provides the shared field treatment
- keep labels outside the field and ensure placeholders are not the only instruction

### Panels and Navigation

- `.enterprise-panel` is the standard glass surface treatment
- `.enterprise-nav-link` and `.enterprise-nav-link-active` define reusable nav behavior

## Core Primitives

### `ShellFrame`

File: `src/components/ui/ShellFrame.tsx`

Responsibility:

- applies the app background
- adds the radial and linear gradient atmosphere
- defines the main content landmark

Use it whenever a page or layout should sit inside the enterprise shell.

### `BrandMark`

File: `src/components/ui/BrandMark.tsx`

Responsibility:

- renders the logo and product name
- supports compact and full modes
- optionally shows a contextual subtitle

Use compact mode in constrained headers and expanded mode in sidebars or top-level navigation.

### `LanguageSwitcher`

File: `src/components/ui/LanguageSwitcher.tsx`

Responsibility:

- switches between English, Hausa, Yoruba, and Igbo
- exposes an accessible label through i18n

Place it in public, auth, user, and admin contexts where language switching is useful without making the layout noisy.

### `SurfaceCard`

File: `src/components/ui/SurfaceCard.tsx`

Responsibility:

- provides the standard rounded, translucent, elevated surface
- supports default and elevated depth

Use this instead of raw card wrappers for dashboards, hero sections, summaries, and action blocks.

### `StatCard`

File: `src/components/ui/StatCard.tsx`

Responsibility:

- standardizes KPI presentation
- handles icon tone treatment
- preserves consistent spacing and gradient accenting

Use for balances, uptime, revenue, transaction counts, and similar metrics.

### `PageHeader`

File: `src/components/ui/PageHeader.tsx`

Responsibility:

- standardizes page eyebrow, title, description, and action placement
- keeps user and admin screens consistent

Use at the top of every major screen that needs hierarchy and optional actions.

## Shell Architecture

### Public and Auth

Public and auth experiences use:

- `ShellFrame`
- `BrandMark`
- `LanguageSwitcher`
- `SurfaceCard`

This keeps landing and authentication screens premium but lightweight.

### User Workspace

`src/components/UserLayout.tsx` provides:

- collapsible sidebar
- mobile drawer behavior
- sticky workspace header
- notification and profile menus
- embedded language switching

### Admin Console

`src/components/Layout.tsx` provides:

- collapsible admin navigation
- elevated sidebar and mobile drawer
- notification center
- stronger information density for operational tasks

## Internationalization

Translations are stored in `src/i18n/resources.ts`.

Supported languages:

- English
- Hausa
- Yoruba
- Igbo

Current translation groups include:

- `common`
- `nav`
- `home`
- `auth`
- `dashboard`
- `admin`

When adding UI copy:

1. Add the English string first.
2. Add the matching keys in Hausa, Yoruba, and Igbo.
3. Prefer semantic keys like `dashboard.walletBalance` instead of page-specific hardcoded text.
4. Use `t()` for visible labels, button text, aria labels, and helper text where appropriate.

## Accessibility Standards

The design system expects:

- keyboard-accessible navigation and menus
- visible `:focus-visible` states
- sufficient text contrast on translucent surfaces
- semantic landmarks like `main`
- descriptive button and form labels
- motion that does not block comprehension

Do not remove focus rings, rely only on color for meaning, or hide important content behind hover-only interactions.

## Do and Do Not

### Do

- use shared primitives before adding custom wrappers
- keep spacing generous on transactional screens
- prefer `text-slate-*` with the token palette over ad hoc hex colors
- reuse button, input, and panel utility classes
- keep translated content short enough for mobile layouts

### Do Not

- create one-off dashboard stat cards
- bypass `LanguageSwitcher` for language-specific UI
- mix unrelated visual patterns inside the same section
- add dense tables or forms without mobile consideration
- introduce new color values without a token reason

## Recommended Composition

For a new dashboard page:

1. Wrap the screen in the existing layout.
2. Start with `PageHeader`.
3. Use `StatCard` for KPIs.
4. Use `SurfaceCard` for tables, filters, and summaries.
5. Pull all user-facing copy from i18n resources.

## Related Files

- `tailwind.config.js`
- `src/index.css`
- `src/components/ui/ShellFrame.tsx`
- `src/components/ui/BrandMark.tsx`
- `src/components/ui/LanguageSwitcher.tsx`
- `src/components/ui/SurfaceCard.tsx`
- `src/components/ui/StatCard.tsx`
- `src/components/ui/PageHeader.tsx`
- `src/components/Layout.tsx`
- `src/components/UserLayout.tsx`
- `src/i18n/resources.ts`
