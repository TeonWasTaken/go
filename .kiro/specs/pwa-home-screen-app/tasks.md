# Implementation Plan: PWA Home Screen App

## Overview

Add PWA capabilities to the Go URL Alias Service using `vite-plugin-pwa`. This includes generating a web app manifest and service worker at build time, creating a standalone-mode detection hook, building a dedicated HomeScreenPage component, and updating the SWA config for anonymous access to PWA assets. Tasks are ordered so each step builds on the previous, ending with integration wiring.

## Tasks

- [x] 1. Install vite-plugin-pwa and add PWA icon assets
  - [x] 1.1 Install `vite-plugin-pwa` as a dev dependency
    - Run `npm install -D vite-plugin-pwa` in the project root
    - _Requirements: 2.2, 5.4_

  - [x] 1.2 Add PWA icon PNG files to `public/`
    - Create `public/pwa-192x192.png` (192×192) and `public/pwa-512x512.png` (512×512) derived from `public/favicon.svg`
    - These can be placeholder PNGs initially; the important thing is the files exist at the correct paths and sizes
    - _Requirements: 6.1, 6.2_

- [x] 2. Configure vite-plugin-pwa in vite.config.ts
  - [x] 2.1 Add VitePWA plugin to vite.config.ts
    - Import `VitePWA` from `vite-plugin-pwa`
    - Add `VitePWA` to the plugins array with:
      - `registerType: 'autoUpdate'`
      - `manifest` object: `name: "Go"`, `short_name: "Go"`, `start_url: "/"`, `display: "standalone"`, `theme_color`, `background_color`, icons array referencing `pwa-192x192.png` and `pwa-512x512.png` with correct `sizes` and `type`
      - `workbox.runtimeCaching`: cache-first for static assets, network-first for `/api/*` requests
    - _Requirements: 1.1, 1.3, 2.2, 5.4, 6.2_

- [x] 3. Update index.html with PWA meta tags
  - [x] 3.1 Add meta and link tags to index.html
    - Add `<meta name="theme-color" content="...">` matching the manifest theme_color
    - Add `<meta name="apple-mobile-web-app-capable" content="yes">`
    - Add `<link rel="apple-touch-icon" href="/pwa-192x192.png">`
    - The `<link rel="manifest">` is injected automatically by vite-plugin-pwa
    - _Requirements: 1.2, 1.4, 6.3_

- [x] 4. Create useStandaloneMode hook
  - [x] 4.1 Implement `src/hooks/useStandaloneMode.ts`
    - Create the `src/hooks/` directory if it doesn't exist
    - Implement `useStandaloneMode(): boolean` hook
    - Check `window.matchMedia('(display-mode: standalone)').matches` and `(navigator as any).standalone` for iOS
    - Listen for `matchMedia` change events and update state
    - Return `false` if `matchMedia` is not supported (graceful fallback)
    - _Requirements: 5.2, 5.3_

  - [ ]* 4.2 Write property test for useStandaloneMode alias submission logic
    - **Property 1: Alias submission navigates to correct path**
    - Test that for any non-empty, non-whitespace alias string, the submit handler produces a navigation to `/${alias}`
    - Use `fast-check` with `fc.string()` filtered to non-empty trimmed values, minimum 100 iterations
    - Place test in `src/components/__tests__/homeScreenPage.property.test.ts`
    - **Validates: Requirements 3.4**

  - [ ]* 4.3 Write property test for empty input disabling submit
    - **Property 2: Empty or whitespace-only input disables submit**
    - Test that for any whitespace-only string (including empty), the submit action is disabled and no navigation occurs
    - Use `fast-check` with `fc.stringOf(fc.constantFrom(' ', '\t', '\n', ''))` and `fc.constant('')`, minimum 100 iterations
    - Place test in `src/components/__tests__/homeScreenPage.property.test.ts`
    - **Validates: Requirements 3.5**

- [x] 5. Implement HomeScreenPage component
  - [x] 5.1 Create `src/components/HomeScreenPage.tsx`
    - Display the Go logo using `useTheme()` to select light/dark variant
    - Display tagline "Where do you want to go today?"
    - Render a single text input with placeholder text (e.g., "Type an alias…")
    - Input font size must be at least 16px to prevent iOS auto-zoom
    - Add a submit button; disable it when input is empty or whitespace-only
    - On submit, navigate to `/${alias.trim()}` using `window.location.href` (to trigger the SWA redirect rule or dev proxy)
    - Use the existing glassmorphism design system (glass surfaces, theme variables)
    - Center content vertically and horizontally, fully responsive
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Add CSS styles for HomeScreenPage in `src/index.css`
    - Add `.home-screen-page` styles for vertical/horizontal centering
    - Style the alias input, submit button, tagline, and logo layout
    - Use existing CSS custom properties (glass-bg, glass-blur, color-primary, etc.)
    - Ensure responsive behavior on mobile viewports
    - _Requirements: 4.2, 4.3_

  - [ ]* 5.3 Write unit tests for HomeScreenPage
    - Test that tagline text is rendered
    - Test that input field with placeholder is rendered
    - Test that Go logo is present
    - Test submit button is disabled when input is empty
    - Test submit navigates on valid input
    - Test theme-aware logo (light vs dark)
    - Place tests in `src/components/__tests__/HomeScreenPage.test.tsx`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Wire standalone mode into App.tsx routing
  - [x] 7.1 Update App.tsx to conditionally render HomeScreenPage
    - Import `useStandaloneMode` from `src/hooks/useStandaloneMode`
    - Import `HomeScreenPage` from `src/components/HomeScreenPage`
    - At the `/` route, render `HomeScreenPage` when `isStandalone` is true, otherwise render `LandingPage`
    - When in standalone mode, hide the app header (no nav bar in the focused home screen experience)
    - Ensure all existing routes (`/_/manage`, `/_/interstitial`, `/_/kitchen-sink`, `/_/not-found`, `/{alias}`) remain unchanged
    - _Requirements: 5.1, 5.2, 5.3, 4.1, 3.6_

  - [ ]* 7.2 Write unit tests for standalone mode routing
    - Mock `useStandaloneMode` to return `true`, verify `HomeScreenPage` renders at `/`
    - Mock `useStandaloneMode` to return `false`, verify `LandingPage` renders at `/`
    - Place tests in `src/components/__tests__/standaloneRouting.test.tsx`
    - _Requirements: 5.2, 5.3_

- [x] 8. Update staticwebapp.config.json for PWA assets
  - [x] 8.1 Add anonymous access routes for PWA files
    - Add route entries for `/manifest.json` and `/sw.js` before the `/{alias}` catch-all route
    - These routes should allow anonymous access (no `allowedRoles` restriction) so the browser can fetch them without authentication
    - _Requirements: 5.5_

  - [ ]* 8.2 Write unit test for SWA config PWA routes
    - Read `staticwebapp.config.json` and verify it contains routes for `/manifest.json` and `/sw.js` that allow anonymous access
    - Verify these routes appear before the `/{alias}` catch-all
    - Place test alongside existing SWA config tests
    - _Requirements: 5.5_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `vite-plugin-pwa` plugin handles manifest injection and service worker generation automatically at build time
