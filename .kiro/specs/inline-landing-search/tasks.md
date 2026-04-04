# Implementation Plan: Inline Landing Search

## Overview

Replace the navigate-to-manage search behavior on the landing page with inline search results. Modify `App.tsx` to hold landing search state, update `LandingPage.tsx` to conditionally render results, enhance `SearchBar.tsx` with Escape key handling, and create a new `SearchResultsPanel.tsx` component that fetches and displays matching aliases in the same card style as PopularLinks.

## Tasks

- [x] 1. Modify SearchBar to support Escape key clearing
  - [x] 1.1 Add Escape key handler to SearchBar.tsx
    - Add `onKeyDown` handler to the `<input>` element that calls `setValue("")`, `onSearch("")`, and `inputRef.current?.blur()` when Escape is pressed
    - _Requirements: 6.2_

  - [ ]* 1.2 Write unit test for SearchBar Escape key behavior
    - Test that pressing Escape clears the input value and blurs the element
    - Test that `onSearch` is called with `""` on Escape
    - _Requirements: 6.2_

- [x] 2. Create SearchResultsPanel component
  - [x] 2.1 Create `src/components/SearchResultsPanel.tsx`
    - Accept `searchTerm: string` prop
    - Call `getLinks({ search: searchTerm })` in a `useEffect` when `searchTerm` changes
    - Manage `results`, `loading`, and `error` state
    - Use a `cancelled` flag in the effect cleanup to prevent stale updates
    - Render loading state using `SkeletonLoader` (same as PopularLinks)
    - Render results using `popular-links__list` / `popular-links__item` CSS classes for visual consistency
    - Each result item shows: `IconFallback`, alias path with prefix (`useAliasPrefix`), title, destination URL
    - Link `href` uses the same redirect URL format as PopularLinks (`/go-redirect/{alias}` in dev, `/api/redirect/{alias}` in prod)
    - Render empty state message when results array is empty (e.g., "No results found for '{term}'")
    - Render error message when API call fails
    - Include heading "Search Results" (`<h2>`)
    - Use `aria-label="Search results"` on the section element
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.3, 4.1, 4.2, 5.2_

  - [ ]* 2.2 Write unit tests for SearchResultsPanel
    - Test loading state renders skeletons while API is pending
    - Test empty state renders message when API returns `[]`
    - Test error state renders message when API rejects
    - Test heading says "Search Results"
    - Test result items contain alias, title, URL, and icon
    - _Requirements: 2.1, 2.2, 2.3, 3.3, 4.2_

- [x] 3. Modify App.tsx to manage landing search state
  - [x] 3.1 Add `landingSearchTerm` state and update search handlers
    - Add `const [landingSearchTerm, setLandingSearchTerm] = useState("")`
    - Modify `handleHeaderSearch`: when `location.pathname === "/"`, call `setLandingSearchTerm(term)` instead of navigating
    - Modify `handleHeaderSubmit`: when `location.pathname === "/"`, call `setLandingSearchTerm(term)` instead of navigating
    - Add `useEffect` on `location.pathname` to reset `landingSearchTerm` to `""` when navigating away from `/`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Pass `searchTerm` prop to LandingPage
    - Update the `<LandingPage />` route element to `<LandingPage searchTerm={landingSearchTerm} />`
    - _Requirements: 1.1, 1.2_

- [x] 4. Modify LandingPage to accept searchTerm and toggle panels
  - [x] 4.1 Update LandingPage.tsx to accept `searchTerm` prop
    - Add `LandingPageProps` interface with `searchTerm?: string`
    - Conditionally render `SearchResultsPanel` when `searchTerm` is non-empty, or `PopularLinks` when empty
    - Import `SearchResultsPanel`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 4.2 Write unit test for LandingPage panel toggling
    - Test that `PopularLinks` renders when `searchTerm` is empty or undefined
    - Test that `SearchResultsPanel` renders when `searchTerm` is non-empty
    - Test that `PopularLinks` is hidden when `SearchResultsPanel` is shown
    - _Requirements: 1.2, 1.3_

- [x] 5. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Property-based tests
  - [ ]* 6.1 Write property test: Search term controls panel visibility toggle
    - **Property 1: Search term controls panel visibility toggle**
    - Generate arbitrary strings (including empty, whitespace-only, non-empty) with `fc.string()`
    - For each, render `LandingPage` with that `searchTerm` and assert the correct panel is visible
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 6.2 Write property test: Search result items contain all required fields
    - **Property 2: Search result items contain all required fields**
    - Generate arbitrary `AliasRecord` objects with `fc.record(...)` matching the `AliasRecord` shape
    - For each, render `SearchResultsPanel` with that record in the mocked API response and assert alias, title, URL, and icon are present
    - **Validates: Requirements 2.1**

  - [ ]* 6.3 Write property test: SearchBar retains focus during search interactions
    - **Property 3: SearchBar retains focus during search interactions**
    - Generate arbitrary non-empty strings with `fc.string({ minLength: 1 })`
    - Simulate typing into `SearchBar`, wait for results, assert input remains focused
    - **Validates: Requirements 3.1, 3.4**

  - [ ]* 6.4 Write property test: API call includes correct search parameter
    - **Property 4: API call includes correct search parameter**
    - Generate arbitrary non-empty strings with `fc.string({ minLength: 1 })`
    - Trigger a search on the landing page and assert `getLinks` was called with `{ search: term }`
    - **Validates: Requirements 4.1**

  - [ ]* 6.5 Write property test: Search result redirect URLs match PopularLinks format
    - **Property 5: Search result redirect URLs match PopularLinks format**
    - Generate arbitrary `AliasRecord` objects
    - Render the search result item and assert the link href matches the expected redirect URL format
    - **Validates: Requirements 5.2**

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The existing `getLinks({ search })` API and PopularLinks CSS classes are reused — no backend or style changes needed
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
