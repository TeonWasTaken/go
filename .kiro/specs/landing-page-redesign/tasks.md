# Implementation Plan: Landing Page Redesign

## Overview

Split the Go URL alias service frontend from a single-page Dashboard into a two-view architecture: a focused LandingPage (`/`) with Create Alias CTA and popular links, and a ManagePage (`/manage`) for full alias CRUD with filtering. Extract a persistent Header with global SearchBar and navigation. All changes are frontend-only using existing API endpoints.

## Tasks

- [ ] 1. Enhance SearchBar and create filterRecords utility
  - [x] 1.1 Add `onSubmit` and `initialValue` props to SearchBar
    - Modify `src/components/SearchBar.tsx` to accept optional `onSubmit` callback (called on Enter key press) and `initialValue` prop to pre-populate the input
    - Initialize internal `value` state from `initialValue` when provided
    - Call `onSubmit(value)` on form submit / Enter keypress in addition to the existing debounced `onSearch`
    - _Requirements: 4.4, 7.1_

  - [x] 1.2 Create `filterRecords` utility function
    - Create `src/utils/filterRecords.ts` exporting a pure function: `filterRecords(records: AliasRecord[], filter: ExpiryFilter): AliasRecord[]`
    - When filter is `"all"`, return all records; otherwise return records where `expiry_status === filter`
    - Export the `ExpiryFilter` type: `"all" | "active" | "expiring_soon" | "expired"`
    - _Requirements: 5.3_

  - [ ]\* 1.3 Write property test: filter tab produces correct subset
    - **Property 1: Filter tab produces correct subset**
    - **Validates: Requirements 5.3**
    - Create `src/components/__tests__/filterRecords.property.test.ts`
    - Use `fast-check` to generate arbitrary arrays of AliasRecord objects with random `expiry_status` values and a random filter value
    - Assert: when filter is `"all"`, result equals input; otherwise every result record has matching `expiry_status` and no matching records are missing from the result

  - [x] 1.4 Write property test: case-insensitive search matching
    - **Property 2: Case-insensitive search matches alias, URL, and title**
    - **Validates: Requirements 7.3**
    - Create `src/components/__tests__/searchMatch.property.test.ts`
    - Create a pure `matchesSearch(record: AliasRecord, term: string): boolean` function in `src/utils/searchMatch.ts` that checks case-insensitive substring match against `alias`, `destination_url`, and `title`
    - Use `fast-check` to generate arbitrary records and search strings
    - Assert: record is included iff `alias.toLowerCase()`, `destination_url.toLowerCase()`, or `title.toLowerCase()` contains `term.toLowerCase()`

- [ ] 2. Create LandingPage component
  - [x] 2.1 Implement LandingPage component
    - Create `src/components/LandingPage.tsx`
    - Render a large Create Alias CTA button with `btn--primary` class, positioned above the `PopularLinks` component
    - Manage `showCreate` and `refreshKey` state locally
    - Clicking CTA opens `CreateEditModal` in create mode (record=null)
    - On successful save, close modal and increment `refreshKey` to refresh PopularLinks
    - Do NOT render FilterTabs, AliasCard list, or any management controls
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ]\* 2.2 Write unit tests for LandingPage
    - Create `src/components/__tests__/LandingPage.test.tsx`
    - Test: CTA button renders with `btn--primary` class
    - Test: PopularLinks component is rendered
    - Test: No FilterTabs or alias list rendered
    - Test: Clicking CTA opens CreateEditModal
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [ ] 3. Create ManagePage component
  - [x] 3.1 Implement ManagePage component
    - Create `src/components/ManagePage.tsx`
    - Read search param `q` from URL via `useSearchParams` and pass as `initialValue` to SearchBar (rendered in header, synced via URL)
    - Fetch aliases using `getLinks({ search })` where search comes from URL param `q`
    - Render FilterTabs with options: All, Active, Expiring Soon, Expired
    - Apply `filterRecords` client-side to the fetched results based on selected tab
    - Render filtered aliases as `AliasCard` components with edit, delete, and renew handlers
    - Include a "Create Alias" button in the toolbar
    - Implement delete confirmation dialog (reuse existing pattern from AliasListPage)
    - Handle edit (open CreateEditModal with record), renew (call renewLink API), and create (open CreateEditModal with null)
    - Show toast errors on API failures, skeleton loaders while loading, empty state when no results
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.2, 7.4_

  - [ ]\* 3.2 Write unit tests for ManagePage
    - Create `src/components/__tests__/ManagePage.test.tsx`
    - Test: FilterTabs render with correct labels
    - Test: Alias cards render from fetched data
    - Test: Create Alias button present in toolbar
    - Test: Selecting a filter tab filters the displayed list
    - _Requirements: 5.1, 5.2, 5.7_

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Restructure App with Header and routing
  - [x] 5.1 Extract Header and update App routing
    - Modify `src/App.tsx` to render a persistent Header containing: app title "Go", SearchBar (with `onSubmit` for cross-page navigation), a "Manage My Links" `NavLink` to `/manage`, and ThemeToggle
    - On landing page, SearchBar `onSubmit` navigates to `/manage?q=term` using `useNavigate`
    - On manage page, SearchBar syncs with URL param `q`
    - Update Routes: `/` → LandingPage, `/manage` → ManagePage, keep `/interstitial` → InterstitialPage, `/kitchen-sink` → KitchenSinkPage, `/*` → AliasRedirect
    - Remove the old `Dashboard` component
    - Add responsive CSS for the header: collapse SearchBar on small viewports
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1_

  - [x] 5.2 Add `/manage` rewrite rule to staticwebapp.config.json
    - Add `{ "route": "/manage", "rewrite": "/index.html" }` before the `/{alias}` catch-all rule in `staticwebapp.config.json`
    - This ensures direct navigation to `/manage` serves the SPA shell instead of being caught by the alias redirect
    - _Requirements: 6.2_

  - [ ]\* 5.3 Write unit tests for routing and Header
    - Create `src/components/__tests__/App.test.tsx`
    - Test: `/` renders LandingPage
    - Test: `/manage` renders ManagePage
    - Test: Header contains SearchBar, "Manage My Links" link, ThemeToggle
    - Test: Searching from landing page navigates to `/manage?q=term`
    - _Requirements: 4.1, 6.1, 6.2, 7.1_

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- All changes are frontend-only; no API modifications needed
