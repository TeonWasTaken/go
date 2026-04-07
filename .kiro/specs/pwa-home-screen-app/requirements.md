# Requirements Document

## Introduction

Add Progressive Web App (PWA) capabilities to the Go URL Alias Service so users can "install" the app to their phone home screen. When launched from the home screen, the app presents a clean, standalone experience with a single text input for entering an alias to visit, styled with a playful riff on Microsoft's classic "Where do you want to go today?" tagline. The experience should feel native and polished on mobile devices.

## Glossary

- **PWA_Manifest**: A JSON file (`manifest.json`) that describes the web application to the browser, including name, icons, theme color, display mode, and start URL.
- **Service_Worker**: A script that runs in the background, enabling offline caching and PWA install eligibility.
- **Home_Screen_Page**: A dedicated standalone page rendered when the app is launched from the home screen, containing the alias input and tagline.
- **Alias_Input**: A text field on the Home_Screen_Page where the user types a short alias to navigate to.
- **Go_App**: The existing Go URL Alias Service web application built with Vite, React 18, and TypeScript.
- **Install_Prompt**: The browser-native prompt that allows users to add the PWA to their device home screen.
- **Standalone_Mode**: A PWA display mode where the app runs in its own window without browser chrome (address bar, tabs).

## Requirements

### Requirement 1: Web App Manifest

**User Story:** As a mobile user, I want the Go app to be recognized as an installable PWA by my browser, so that I can add it to my home screen.

#### Acceptance Criteria

1. THE Go_App SHALL include a PWA_Manifest file served at `/manifest.json` containing the application name "Go", a short name "Go", a start URL of "/", a display mode of "standalone", a theme color, and a background color.
2. THE Go_App SHALL include a `<link rel="manifest">` tag in `index.html` referencing the PWA_Manifest.
3. THE PWA_Manifest SHALL include icon entries at 192x192 and 512x512 pixel sizes in PNG format.
4. THE Go_App SHALL include `<meta name="theme-color">` and `<meta name="apple-mobile-web-app-capable">` tags in `index.html`.

### Requirement 2: Service Worker for Install Eligibility

**User Story:** As a mobile user, I want the app to meet browser PWA install criteria, so that the "Add to Home Screen" prompt appears.

#### Acceptance Criteria

1. THE Go_App SHALL register a Service_Worker that caches the app shell (HTML, CSS, JS, icons) using a cache-first strategy.
2. WHEN the Service_Worker is registered, THE Go_App SHALL use the `vite-plugin-pwa` Vite plugin to generate the Service_Worker and inject the manifest link automatically.
3. IF the Service_Worker fails to register, THEN THE Go_App SHALL log the error to the browser console and continue operating as a normal web app.

### Requirement 3: Home Screen Standalone Page

**User Story:** As a user launching Go from my home screen, I want to see a clean, focused page with a text input for entering an alias, so that I can quickly navigate to my destination.

#### Acceptance Criteria

1. THE Home_Screen_Page SHALL display a tagline that riffs on Microsoft's "Where do you want to go today?" slogan (e.g., "Where do you want to go today?").
2. THE Home_Screen_Page SHALL display a single Alias_Input text field with placeholder text indicating the user should type an alias.
3. THE Home_Screen_Page SHALL display the Go logo above the tagline, using the theme-appropriate variant (light or dark).
4. WHEN the user submits an alias via the Alias_Input (pressing Enter or tapping a submit button), THE Home_Screen_Page SHALL navigate to `/{alias}`, triggering the existing redirect flow.
5. WHILE the Alias_Input is empty, THE Home_Screen_Page SHALL disable the submit action.
6. THE Home_Screen_Page SHALL be accessible at the root route `/` and serve as the default view when the app is launched in Standalone_Mode.

### Requirement 4: Mobile-Native Feel

**User Story:** As a mobile user, I want the installed app to look and feel like a native app, so that the experience is polished and seamless.

#### Acceptance Criteria

1. WHILE the Go_App is running in Standalone_Mode, THE Go_App SHALL hide the browser address bar and navigation chrome.
2. THE Home_Screen_Page SHALL use the existing glassmorphism design system (glass surfaces, theme colors, blur effects) for visual consistency.
3. THE Home_Screen_Page SHALL be fully responsive, centering the content vertically and horizontally on mobile viewports.
4. THE Alias_Input SHALL use a font size of at least 16px to prevent iOS auto-zoom on focus.
5. THE Home_Screen_Page SHALL respect the user's existing theme preference (light/dark/system) from the ThemeProvider.

### Requirement 5: Integration with Existing App

**User Story:** As a developer, I want the PWA features to integrate cleanly with the existing Vite + React app, so that the current functionality is preserved.

#### Acceptance Criteria

1. THE Go_App SHALL continue to serve all existing routes (`/`, `/_/manage`, `/_/interstitial`, `/_/kitchen-sink`, `/_/not-found`, `/{alias}`) without modification to their behavior.
2. WHEN the Go_App is accessed in a normal browser (not Standalone_Mode), THE Go_App SHALL display the existing LandingPage at the root route `/`.
3. WHEN the Go_App is accessed in Standalone_Mode, THE Go_App SHALL display the Home_Screen_Page at the root route `/`.
4. THE Go_App SHALL use `vite-plugin-pwa` integrated into the existing `vite.config.ts` to generate the PWA_Manifest and Service_Worker at build time.
5. THE staticwebapp.config.json SHALL allow the `/manifest.json` and Service_Worker files to be served without authentication.

### Requirement 6: PWA Icon Generation

**User Story:** As a mobile user, I want the Go app to display a recognizable icon on my home screen, so that I can easily find and launch it.

#### Acceptance Criteria

1. THE Go_App SHALL include PNG icon files derived from the existing `favicon.svg` at 192x192 and 512x512 pixel sizes in the `public/` directory.
2. THE PWA_Manifest SHALL reference the icon files with the correct `src`, `sizes`, and `type` properties.
3. THE Go_App SHALL include an `<link rel="apple-touch-icon">` tag in `index.html` referencing the 192x192 icon for iOS home screen support.
