# Requirements Document

## Introduction

The URL alias/shortener app displays favicon icons next to each link in both the AliasCard and PopularLinks components. Currently, when a link's `icon_url` fails to load (network error, 404, etc.) or is missing entirely, the user sees either a broken image or a generic 🔗 emoji placeholder. This feature introduces a consistent, visually appealing fallback icon system that generates letter-based icons derived from the link's title, providing a polished experience regardless of favicon availability.

## Glossary

- **Icon_Fallback_Component**: A React component that renders a generated fallback icon when a favicon image is unavailable or fails to load
- **AliasCard_Component**: The card component (`AliasCard.tsx`) that renders individual link entries in the manage/list view
- **PopularLinks_Component**: The component (`PopularLinks.tsx`) that renders the popular links section on the landing page
- **Link_Record**: An `AliasRecord` object containing link metadata including `icon_url`, `title`, and `alias`
- **Favicon_Image**: The `<img>` element that displays a link's icon from the `icon_url` field
- **Generated_Icon**: A styled element displaying the first letter of a link's title on a deterministic background color

## Requirements

### Requirement 1: Fallback on Image Load Failure

**User Story:** As a user, I want to see a clean generated icon when a link's favicon fails to load, so that I don't see broken image indicators.

#### Acceptance Criteria

1. WHEN a Favicon_Image emits a load error event, THE Icon_Fallback_Component SHALL replace the broken image with a Generated_Icon
2. WHEN a Favicon_Image emits a load error event, THE Icon_Fallback_Component SHALL not attempt to reload the failed image
3. THE Generated_Icon SHALL display the first character of the Link_Record title, uppercased
4. IF the Link_Record title is empty or undefined, THEN THE Generated_Icon SHALL display the first character of the Link_Record alias, uppercased

### Requirement 2: Fallback for Missing Icon URL

**User Story:** As a user, I want to see a generated icon instead of a generic emoji when a link has no icon URL, so that the interface looks consistent and informative.

#### Acceptance Criteria

1. WHEN a Link_Record has a null or empty `icon_url`, THE Icon_Fallback_Component SHALL render a Generated_Icon instead of a Favicon_Image
2. THE Generated_Icon SHALL match the dimensions and border-radius of the Favicon_Image it replaces (20×20 in AliasCard_Component, 32×32 in PopularLinks_Component)

### Requirement 3: Deterministic Icon Appearance

**User Story:** As a user, I want each link's generated icon to have a unique, consistent color, so that I can visually distinguish links at a glance.

#### Acceptance Criteria

1. THE Icon_Fallback_Component SHALL derive the background color from the Link_Record title using a deterministic hash function
2. FOR ALL renderings of the same Link_Record title, THE Icon_Fallback_Component SHALL produce the same background color
3. THE Generated_Icon SHALL use white text on the colored background
4. THE Generated_Icon text color and background color combination SHALL meet WCAG AA contrast ratio (4.5:1 minimum)
5. THE Generated_Icon SHALL use a centered, bold, sans-serif letter

### Requirement 4: Consistent Fallback Across Components

**User Story:** As a developer, I want a single reusable fallback component, so that icon fallback behavior is consistent across AliasCard and PopularLinks.

#### Acceptance Criteria

1. THE AliasCard_Component SHALL use the Icon_Fallback_Component for all link icon rendering
2. THE PopularLinks_Component SHALL use the Icon_Fallback_Component for all link icon rendering
3. THE Icon_Fallback_Component SHALL accept a `size` prop to support different icon dimensions across components
4. THE Icon_Fallback_Component SHALL accept `iconUrl`, `title`, and `alias` as props

### Requirement 5: Accessibility

**User Story:** As a user relying on assistive technology, I want the fallback icons to be properly labeled, so that I understand what each icon represents.

#### Acceptance Criteria

1. WHEN a Generated_Icon is rendered, THE Icon_Fallback_Component SHALL set `aria-hidden="true"` on the icon element since the adjacent link text provides context
2. THE Generated_Icon SHALL not introduce additional tab stops
