# Requirements Document

## Introduction

Redesign the Go URL alias service landing page to simplify the user experience. The current single-page layout shows everything at once (popular links, full alias list with filters, search, and create button). The redesign splits the application into two distinct views: a focused landing page at `go/` with a prominent "Create Alias" call-to-action and popular links, and a separate "Manage My Links" page for full link management with filtering and editing. The header is updated to house the search box and a navigation link to the management page.

## Glossary

- **Landing_Page**: The default view rendered at the `go/` route, displaying the Create Alias CTA and popular links.
- **Manage_Page**: A dedicated page for viewing, filtering, and editing the current user's aliases.
- **Header**: The persistent top-level navigation bar visible on all pages, containing the app title, search box, theme toggle, and Manage My Links link.
- **Create_Alias_CTA**: The primary call-to-action button on the Landing_Page that opens the CreateEditModal in create mode.
- **Popular_Links_Section**: A section on the Landing_Page displaying the top/most-used aliases ranked by heat score.
- **Filter_Tabs**: A set of tab buttons on the Manage_Page that filter aliases by expiry status (all, active, expiring soon, expired).
- **Search_Bar**: The search input component relocated to the Header for global alias searching.
- **Router**: The client-side React Router configuration that maps URL paths to page components.

## Requirements

### Requirement 1: Landing Page Layout

**User Story:** As a user, I want to see a simplified landing page when I visit `go/`, so that I can quickly create a new alias or browse popular links without distraction.

#### Acceptance Criteria

1. WHEN a user navigates to the `go/` route, THE Landing_Page SHALL render the Create_Alias_CTA and the Popular_Links_Section as the only primary content areas.
2. THE Landing_Page SHALL NOT render the full alias list, Filter_Tabs, or link management controls.
3. THE Create_Alias_CTA SHALL be the most visually prominent element on the Landing_Page, positioned above the Popular_Links_Section.

### Requirement 2: Create Alias Call-to-Action

**User Story:** As a user, I want a prominent "Create Alias" button on the landing page, so that I can immediately start creating a new short link.

#### Acceptance Criteria

1. THE Create_Alias_CTA SHALL be rendered as a large, visually distinct button using the primary gradient style (`btn--primary`).
2. WHEN a user activates the Create_Alias_CTA, THE Landing_Page SHALL open the CreateEditModal in create mode.
3. WHEN the CreateEditModal saves a new alias successfully, THE Landing_Page SHALL close the modal and refresh the Popular_Links_Section.

### Requirement 3: Popular Links on Landing Page

**User Story:** As a user, I want to see the most popular links on the landing page, so that I can quickly access frequently used aliases.

#### Acceptance Criteria

1. THE Popular_Links_Section SHALL fetch and display aliases sorted by heat score using the existing `getLinks({ scope: "popular" })` API call.
2. WHEN the popular links data is loading, THE Popular_Links_Section SHALL display skeleton placeholders.
3. IF the API call to fetch popular links fails, THEN THE Popular_Links_Section SHALL display a toast error notification.
4. WHEN no popular links exist, THE Popular_Links_Section SHALL display an empty-state message.

### Requirement 4: Header with Search and Navigation

**User Story:** As a user, I want the search box and a "Manage My Links" link in the header, so that I can search aliases and navigate to link management from any page.

#### Acceptance Criteria

1. THE Header SHALL contain the app title, the Search_Bar, a "Manage My Links" navigation link, and the theme toggle.
2. THE Search_Bar SHALL be rendered inside the Header on all pages.
3. WHEN a user activates the "Manage My Links" link, THE Router SHALL navigate to the `/manage` route.
4. WHEN a user types a search term into the Search_Bar while on the Landing_Page, THE Router SHALL navigate to the Manage_Page and apply the search term as a filter.
5. THE Header SHALL be responsive, collapsing the Search_Bar on small viewports to maintain usability.

### Requirement 5: Manage My Links Page

**User Story:** As a user, I want a dedicated page to view and manage all my aliases, so that I can filter, search, and edit links without cluttering the landing page.

#### Acceptance Criteria

1. WHEN a user navigates to the `/manage` route, THE Manage_Page SHALL render the full alias list with Filter_Tabs and alias cards.
2. THE Manage_Page SHALL display Filter_Tabs with the options: All, Active, Expiring Soon, and Expired.
3. WHEN a user selects a Filter_Tab, THE Manage_Page SHALL filter the displayed aliases to match the selected expiry status.
4. WHEN a user activates the edit action on an alias card, THE Manage_Page SHALL open the CreateEditModal in edit mode with the selected alias data.
5. WHEN a user activates the delete action on an alias card, THE Manage_Page SHALL display a confirmation dialog before deleting.
6. WHEN a user activates the renew action on an expiring or expired alias card, THE Manage_Page SHALL call the renew API and update the alias status.
7. THE Manage_Page SHALL include a "Create Alias" button in its toolbar so users can create new aliases without returning to the Landing_Page.

### Requirement 6: Client-Side Routing

**User Story:** As a user, I want distinct URLs for the landing page and the manage page, so that I can bookmark and share direct links to each view.

#### Acceptance Criteria

1. THE Router SHALL map the `/` path to the Landing_Page component.
2. THE Router SHALL map the `/manage` path to the Manage_Page component.
3. THE Router SHALL continue to map the `/interstitial` path to the InterstitialPage component.
4. THE Router SHALL continue to forward unmatched paths to the alias redirect handler.
5. WHEN a user navigates between the Landing_Page and the Manage_Page, THE Router SHALL perform client-side navigation without a full page reload.

### Requirement 7: Search Integration Across Pages

**User Story:** As a user, I want search to work from any page and match against alias names, destination URLs, and page titles, so that I can find aliases regardless of which view I am on or what detail I remember.

#### Acceptance Criteria

1. WHEN a user enters a search term in the Header Search_Bar while on the Landing_Page, THE Router SHALL navigate to the Manage_Page with the search term applied.
2. WHEN a user enters a search term in the Header Search_Bar while on the Manage_Page, THE Manage_Page SHALL filter the alias list using the search term.
3. THE Search_Bar filtering SHALL perform a case-insensitive match against the alias short name, the destination URL, and the page title of each alias.
4. WHEN a user clears the search term on the Manage_Page, THE Manage_Page SHALL display the unfiltered alias list for the active Filter_Tab.
