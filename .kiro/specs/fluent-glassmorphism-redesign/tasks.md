# Implementation Plan: Fluent Glassmorphism Redesign

## Overview

This plan implements the visual redesign in incremental CSS-first steps, followed by the one new React component (ScopeToggle), the CreateEditModal JSX update, and finally property-based and unit tests. Each task builds on the previous — design tokens first, then component styles that consume them, then the new component, then wiring and tests.

## Tasks

- [x] 1. Update design tokens and color palette in `src/index.css`
  - [x] 1.1 Add new shared design tokens to `:root`
    - Add `--color-primary: #0ea5e9` and `--color-accent: #e946a0` custom properties
    - Update `--radius` from `12px` to `16px`
    - Update `--glass-blur` from `blur(12px)` to `blur(16px)`
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 1.2 Update light theme tokens in `[data-theme="light"]`
    - Update `--color-bg-gradient` to 4-stop gradient: `linear-gradient(135deg, #3b82f6 0%, #8b5cf6 30%, #ec4899 65%, #06b6d4 100%)`
    - Update `--color-text` to `#1e293b`
    - Add `--color-text-secondary` for muted interactive text
    - Update `--glass-bg` to `rgba(255,255,255,0.55)`
    - Update `--glass-border` to `rgba(255,255,255,0.35)`
    - Update `--glass-shadow` to `0 8px 32px rgba(31,38,135,0.15)`
    - Update `--focus-ring` to `var(--color-primary)`
    - _Requirements: 1.3, 1.4, 2.2_

  - [x] 1.3 Update dark theme tokens in `[data-theme="dark"]`
    - Update `--color-bg-gradient` to 4-stop gradient: `linear-gradient(135deg, #1e3a5f 0%, #312e81 30%, #701a75 65%, #164e63 100%)`
    - Add `--color-text-secondary` for muted interactive text
    - Update `--glass-bg` to `rgba(30,41,59,0.6)`
    - Update `--glass-shadow` to `0 8px 32px rgba(0,0,0,0.35)`
    - Update `--focus-ring` to `var(--color-primary)`
    - _Requirements: 1.5, 1.6, 2.2_

- [x] 2. Implement glass surface treatments and utility classes
  - [x] 2.1 Add `glass--subtle` CSS class
    - Add `.glass--subtle` with reduced opacity background `rgba(255,255,255,0.3)`, `backdrop-filter: blur(8px)`, thinner border, and lighter shadow
    - Add dark theme override for `.glass--subtle` with lower opacity values
    - _Requirements: 2.3_

  - [x] 2.2 Add glass hover interactivity
    - Add `.glass:hover` rule with slight brightness increase via `filter: brightness(1.05)` or increased background opacity
    - _Requirements: 2.4_

- [x] 3. Update typography and Neo-Brutalism accents
  - [x] 3.1 Update app header title styling
    - Change `.app-header__title` font-size from `1.25rem` to `1.75rem`
    - Change font-weight from `600` to `800`
    - Add `letter-spacing: -0.02em`
    - _Requirements: 3.1, 3.4_

  - [x] 3.2 Update heading typography across components
    - Update `.modal__heading` font-weight to `700`, add `letter-spacing: -0.01em`
    - Update `.popular-links__heading` font-weight to `700`, font-size to `1.125rem`, add `letter-spacing: -0.01em`
    - _Requirements: 3.1, 3.3_

  - [x] 3.3 Update secondary heading weights
    - Ensure `.alias-card__alias` and `.popular-links__alias` use font-weight `600`
    - _Requirements: 3.2_

- [x] 4. Update button and interactive element styling
  - [x] 4.1 Restyle `.btn--primary` with gradient and Neo-Brutalism border
    - Change background to `linear-gradient(135deg, var(--color-primary), var(--color-accent))`
    - Add `border: 2px solid var(--color-primary)`
    - Ensure white text color
    - _Requirements: 4.1, 3.5_

  - [x] 4.2 Add tactile hover/press transforms to `.btn--primary`
    - Add hover: `transform: scale(1.03)` with increased shadow
    - Add active: `transform: scale(0.98)`
    - Add `transition` for transform property
    - _Requirements: 4.2, 4.3_

  - [x] 4.3 Update `.btn--danger` styling for WCAG contrast on glass surfaces
    - Ensure destructive color maintains 4.5:1 contrast against glass backgrounds in both themes
    - _Requirements: 4.4_

  - [x] 4.4 Update `:focus-visible` styles to use new primary/accent color
    - Update global `:focus-visible` outline to use `var(--color-primary)` with 2px width and visible offset
    - _Requirements: 4.5, 11.3_

  - [x] 4.5 Add reduced-motion overrides for button transforms
    - Inside `@media (prefers-reduced-motion: reduce)`, ensure scale transforms on `.btn--primary` hover/active are suppressed
    - _Requirements: 4.6_

- [x] 5. Checkpoint — Verify design tokens and base styles
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update Alias Card styles
  - [x] 6.1 Update alias card glass treatment and hover state
    - Ensure `.alias-card` uses consistent padding, `border-radius: var(--radius)`, and standard glass shadow
    - Add hover state with elevated shadow or brightness increase
    - _Requirements: 5.1, 5.5_

  - [x] 6.2 Update status badge colors for contrast on glass surfaces
    - Review and adjust badge background/text colors for both themes to meet WCAG AA contrast
    - _Requirements: 5.2_

  - [x] 6.3 Update personal badge to use accent color
    - Change `.alias-card__badge--personal` background and text to use `--color-accent` tones
    - _Requirements: 5.6_

  - [x] 6.4 Verify expired and expiring-soon card treatments
    - Confirm `.alias-card--expired` has reduced opacity and strikethrough on alias name
    - Confirm `.alias-card--expiring` has amber left border accent
    - _Requirements: 5.3, 5.4_

- [x] 7. Update modal and form styling
  - [x] 7.1 Update modal overlay and glass treatment
    - Ensure `.modal-overlay` has backdrop blur and dim overlay
    - Add `fadeSlideUp` keyframe animation to `.modal` (opacity 0→1, translateY 8px→0)
    - Add `prefers-reduced-motion` override to disable modal animation
    - _Requirements: 6.1, 6.8, 6.9_

  - [x] 7.2 Update form input styling
    - Ensure `.form-field__input` has semi-transparent background, subtle border, and focus state highlighting border with `--color-primary`
    - _Requirements: 6.2_

- [x] 8. Create ScopeToggle component and integrate into CreateEditModal
  - [x] 8.1 Create `src/components/ScopeToggle.tsx`
    - Implement segmented pill-style toggle with two options: "Private (Just You)" with lock icon and "Global (Company)" with globe icon
    - Use `role="radiogroup"` with `role="radio"` and `aria-checked` on each option for accessibility
    - Include sliding highlight element positioned absolutely behind buttons
    - Accept `isPrivate: boolean` and `onChange: (isPrivate: boolean) => void` props
    - Support keyboard navigation (arrow keys / Tab) with visible focus indicator
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

  - [x] 8.2 Add ScopeToggle CSS styles to `src/index.css`
    - Add `.scope-toggle` as a flex container with `glass--subtle` treatment, relative positioning, rounded border-radius, and padding
    - Add `.scope-toggle__option` with transparent background, `z-index: 1`, font-weight 600, and color transition
    - Add `.scope-toggle__option--active` with white text
    - Add `.scope-toggle__slider` with absolute positioning, `--color-primary` background, `width: calc(50% - 4px)`, and `transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)`
    - Add `prefers-reduced-motion` override to disable slider transition
    - _Requirements: 6.4, 6.5, 6.7_

  - [x] 8.3 Replace checkbox with ScopeToggle in `src/components/CreateEditModal.tsx`
    - Import `ScopeToggle` from `./ScopeToggle`
    - Replace the `<label className="form-field form-field--inline">` checkbox block with `<ScopeToggle isPrivate={isPrivate} onChange={setIsPrivate} />`
    - _Requirements: 6.3_

- [x] 9. Update remaining component styles
  - [x] 9.1 Update filter tabs styling
    - Style `.filter-tabs__tab--active` with `--color-primary` bottom border or background tint
    - Add hover state with increased text contrast
    - Ensure horizontal scrollability on narrow viewports
    - _Requirements: 7.2, 7.3, 7.4_

  - [x] 9.2 Update search bar styling
    - Ensure `.search-bar` renders as glass surface with integrated icon and shortcut indicator (already in place, verify consistency with new tokens)
    - _Requirements: 7.1_

  - [x] 9.3 Update toast notification styling
    - Ensure toasts use glass treatment with backdrop blur and type-tinted semi-transparent backgrounds
    - Verify slide-in animation from right side
    - Add `prefers-reduced-motion` override for toast animation
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.4 Update popular links section styling
    - Ensure each link item renders as glass surface with consistent spacing
    - Update heat indicator active bars to use `--color-accent`
    - Add hover state with subtle elevation/brightness
    - Update heading to use Neo-Brutalism typography (bold weight, tight letter-spacing)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 9.5 Update theme toggle styling
    - Style `.theme-toggle__btn--active` with `--color-primary` background and white/contrasting text
    - Add hover brightness increase on inactive segments
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 9.6 Update skeleton loader styling
    - Ensure `.skeleton` uses glass-tinted base color
    - Verify pulse animation exists and `prefers-reduced-motion` disables it
    - _Requirements: 12.1, 12.2_

- [x] 10. Checkpoint — Verify all visual changes and component integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Set up testing infrastructure
  - [x] 11.1 Install test dependencies and configure vitest for the frontend
    - Add `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, and `fast-check` as dev dependencies in root `package.json`
    - Create `vitest.config.ts` (or update `vite.config.ts`) with `test: { environment: 'jsdom' }` configuration
    - Create a test setup file if needed for `@testing-library/jest-dom` matchers
    - _Requirements: 11.3, 11.4_

- [ ] 12. Write property-based tests
  - [ ]\* 12.1 Write property test for WCAG AA contrast ratios
    - **Property 1: WCAG AA contrast for all text/background pairs**
    - Generate all text/background token pairs from both themes using fast-check
    - Compute relative luminance and contrast ratio for each pair
    - Assert >= 4.5:1 for normal text, >= 3:1 for large text
    - **Validates: Requirements 1.3, 4.4, 5.2, 8.3, 11.4**

  - [ ]\* 12.2 Write property test for glass surface treatment invariants
    - **Property 2: Glass surface treatment invariants**
    - Render each component that uses `.glass` class
    - Assert computed backdrop-filter blur >= 12px, background alpha < 1.0, border exists, box-shadow exists
    - **Validates: Requirements 2.1**

  - [ ]\* 12.3 Write property test for reduced motion compliance
    - **Property 3: Reduced motion suppresses all decorative animations**
    - With `prefers-reduced-motion: reduce` active, render all animated/transitioned elements
    - Assert animation-duration and transition-duration are near-zero
    - **Validates: Requirements 2.5, 4.6, 6.5, 8.4, 11.5, 12.2**

  - [ ]\* 12.4 Write property test for heading typography
    - **Property 4: Primary heading typography**
    - Render all primary heading elements (`.app-header__title`, `.modal__heading`, `.popular-links__heading`)
    - Assert font-weight >= 700 and (if font-size >= 1.25rem) letter-spacing <= -0.01em
    - **Validates: Requirements 3.1, 3.3**

  - [ ]\* 12.5 Write property test for focus indicators
    - **Property 5: Visible focus indicator on all interactive elements**
    - For all focusable elements, simulate focus-visible
    - Assert outline width >= 2px and outline uses primary/accent color
    - **Validates: Requirements 4.5, 11.3**

- [ ] 13. Write unit tests
  - [ ]\* 13.1 Write unit tests for design tokens and color palette
    - Verify `--color-primary` is `#0ea5e9` and `--color-accent` is `#e946a0`
    - Verify body gradient has 4 color stops in light theme
    - Verify `.glass--subtle` has lower blur than `.glass`
    - _Requirements: 1.1, 1.2, 2.2, 2.3_

  - [ ]\* 13.2 Write unit tests for typography and button styles
    - Verify `.app-header__title` has font-size >= 1.5rem and font-weight >= 800
    - Verify `.btn--primary` has 2px border and gradient background
    - _Requirements: 3.4, 3.5, 4.1_

  - [ ]\* 13.3 Write unit tests for ScopeToggle component
    - Verify renders as segmented pill with two options and sliding highlight
    - Verify `role="radiogroup"` and `aria-checked` attributes
    - Verify active option has white text and slider uses `--color-primary`
    - Verify keyboard accessibility
    - _Requirements: 6.3, 6.4, 6.6_

  - [ ]\* 13.4 Write unit tests for alias card, modal, and remaining component styles
    - Verify `.alias-card--expired` has reduced opacity and strikethrough
    - Verify `.alias-card--expiring` has amber left border
    - Verify `.modal` has fadeSlideUp animation
    - Verify `.filter-tabs__tab--active` uses primary color
    - Verify `.theme-toggle__btn--active` uses primary color background
    - Verify responsive breakpoints at 768px and 480px exist
    - _Requirements: 5.3, 5.4, 6.8, 7.2, 10.2, 11.1_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All CSS changes are in `src/index.css`; the only new file is `src/components/ScopeToggle.tsx`; the only JSX change is in `src/components/CreateEditModal.tsx`
