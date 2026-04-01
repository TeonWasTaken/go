# Implementation Plan: UI/UX Improvements

## Overview

Eight UI/UX improvements implemented incrementally: routing config fix, visual redesigns (heat indicator, background, glow effects, sliding pills), interaction changes (card click-through, auto-scrape title/icon), and a date picker bug fix. Each task builds on the previous, with wiring and integration at the end.

## Tasks

- [ ] 1. Alias redirect routing fix (staticwebapp.config.json)
  - [x] 1.1 Add explicit SPA route rewrites for `/interstitial` and `/kitchen-sink` before the alias catch-all
    - Add `{ "route": "/interstitial", "rewrite": "/index.html" }` and `{ "route": "/kitchen-sink", "rewrite": "/index.html" }` entries in the `routes` array
    - _Requirements: 1.1_
  - [x] 1.2 Add `/{alias}` rewrite rule to forward to the redirect Azure Function
    - Add `{ "route": "/{alias}", "rewrite": "/api/redirect/{alias}" }` after the SPA routes but before the `/*` catch-all
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Heat indicator redesign
  - [x] 2.1 Replace HeatIndicator component in `src/components/PopularLinks.tsx`
    - Replace the 5-bar signal indicator with a horizontal progress bar using `role="meter"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` with popularity level
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Update CSS in `src/index.css`: remove old `.heat-indicator` styles, add `.heat-bar` and `.heat-bar__fill` styles
    - Fixed width (80px), 8px height, gradient fill from `--color-primary` to `--color-accent`, border-radius 4px
    - _Requirements: 2.2, 2.4_
  - [ ]\* 2.3 Write property test for heat indicator fill and label
    - **Property 1: Heat indicator fill percentage and accessible label**
    - **Validates: Requirements 2.1, 2.3**

- [ ] 3. Link card click-through navigation
  - [x] 3.1 Update `src/components/AliasCard.tsx` to make card body clickable
    - Add `onClick` handler to `<article>` that opens `record.destination_url` in a new tab via `window.open`
    - Replace text Edit button with a cog icon button (`alias-card__btn--icon`) in the header title row
    - Add `e.stopPropagation()` on the cog button and on the actions div to prevent click-through
    - Retain Delete and Renew buttons in the actions area
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_
  - [x] 3.2 Update `src/components/PopularLinks.tsx` to make items clickable
    - Change `<li>` to `<a>` (or wrap content in `<a>`) with `href={link.destination_url}`, `target="_blank"`, `rel="noopener noreferrer"`
    - Maintain list semantics with `role="listitem"` if needed
    - _Requirements: 3.2_
  - [ ]\* 3.3 Write property test for click-through navigation
    - **Property 2: Click-through navigation on alias cards and popular link items**
    - **Validates: Requirements 3.1, 3.2**
  - [ ]\* 3.4 Write property test for edit button isolation
    - **Property 3: Edit button stops propagation and has correct accessible label**
    - **Validates: Requirements 3.4, 3.6**

- [ ] 4. Corporate grey background with geometric pattern
  - [x] 4.1 Update CSS theme variables in `src/index.css`
    - Light theme: set `--color-bg: #e8eaed`, remove gradient, add `--color-bg-pattern` with low-contrast radial-gradient dot grid
    - Dark theme: set `--color-bg: #1a1d23`, remove gradient, add `--color-bg-pattern` with low-contrast radial-gradient dot grid
    - Update `body` styles to use `background-color: var(--color-bg)` and `background-image: var(--color-bg-pattern)` with `background-size: var(--color-bg-pattern-size)`
    - Preserve all `.glass` and `.glass--subtle` styles unchanged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x] 4.2 Write property test for WCAG AA contrast ratios
    - **Property 4: WCAG AA contrast ratios on new background**
    - **Validates: Requirements 4.7**

- [ ] 5. Glow effect on all interactive elements
  - [x] 5.1 Add glow CSS custom properties and hover/focus styles in `src/index.css`
    - Define `--glow-shadow` and `--glow-shadow-subtle` in `:root`
    - Apply `box-shadow: var(--glow-shadow-subtle)` to `.btn:hover`, `.filter-tabs__tab:hover`, `.glass:hover`
    - Apply glow to `.scope-toggle__slider`
    - Apply `box-shadow: var(--glow-shadow)` to `:focus-visible`
    - Suppress glow transitions in `@media (prefers-reduced-motion: reduce)` block
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [ ]\* 5.2 Write property test for focus-visible glow
    - **Property 5: Focus-visible glow on interactive elements**
    - **Validates: Requirements 5.5**
  - [ ]\* 5.3 Write property test for reduced motion suppression
    - **Property 6: Reduced motion suppresses glow transition animations**
    - **Validates: Requirements 5.6**

- [x] 6. Checkpoint - Verify visual changes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Sliding pill design for expiry policy selector
  - [x] 7.1 Refactor `src/components/ExpiryPolicySelector.tsx` to use sliding pill toggles
    - Replace button-based type selector with a 3-option sliding pill (Never, Expire on date, After inactivity) matching `ScopeToggle` pattern
    - Replace button-based duration selector with a 3-option sliding pill (1 month, 3 months, 12 months)
    - Compute slider `translateX` based on selected index: `translateX(index * 100%)`
    - Add keyboard navigation (ArrowLeft/ArrowRight) within each pill group
    - Use `role="radiogroup"` and `role="radio"` with `aria-checked`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - [x] 7.2 Add `.expiry-pill`, `.expiry-pill__option`, `.expiry-pill__slider` CSS in `src/index.css`
    - Slider width `calc(33.333% - 4px)` for 3-option pills
    - Same visual style as `.scope-toggle__slider`
    - _Requirements: 6.1, 6.2_
  - [ ]\* 7.3 Write property test for pill slider position
    - **Property 7: Sliding pill slider position for N-option toggles**
    - **Validates: Requirements 6.3, 6.4**
  - [ ]\* 7.4 Write property test for pill aria-checked and keyboard navigation
    - **Property 8: Pill toggle aria-checked and keyboard navigation**
    - **Validates: Requirements 6.5, 6.6**

- [ ] 8. Date picker fix
  - [x] 8.1 Fix date value handling in `src/components/ExpiryPolicySelector.tsx`
    - Change `onChange` to produce `${e.target.value}T23:59:59.999Z` instead of `new Date(e.target.value).toISOString()`
    - Change `value` to display `custom_expires_at.split("T")[0]` for correct round-trip
    - Ensure `min` attribute is set to today's date string
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]\* 8.2 Write property test for date round-trip
    - **Property 11: Date picker produces valid ISO 8601 and round-trips display**
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [ ] 9. Auto-scrape page title and icon from destination URL
  - [x] 9.1 Add `icon_url` field to data models
    - Add `icon_url: string | null` to `AliasRecord` in `api/src/shared/models.ts`
    - Add optional `icon_url?: string` to `CreateAliasRequest` and `UpdateAliasRequest` in `api/src/shared/models.ts`
    - Add `icon_url: string | null` to `AliasRecord` in `src/services/api.ts`
    - Add optional `icon_url?: string` to `CreateAliasPayload` and `UpdateAliasPayload` in `src/services/api.ts`
    - Update seed data in `api/src/shared/seed-data.ts` to include `icon_url: null` on all records
    - _Requirements: 7.10_
  - [x] 9.2 Create `api/src/functions/scrapeTitle.ts` Azure Function
    - Implement `GET /api/scrape-title?url={encodedUrl}` endpoint
    - Fetch target URL with 5s timeout, extract `<title>` and favicon/icon `<link>` from HTML
    - Resolve relative icon URLs, fall back to `/favicon.ico`
    - Return `{ title: string, iconUrl: string }`, return empty strings on any error
    - _Requirements: 7.1, 7.3, 7.8_
  - [x] 9.3 Add `scrapeMetadata` function to `src/services/api.ts`
    - Implement `scrapeMetadata(url: string): Promise<{ title: string; iconUrl: string }>` that calls `/api/scrape-title`
    - Return `{ title: "", iconUrl: "" }` on failure
    - _Requirements: 7.1_
  - [x] 9.4 Update `src/components/CreateEditModal.tsx` with auto-scrape logic
    - Add `titleManuallyEdited` state (false in create mode, true in edit mode)
    - Add `titleLoading` state and `iconUrl` form state
    - Add debounced (500ms) effect on destination URL change in create mode: call `scrapeMetadata`, populate title and icon_url if user hasn't manually edited
    - Show "Fetching title..." placeholder while loading
    - Set `titleManuallyEdited = true` on manual title input change
    - Skip auto-fetch entirely in edit mode
    - Include `icon_url` in the create/update payload
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [x] 9.5 Update `src/components/AliasCard.tsx` to display icon
    - Show `<img>` with `src={record.icon_url}` in the title row when `icon_url` is present
    - Show placeholder icon (🔗) when `icon_url` is null/empty
    - Add `onError` handler to hide broken images and show placeholder
    - Add `.alias-card__icon` and `.alias-card__icon-placeholder` CSS
    - _Requirements: 7.8, 7.9_
  - [ ]\* 9.6 Write property test for manual title preservation
    - **Property 9: Manual title edit prevents auto-overwrite**
    - **Validates: Requirements 7.5**
  - [ ]\* 9.7 Write property test for debounce behavior
    - **Property 10: Title fetch debounce**
    - **Validates: Requirements 7.7**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The routing fix (task 1) is config-only with no code changes
- Visual CSS changes (tasks 2, 4, 5) can be done in parallel
- The auto-scrape feature (task 9) is the most complex, involving API, frontend, and data model changes
