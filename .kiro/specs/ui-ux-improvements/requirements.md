# Requirements Document

## Introduction

This specification covers a set of UI/UX improvements and bug fixes for the Go URL alias/shortener service. The changes span redirect routing, visual design updates, interaction patterns, component redesigns, auto-populated form fields, and date picker fixes.

## Glossary

- **Redirect_Engine**: The Azure Function (`redirect`) that resolves an alias to its destination URL and performs an HTTP 302 redirect.
- **SPA_Router**: The React Router configuration in the frontend single-page application that maps URL paths to React components.
- **Static_Web_App_Config**: The `staticwebapp.config.json` file that controls routing rules, navigation fallback, and authentication for the Azure Static Web App.
- **Alias_Card**: The React component (`AliasCard`) that displays a single alias record in the alias list or search results.
- **Popular_Link_Item**: The list item rendered inside the `PopularLinks` component showing a top alias by heat score.
- **Heat_Indicator**: The visual element on Popular_Link_Items that conveys relative popularity of an alias.
- **Create_Edit_Modal**: The modal dialog (`CreateEditModal`) used to create or edit an alias record.
- **Expiry_Policy_Selector**: The form component (`ExpiryPolicySelector`) that allows users to choose an expiry policy type and duration.
- **Scope_Toggle**: The sliding pill component (`ScopeToggle`) used to switch between Private and Global scope.
- **Theme_Provider**: The React context provider that manages light, dark, and system theme modes.
- **Title_Field**: The text input in the Create_Edit_Modal where users enter or override the alias title.
- **Date_Picker**: The native HTML date input (`<input type="date">`) used in the Expiry_Policy_Selector for custom expiry dates.
- **Glow_Effect**: The box-shadow hover effect applied to primary action buttons (e.g., `btn--primary:hover`).

## Requirements

### Requirement 1: Alias Redirect Routing

**User Story:** As a user, I want navigating to `/:alias` to redirect me to the alias destination URL, so that short links work as expected.

#### Acceptance Criteria

1. WHEN a user navigates to a path matching `/:alias` in the browser, THE Static_Web_App_Config SHALL route the request to the Redirect_Engine rather than the SPA navigation fallback.
2. WHEN the Redirect_Engine receives a valid, non-expired alias, THE Redirect_Engine SHALL respond with an HTTP 302 redirect to the alias destination URL.
3. WHEN the Redirect_Engine receives an alias that does not exist, THE Redirect_Engine SHALL redirect the user to the SPA dashboard with a suggestion query parameter.
4. WHEN the Redirect_Engine receives an alias that is expired, THE Redirect_Engine SHALL redirect the user to the SPA dashboard with an expired query parameter.
5. WHEN both a private and global alias exist for the same name, THE Redirect_Engine SHALL redirect the user to the interstitial conflict resolution page.

### Requirement 2: Heat Indicator Redesign

**User Story:** As a user, I want the heat indicator to look like a popularity meter rather than signal bars, so that I can intuitively understand link popularity.

#### Acceptance Criteria

1. THE Heat_Indicator SHALL display as a horizontal progress bar that fills proportionally to the alias heat score relative to the maximum heat score in the list.
2. THE Heat_Indicator SHALL use a gradient or accent colour fill to visually convey popularity level.
3. THE Heat_Indicator SHALL include an accessible label conveying the popularity level (e.g., "Popularity: 3 of 5").
4. THE Heat_Indicator SHALL render at a fixed width so that all indicators in the Popular Links list align consistently.

### Requirement 3: Link Card Click-Through Navigation

**User Story:** As a user, I want clicking on a link card to navigate me to the destination URL, and I want a separate edit button to modify the link, so that the primary interaction is fast navigation.

#### Acceptance Criteria

1. WHEN a user clicks on an Alias_Card body area, THE Alias_Card SHALL open the alias destination URL in a new browser tab.
2. WHEN a user clicks on a Popular_Link_Item body area, THE Popular_Link_Item SHALL open the alias destination URL in a new browser tab.
3. THE Alias_Card SHALL display an edit button with a cog (settings) icon that opens the Create_Edit_Modal for that alias.
4. WHEN a user clicks the edit button on an Alias_Card, THE Alias_Card SHALL prevent the click-through navigation and open the Create_Edit_Modal instead.
5. THE Alias_Card SHALL retain the Delete and Renew action buttons alongside the new edit icon button.
6. THE edit button SHALL include an accessible label of "Edit [alias name]".

### Requirement 4: Corporate Background Theme

**User Story:** As a user, I want a simpler corporate-style background with a subtle geometric pattern instead of the coloured gradient, so that the application looks more professional while retaining visual interest.

#### Acceptance Criteria

1. WHILE the light theme is active, THE Theme_Provider SHALL apply a light grey base background colour (no gradient) to the application body.
2. WHILE the dark theme is active, THE Theme_Provider SHALL apply a dark grey base background colour (no gradient) to the application body.
3. THE application body SHALL overlay a subtle geometric pattern (e.g., dot grid, fine gridlines, triangulated mesh, or similar) on top of the base background colour using CSS (e.g., `background-image` with an SVG pattern or CSS-generated pattern).
4. THE geometric pattern SHALL be low-contrast relative to the base background so that it does not compete with foreground content or reduce readability.
5. THE geometric pattern SHALL adapt to the active theme (lighter pattern on light grey, darker pattern on dark grey).
6. THE Theme_Provider SHALL preserve all existing glassmorphism surface styles (glass cards, blur, borders) on top of the new background.
7. THE Theme_Provider SHALL maintain WCAG AA contrast ratios (at least 4.5:1 for normal text) between text colours and the new background.

### Requirement 5: Glow Effect on Interactive Elements

**User Story:** As a user, I want a consistent glow effect on all interactive UI elements when I hover or focus, so that the interface feels cohesive and responsive.

#### Acceptance Criteria

1. WHEN a user hovers over a secondary button (`.btn`), THE secondary button SHALL display a glow box-shadow effect similar to the primary button glow.
2. WHEN a user hovers over a filter tab (`.filter-tabs__tab`), THE filter tab SHALL display a subtle glow box-shadow effect.
3. WHEN a user hovers over a glass card (`.glass`), THE glass card SHALL display a glow box-shadow effect.
4. WHEN a user hovers over a scope toggle option, THE Scope_Toggle SHALL display a glow effect on the active pill.
5. WHEN a user focuses on any interactive element via keyboard, THE element SHALL display a glow effect matching the hover glow style.
6. WHILE the `prefers-reduced-motion` media query is active, THE application SHALL suppress all glow transition animations.

### Requirement 6: Sliding Pill Design for Expiry Policy Selector

**User Story:** As a user, I want the expiry policy type selection and duration selection to use a sliding pill design consistent with the scope toggle, so that the UI feels unified.

#### Acceptance Criteria

1. THE Expiry_Policy_Selector SHALL render the expiry type options (Never, Expire on date, After inactivity) as a sliding pill toggle matching the Scope_Toggle visual design.
2. THE Expiry_Policy_Selector SHALL render the duration options (1 month, 3 months, 12 months) as a sliding pill toggle matching the Scope_Toggle visual design.
3. WHEN a user selects an expiry type option, THE Expiry_Policy_Selector SHALL animate the pill slider to the selected option position.
4. WHEN a user selects a duration option, THE Expiry_Policy_Selector SHALL animate the pill slider to the selected option position.
5. THE sliding pill toggles SHALL support keyboard navigation using arrow keys, consistent with the Scope_Toggle behaviour.
6. THE sliding pill toggles SHALL use `role="radiogroup"` and `role="radio"` with correct `aria-checked` attributes.

### Requirement 7: Auto-Scrape Page Title and Icon from Destination URL

**User Story:** As a user, I want the title field to be automatically populated from the destination URL page title and the page icon (favicon) to be fetched and displayed on alias cards, so that links are visually identifiable and I do not have to manually type the title for every link.

#### Acceptance Criteria

1. WHEN a user enters a valid destination URL in the Create_Edit_Modal, THE Create_Edit_Modal SHALL fetch the page title from the destination URL and populate the Title_Field.
2. WHILE the title and icon are being fetched, THE Title_Field SHALL display a loading indicator (e.g., placeholder text "Fetching title...").
3. IF the page title or icon fetch fails (network error, CORS restriction, or invalid URL), THEN THE Title_Field SHALL remain empty and editable, and the icon SHALL fall back to a default placeholder icon, without displaying an error to the user.
4. WHEN the Title_Field has been auto-populated, THE user SHALL be able to overwrite the auto-populated title by typing in the Title_Field.
5. WHEN the user has manually edited the Title_Field, THE Create_Edit_Modal SHALL not overwrite the manual entry if the destination URL changes.
6. WHILE in edit mode, THE Create_Edit_Modal SHALL not auto-fetch the title or icon, preserving the existing values.
7. THE title and icon fetch SHALL be debounced so that rapid typing in the destination URL field does not trigger excessive network requests.
8. WHEN a page icon is successfully fetched, THE Alias_Card SHALL display the icon alongside the alias name.
9. WHEN no page icon is available for an alias, THE Alias_Card SHALL display a default placeholder icon (e.g., a generic link/globe icon).
10. THE `AliasRecord` data model SHALL include an `icon_url` field to persist the fetched page icon URL.

### Requirement 8: Date Picker Fix

**User Story:** As a user, I want clicking a date in the date picker to populate the expiry date field, so that I can set custom expiry dates.

#### Acceptance Criteria

1. WHEN a user selects a date from the Date_Picker, THE Expiry_Policy_Selector SHALL update the `custom_expires_at` value with the selected date as an ISO 8601 string.
2. WHEN a user selects a date from the Date_Picker, THE Date_Picker input SHALL display the selected date in the input field.
3. THE Date_Picker SHALL not allow selection of dates in the past (the `min` attribute SHALL be set to today's date).
4. WHEN the `custom_expires_at` value is updated, THE Create_Edit_Modal form state SHALL reflect the new expiry date for submission.
