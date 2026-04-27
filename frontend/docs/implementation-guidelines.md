# Design System Implementation Guidelines

## Goal

Use this guide when building or refactoring frontend screens so new work stays aligned with the enterprise shell, accessibility standards, and multilingual experience already in the app.

## Screen Construction Order

For most new pages, follow this order:

1. Choose the right shell
   - public or auth pages should live inside `ShellFrame`
   - user pages should render within `UserLayout`
   - admin pages should render within `Layout`

2. Establish hierarchy
   - add `PageHeader` first
   - define title, description, and top-level actions before building content blocks

3. Assemble content with shared surfaces
   - use `SurfaceCard` for summaries, lists, forms, and empty states
   - use `StatCard` for metrics and KPI rows

4. Apply standard actions and fields
   - use `.enterprise-button-primary` and `.enterprise-button-secondary`
   - use `.enterprise-input` for form controls

5. Wire copy through i18n
   - add translation keys before finalizing markup

## Layout Rules

### Public and Auth

- keep the hero and navigation visually light
- prioritize one primary CTA and one secondary CTA
- keep content blocks readable on mobile widths
- show `LanguageSwitcher` where it helps users discover multilingual support

### User Pages

- treat the workspace header and sidebar as stable anchors
- keep common actions near the top of the page
- use short labels for quick tasks like data, airtime, wallet, and bills
- support narrow screens by avoiding overly wide tables as the first experience

### Admin Pages

- prioritize scanability for dense operational data
- use headers and cards to break up complex screens
- keep destructive or high-risk actions visually distinct
- prefer filters and summaries above long result tables

## Copy and Content Rules

- use plain, confident language
- prefer terms Nigerian users already know: airtime, data, wallet, transfer, reseller
- avoid internal engineering language in visible UI
- keep CTA text action-oriented
- keep dashboard labels short so translations do not overflow

Examples:

- good: `Fund wallet`
- good: `Buy data`
- less suitable: `Initiate wallet funding workflow`

## i18n Workflow

When adding user-facing strings:

1. Create a semantic translation key in `src/i18n/resources.ts`.
2. Add values for English, Hausa, Yoruba, and Igbo.
3. Replace hardcoded UI strings with `t('...')`.
4. Check layouts in compact widths because translated text may be longer.

Use translation keys for:

- headings
- button labels
- helper text
- menu labels
- aria labels
- empty and error states

## Styling Rules

- prefer token classes such as `bg-primary-600`, `text-slate-600`, and `shadow-soft`
- reuse `enterprise-*` utility classes wherever possible
- use large radii consistently
- keep translucent surfaces readable by pairing them with strong text contrast
- introduce custom styling only when the existing primitives cannot support the pattern

## Motion Rules

The app already uses Framer Motion and shared motion helpers.

- animate entrance and transitions sparingly
- keep animations focused on `opacity` and `transform`
- avoid motion that delays task completion
- respect reduced-motion expectations
- use the existing animation guide before introducing new variants

Reference: `ANIMATION_GUIDE.md`

## Forms and Transaction Flows

For payment or purchase flows:

- surface the primary action clearly
- keep field order logical for mobile entry
- show provider, amount, and recipient details clearly before submission
- preserve accessible labels and error states
- avoid burying validation messages under translucent layers or collapsed panels

## Dashboard Patterns

### KPI Rows

- use `StatCard`
- keep titles concise
- show one supporting meta value only when it adds context

### Section Blocks

- use `SurfaceCard`
- begin with a clear section label
- keep one primary purpose per card

### Page Headers

- use `PageHeader` for all major screens
- use an eyebrow only when the product area needs context
- keep actions to one or two items where possible

## Navigation and Menus

- preserve keyboard access for sidebar, notification, and profile interactions
- keep icon meaning paired with text labels
- avoid hiding key workflows behind hover-only affordances
- keep mobile drawer overlays clear and dismissible

## Definition of Done

A frontend screen change is ready when it:

- uses existing design-system primitives appropriately
- pulls visible copy from i18n resources
- works on mobile and desktop
- preserves focus treatment and accessible labels
- avoids ad hoc colors and card patterns
- passes diagnostics
- passes targeted tests or build validation when appropriate

## Review Checklist

Before merging a UI change, confirm:

- the screen uses the correct layout shell
- the top-level hierarchy is obvious
- buttons and inputs use shared styling
- text is translated or translation-ready
- spacing matches nearby enterprise screens
- notifications, menus, or drawers remain usable with keyboard and touch
- no new visual pattern duplicates an existing primitive
