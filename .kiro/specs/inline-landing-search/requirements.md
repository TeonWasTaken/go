# Requirements Document

## Introduction

Currently, typing in the header SearchBar navigates the user to the `/_/manage` page to display results. This creates a jarring context switch, especially for unauthenticated users who have no reason to land on a management page. This feature moves search results inline onto the landing page, displaying them in the same card-based style as the PopularLinks section, while keeping the search input responsive and focused throughout the interaction.

## Glossary

- **Landing_Page**: The root route (`/`) of the application, rendered by `LandingPage.tsx`, which displays popular links and a "Create New" button.
- **Search_Bar**: The header search input component (`SearchBar.tsx`) that accepts a search term and fires debounced callbacks.
- **Search_Results_Panel**: A new UI region on the Landing_Page that displays alias records matching the current search term, styled consistently with the PopularLinks list.
- **Popular_Links**: The existing section on the Landing_Page that shows trending or all-time popular alias links in a card-based list.
- **Alias_Record**: A link object returned by the API containing alias, destination URL, title, icon, click count, heat score, and expiry metadata.
- **API_Service**: The client-side fetch wrapper (`api.ts`) that calls `/api/links` with optional search, sort, and scope parameters.

## Requirements

### Requirement 1: Inline Search on Landing Page

**User Story:** As a user on the landing page, I want search results to appear directly on the landing page, so that I do not lose context by being redirected to the manage page.

#### Acceptance Criteria

1. WHEN the user is on the Landing_Page and types a search term into the Search_Bar, THE Landing_Page SHALL display matching Alias_Records in the Search_Results_Panel without navigating away from the Landing_Page.
2. WHEN the user is on the Landing_Page and the Search_Bar contains a non-empty search term, THE Landing_Page SHALL hide the Popular_Links section and show the Search_Results_Panel in its place.
3. WHEN the user clears the Search_Bar or the search term becomes empty, THE Landing_Page SHALL hide the Search_Results_Panel and restore the Popular_Links section.
4. WHILE the user is on the `/_/manage` route, THE Search_Bar SHALL continue to filter results on the manage page as it does currently.

### Requirement 2: Search Results Visual Consistency

**User Story:** As a user, I want search results to look like the popular links cards, so that the experience feels cohesive and familiar.

#### Acceptance Criteria

1. THE Search_Results_Panel SHALL display each matching Alias_Record using the same card layout as the Popular_Links list items, including icon, alias path, title, and destination URL.
2. THE Search_Results_Panel SHALL include a heading that indicates the user is viewing search results (e.g., "Search Results").
3. WHEN the search query returns zero matching Alias_Records, THE Search_Results_Panel SHALL display an empty-state message indicating no results were found.

### Requirement 3: Responsive Search Input Behavior

**User Story:** As a user, I want the search input to feel responsive while I type, so that I get fast feedback without losing my place.

#### Acceptance Criteria

1. WHEN the user types in the Search_Bar on the Landing_Page, THE Search_Bar SHALL retain input focus until the user explicitly clicks outside the Search_Bar or presses Escape.
2. THE Search_Bar SHALL debounce search API calls by 300 milliseconds to avoid excessive network requests while the user is typing.
3. WHILE the API_Service is fetching search results, THE Search_Results_Panel SHALL display a loading indicator to communicate that results are being retrieved.
4. WHEN the API_Service returns search results, THE Search_Results_Panel SHALL update its content without causing the Search_Bar to lose focus or the page to scroll unexpectedly.

### Requirement 4: Search API Integration

**User Story:** As a user, I want search to query the server for matching aliases, so that I see accurate results across all public links.

#### Acceptance Criteria

1. WHEN the Landing_Page needs to display search results, THE API_Service SHALL call the `/api/links` endpoint with the `search` query parameter set to the current search term.
2. IF the API_Service call fails, THEN THE Search_Results_Panel SHALL display a user-readable error message and THE Landing_Page SHALL remain functional.

### Requirement 5: Unauthenticated User Support

**User Story:** As an unauthenticated user, I want to search for links on the landing page, so that I can find what I need without signing in.

#### Acceptance Criteria

1. THE Landing_Page SHALL allow unauthenticated users to use the Search_Bar and view the Search_Results_Panel without requiring sign-in.
2. WHEN an unauthenticated user clicks a search result link, THE Landing_Page SHALL navigate the user to the alias redirect URL, consistent with how Popular_Links items behave.

### Requirement 6: Keyboard Accessibility

**User Story:** As a keyboard user, I want to interact with search results using the keyboard, so that the feature is accessible without a mouse.

#### Acceptance Criteria

1. WHEN the user presses the `/` key while no input element is focused, THE Search_Bar SHALL receive focus, consistent with the existing keyboard shortcut.
2. WHEN the user presses Escape while the Search_Bar is focused, THE Search_Bar SHALL clear its value and blur, restoring the Popular_Links section.
