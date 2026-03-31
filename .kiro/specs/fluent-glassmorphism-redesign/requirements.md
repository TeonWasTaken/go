# Requirements Document

## Introduction

This feature redesigns the Go URL Alias Service frontend to adopt a Fluent Design / Glassmorphism aesthetic with Neo-Brutalism accents. The redesign updates the existing CSS design system, color palette, typography, component surfaces, and interaction patterns while preserving all current functionality. The goal is a polished, modern visual identity with frosted-glass surfaces, vibrant gradient backgrounds, bold typography, and refined micro-interactions — all while maintaining WCAG AA accessibility compliance and full light/dark theme support.

## Glossary

- **Design_System**: The set of CSS custom properties, utility classes, and component styles defined in `src/index.css` that govern the visual appearance of the application.
- **Glass_Surface**: A UI surface rendered with a semi-transparent background, backdrop blur, subtle border, and soft shadow to create a frosted-glass appearance.
- **Theme_Provider**: The React context component (`ThemeProvider`) that manages light, dark, and system theme modes and applies the `data-theme` attribute to the document root.
- **Alias_Card**: The card component (`AliasCard`) that displays a single URL alias record with its metadata, status badges, and action buttons.
- **Create_Edit_Modal**: The modal dialog component (`CreateEditModal`) used to create new aliases or edit existing ones.
- **Scope_Toggle**: A segmented pill-style toggle control within the Create_Edit_Modal that lets users switch between "Private (Just You)" and "Global (Company)" scopes. Renders as two side-by-side segments with icons (lock for private, globe for global) inside a rounded glass container, with a sliding highlight on the active segment.
- **Search_Bar**: The search input component (`SearchBar`) with debounced filtering and keyboard shortcut support.
- **Toast_System**: The notification system (`ToastProvider`) that displays transient success, error, and info messages.
- **Popular_Links**: The section component (`PopularLinks`) that displays trending aliases ranked by heat score.
- **Filter_Tabs**: The tab bar used to filter aliases by expiry status (All, Active, Expiring Soon, Expired, No Expiry).
- **Color_Palette**: The set of named color values used throughout the Design_System, including primary, accent, text, and surface colors.
- **Neo_Brutalism_Accent**: A design treatment using bold/heavy font weights, high-contrast borders, or slightly raw visual elements to add personality alongside the glass aesthetic.

## Requirements

### Requirement 1: Updated Color Palette

**User Story:** As a user, I want the application to use a vibrant, cohesive color palette so that the interface feels modern and visually engaging.

#### Acceptance Criteria

1. THE Design_System SHALL define a primary color variable (`--color-primary`) inspired by an azure/sky-blue hue for use in buttons, links, and focus rings.
2. THE Design_System SHALL define an accent color variable (`--color-accent`) inspired by an electric magenta/pink hue for use in highlights and interactive emphasis.
3. THE Design_System SHALL define text color variables that maintain a minimum WCAG AA contrast ratio of 4.5:1 against their respective background surfaces in both light and dark themes.
4. THE Design_System SHALL define light-theme surface colors using high-lightness, low-saturation values (ghostly white range) for Glass_Surface backgrounds.
5. THE Design_System SHALL define dark-theme surface colors using low-lightness, cool-toned values for Glass_Surface backgrounds.
6. WHEN the Theme_Provider switches between light and dark modes, THE Design_System SHALL transition all color variables smoothly using the existing `--transition-speed` timing.

### Requirement 2: Glassmorphism Surface Treatment

**User Story:** As a user, I want UI surfaces to have a frosted-glass look with soft depth so that the interface feels layered and refined.

#### Acceptance Criteria

1. THE Design_System SHALL render Glass_Surface elements with a semi-transparent background, backdrop blur of at least 12px, a subtle translucent border, and a soft box shadow.
2. THE Design_System SHALL define a vibrant gradient background on the `body` element that is visible through Glass_Surface transparency in both light and dark themes.
3. THE Design_System SHALL support a secondary glass variant (`glass--subtle`) with reduced opacity and blur for nested or less prominent surfaces.
4. WHEN a Glass_Surface element receives hover focus, THE Design_System SHALL increase the surface brightness or opacity slightly to indicate interactivity.
5. WHILE the user has `prefers-reduced-motion` enabled, THE Design_System SHALL disable backdrop-filter animations and transitions on Glass_Surface elements.

### Requirement 3: Neo-Brutalism Typography and Accents

**User Story:** As a user, I want the typography to feel bold and distinctive so that the interface has personality and strong visual hierarchy.

#### Acceptance Criteria

1. THE Design_System SHALL use a font weight of 700 or higher for primary headings (app title, section headings, modal headings).
2. THE Design_System SHALL use a font weight of 600 for secondary headings (card alias names, popular link aliases).
3. THE Design_System SHALL apply letter-spacing of at least -0.01em on headings sized 1.25rem or larger to create a tighter, bolder appearance.
4. THE Design_System SHALL style the app header title (`app-header__title`) with a font size of at least 1.5rem and font weight of at least 800.
5. THE Design_System SHALL apply a Neo_Brutalism_Accent border treatment (2px solid border using the primary or accent color) to the primary action button (`.btn--primary`).

### Requirement 4: Enhanced Button and Interactive Element Styling

**User Story:** As a user, I want buttons and interactive elements to feel tactile and responsive so that I have clear feedback when interacting with the interface.

#### Acceptance Criteria

1. THE Design_System SHALL style `.btn--primary` with a gradient or solid background using `--color-primary` and `--color-accent`, white text, and a visible border.
2. WHEN a `.btn--primary` element is hovered, THE Design_System SHALL apply a subtle scale transform (between 1.01 and 1.04) and increased shadow depth.
3. WHEN a `.btn--primary` element is pressed (`:active`), THE Design_System SHALL apply a scale transform below 1.0 (between 0.97 and 0.99) to simulate a press effect.
4. THE Design_System SHALL style `.btn--danger` with a distinct destructive color that maintains WCAG AA contrast against Glass_Surface backgrounds.
5. WHEN any focusable element receives keyboard focus (`:focus-visible`), THE Design_System SHALL display a 2px outline using `--color-primary` or `--color-accent` with a visible offset.
6. WHILE the user has `prefers-reduced-motion` enabled, THE Design_System SHALL disable scale transforms on button hover and press states.

### Requirement 5: Alias Card Visual Refresh

**User Story:** As a user, I want alias cards to look polished and clearly communicate status so that I can quickly scan my links.

#### Acceptance Criteria

1. THE Alias_Card SHALL render as a Glass_Surface with consistent padding, border-radius matching `--radius`, and the standard glass shadow.
2. THE Alias_Card SHALL display status badges (`active`, `expiring_soon`, `expired`, `no_expiry`) using distinct background colors with sufficient contrast against the Glass_Surface in both themes.
3. WHEN an Alias_Card represents an expired alias, THE Alias_Card SHALL reduce its opacity and apply a strikethrough on the alias name.
4. WHEN an Alias_Card represents an expiring-soon alias, THE Alias_Card SHALL display a left border accent using a warning color (amber/yellow range).
5. WHEN a user hovers over an Alias_Card, THE Alias_Card SHALL subtly elevate its shadow depth or increase surface brightness to indicate interactivity.
6. THE Alias_Card SHALL display the "Personal" badge using `--color-accent` tones to visually distinguish private aliases from global ones.

### Requirement 6: Modal and Form Styling

**User Story:** As a user, I want the create/edit modal to feel integrated with the glass aesthetic so that the experience is visually consistent.

#### Acceptance Criteria

1. THE Create_Edit_Modal SHALL render as a Glass_Surface with a backdrop overlay that dims and blurs the background content.
2. THE Create_Edit_Modal SHALL style form inputs with a semi-transparent background, a subtle border, and a focus state that highlights the border using `--color-primary`.
3. THE Create_Edit_Modal SHALL replace the current checkbox-style "Personal (private to me)" toggle with a Scope_Toggle — a segmented pill-style control displaying two options: "Private (Just You)" with a lock icon and "Global (Company)" with a globe icon.
4. THE Scope_Toggle SHALL render as a rounded glass container with two side-by-side segments, where the active segment is highlighted with a sliding background using `--color-primary` (or a glass-tinted variant) and contrasting text, while the inactive segment uses transparent/muted styling.
5. THE Scope_Toggle SHALL animate the highlight between segments with a smooth horizontal slide transition to feel delightful and responsive.
6. THE Scope_Toggle SHALL be keyboard-accessible, allowing users to switch between options using arrow keys or Tab, with a visible focus indicator on the active segment.
7. WHILE the user has `prefers-reduced-motion` enabled, THE Scope_Toggle SHALL switch segments instantly without the sliding animation.
8. WHEN the Create_Edit_Modal opens, THE Create_Edit_Modal SHALL animate into view with a fade and slight upward translation.
9. WHILE the user has `prefers-reduced-motion` enabled, THE Create_Edit_Modal SHALL appear without animation.

### Requirement 7: Search Bar and Filter Tabs Styling

**User Story:** As a user, I want the search bar and filter tabs to blend with the glass design so that navigation feels seamless.

#### Acceptance Criteria

1. THE Search_Bar SHALL render as a Glass_Surface with an integrated search icon and keyboard shortcut indicator.
2. THE Filter_Tabs SHALL style the active tab with a Glass_Surface background and a bottom or background accent using `--color-primary`.
3. WHEN a Filter_Tabs tab is hovered, THE Filter_Tabs SHALL increase the tab text color contrast to indicate interactivity.
4. THE Filter_Tabs SHALL remain horizontally scrollable on narrow viewports without visual clipping of the active tab indicator.

### Requirement 8: Toast Notification Styling

**User Story:** As a user, I want toast notifications to match the glass aesthetic so that feedback messages feel cohesive with the rest of the UI.

#### Acceptance Criteria

1. THE Toast_System SHALL render toast notifications with a Glass_Surface treatment including backdrop blur and semi-transparent background tinted by the toast type (success: green, error: red, info: blue).
2. THE Toast_System SHALL animate toasts entering from the right side with a slide-in effect.
3. THE Toast_System SHALL ensure toast text maintains a minimum WCAG AA contrast ratio of 4.5:1 against the toast background in both themes.
4. WHILE the user has `prefers-reduced-motion` enabled, THE Toast_System SHALL display toasts without slide animation.

### Requirement 9: Popular Links Section Styling

**User Story:** As a user, I want the popular links section to be visually prominent so that I can quickly discover trending aliases.

#### Acceptance Criteria

1. THE Popular_Links section SHALL render each link item as a Glass_Surface with consistent spacing and border-radius.
2. THE Popular_Links section SHALL style the heat indicator bars using a warm gradient or the accent color for active bars.
3. WHEN a user hovers over a Popular_Links item, THE Popular_Links item SHALL subtly elevate or brighten to indicate interactivity.
4. THE Popular_Links section heading SHALL use the Neo_Brutalism_Accent typography style (bold weight, tight letter-spacing).

### Requirement 10: Theme Toggle Styling

**User Story:** As a user, I want the theme toggle to feel like a polished segmented control so that switching themes is intuitive.

#### Acceptance Criteria

1. THE Theme_Toggle SHALL render as a Glass_Surface segmented control with distinct visual states for the active and inactive segments.
2. THE Theme_Toggle SHALL style the active segment with a background using `--color-primary` or a brighter Glass_Surface variant and contrasting text.
3. WHEN a Theme_Toggle segment is hovered, THE Theme_Toggle SHALL increase the segment brightness or text contrast to indicate interactivity.

### Requirement 11: Responsive and Accessibility Compliance

**User Story:** As a user, I want the redesigned interface to work well on all screen sizes and be accessible so that everyone can use the service comfortably.

#### Acceptance Criteria

1. THE Design_System SHALL maintain all existing responsive breakpoints and layout behavior at 768px and 480px viewport widths.
2. THE Design_System SHALL preserve all existing `aria-label`, `role`, and `aria-live` attributes on interactive and dynamic elements.
3. THE Design_System SHALL ensure all interactive elements have a visible focus indicator meeting WCAG 2.1 Success Criterion 2.4.7.
4. THE Design_System SHALL ensure all text content meets WCAG AA minimum contrast ratios (4.5:1 for normal text, 3:1 for large text) in both light and dark themes.
5. WHILE the user has `prefers-reduced-motion` enabled, THE Design_System SHALL suppress all decorative animations, transitions, and transform effects.
6. THE Design_System SHALL preserve the existing keyboard shortcut (`/`) for focusing the Search_Bar.

### Requirement 12: Skeleton Loader Styling

**User Story:** As a user, I want loading placeholders to match the glass aesthetic so that the loading state feels intentional and polished.

#### Acceptance Criteria

1. THE Design_System SHALL style skeleton loader elements with a Glass_Surface-tinted base color and a subtle pulse animation.
2. WHILE the user has `prefers-reduced-motion` enabled, THE Design_System SHALL display skeleton loaders as static placeholders without pulse animation.
