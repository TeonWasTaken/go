# Requirements Document

## Introduction

"Go" is an internal URL aliasing service that allows employees to create short, memorable aliases (e.g., `go/benefits`, `go/wiki`) that redirect to longer destination URLs. The service provides a management dashboard for creating and discovering aliases, enforces role-based access control via Azure Entra ID, and tracks basic analytics on alias usage. Aliases are case-insensitive and support both global (shared) and private (per-user) scoping. The system is built on Azure Static Web Apps with Azure Functions and Cosmos DB.

## Glossary

- **Go_Service**: The overall URL aliasing application, including the frontend, backend API, and redirection engine.
- **Redirection_Engine**: The backend component (Azure Function) responsible for looking up an alias in the database and performing an HTTP 302 redirect to the destination URL. The engine resolves aliases by checking the authenticated user's Private_Alias first, then the Global_Alias.
- **Management_Dashboard**: The React-based frontend UI that allows authenticated users to create, edit, delete, search, and browse URL aliases. Uses a glassmorphism design language.
- **Alias**: A short, case-insensitive string identifier (e.g., `benefits`) that maps to a destination URL. Aliases are always stored and compared in lowercase.
- **Global_Alias**: A public alias visible and usable by all authenticated users. Only one Global_Alias can exist per alias name.
- **Private_Alias**: A personal alias scoped to the user who created it. Multiple users can independently register the same alias name as a Private_Alias. Other users cannot see or access another user's Private_Alias.
- **Destination_URL**: The full URL that an alias redirects to.
- **Alias_Record**: A document in Cosmos DB representing a single alias, including its metadata (destination URL, creator, title, click count, visibility, timestamps).
- **API**: The set of Azure Functions that provide CRUD operations for aliases and handle redirection logic.
- **User**: An authenticated employee with the 'User' role who can create and manage their own aliases.
- **Admin**: An authenticated employee with the 'Admin' role who can manage all global aliases in the system. Admins cannot manage other users' Private_Aliases.
- **Click_Count**: An integer field on an Alias_Record that tracks the total number of redirects performed for that alias.
- **SWA_Config**: The `staticwebapp.config.json` file that defines authentication and route-level authorization rules for Azure Static Web Apps.
- **Interstitial_Page**: A conflict resolution page displayed when a user's Private_Alias and a Global_Alias both match the requested alias name. Shows both destinations, auto-redirects to the private destination after 5 seconds with a countdown timer, and provides a link to the global destination.
- **Expiry_Policy**: A configuration on an Alias_Record that determines when the alias expires. Possible types are: `never` (no expiration), `fixed` (expires after a set duration or on a custom date), or `inactivity` (expires after 12 months of no access, hardcoded).
- **Expiry_Status**: The computed state of an Alias_Record's expiry: `active` (not expired), `expiring_soon` (within 7 days of expiration), `expired` (past expiration date), or `no_expiry` (never expires).
- **Grace_Period**: A 14-day window after an alias expires during which the alias is soft-deleted (redirects are disabled) but can still be restored by the owner or an Admin.
- **Expiry_Processor**: A scheduled Azure Function that runs daily to evaluate Alias_Records against their Expiry_Policy and transition them through expiry states (active -> expired -> permanently deleted).
- **Query_String_Passthrough**: The behavior where query parameters from the incoming request are merged with the Destination_URL's query parameters during redirection. If the Destination_URL already contains query parameters, they are merged with the destination's parameters taking precedence for duplicate keys.
- **Fragment_Passthrough**: The behavior where the URL fragment from the incoming request is appended to the Destination_URL during redirection. If the Destination_URL already contains a fragment, the destination's fragment takes precedence.
- **GSA**: Microsoft Entra Global Secure Access -- the zero-trust network access solution used for remote access via corporate devices.
- **SSO**: Single Sign-On -- the ability for users to authenticate once and access the application without additional login prompts.
- **Client_Principal**: The authenticated user identity provided by Azure Static Web Apps via the `x-ms-client-principal` HTTP header, containing the user's email, roles, and identity provider information.

## Requirements

### Requirement 1: Alias Redirection

**User Story:** As an employee, I want to type a short alias path into my browser, so that I am redirected to the correct destination URL without needing to remember the full link.

#### Acceptance Criteria

1. WHEN an unauthenticated request is received at the path `/:alias`, THE Redirection_Engine SHALL return an HTTP 401 Unauthorized response.
2. WHEN an authenticated request is received at the path `/:alias`, THE Redirection_Engine SHALL normalize the alias to lowercase and first check if the authenticated user has a Private_Alias matching the alias name.
3. WHEN no Private_Alias matches, THE Redirection_Engine SHALL check if a Global_Alias matching the alias name exists.
4. WHEN only a Private_Alias matches the requested alias, THE Redirection_Engine SHALL return an HTTP 302 redirect to the Private_Alias's Destination_URL.
5. WHEN only a Global_Alias matches the requested alias, THE Redirection_Engine SHALL return an HTTP 302 redirect to the Global_Alias's Destination_URL.
6. WHEN both a Private_Alias and a Global_Alias match the requested alias, THE Redirection_Engine SHALL display the Interstitial_Page showing both destinations.
7. WHEN neither a Private_Alias nor a Global_Alias matches the requested alias, THE Redirection_Engine SHALL redirect the user to the Management_Dashboard home page with the attempted alias pre-filled as a "create this link" suggestion.
8. WHEN a successful redirect is performed, THE Redirection_Engine SHALL increment the Click_Count of the matching Alias_Record by 1.
9. WHEN a successful redirect is performed, THE Redirection_Engine SHALL update the `last_accessed_at` timestamp of the matching Alias_Record to the current UTC time.
10. WHILE an Alias_Record has Expiry_Status set to `expired`, THE Redirection_Engine SHALL return an HTTP 410 Gone response and redirect the user to the Management_Dashboard with a message indicating the alias has expired.
11. IF the Redirection_Engine encounters a database error during alias lookup, THEN THE Redirection_Engine SHALL return an HTTP 500 response with a generic error message and log the error details server-side.
12. WHEN performing a redirect, THE Redirection_Engine SHALL append query parameters from the incoming request to the Destination_URL; if the Destination_URL already contains query parameters, THE Redirection_Engine SHALL merge them with the destination's parameters taking precedence for duplicate keys.
13. WHEN performing a redirect, THE Redirection_Engine SHALL append the fragment from the incoming request to the Destination_URL; if the Destination_URL already contains a fragment, the destination's fragment SHALL take precedence.
14. WHEN both query parameters and a fragment are present on the incoming request, THE Redirection_Engine SHALL handle Query_String_Passthrough and Fragment_Passthrough independently.

### Requirement 2: Alias Management API

**User Story:** As an authenticated employee, I want a set of API endpoints to create, read, update, and delete URL aliases, so that I can manage my aliases programmatically and through the dashboard.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/links`, THE API SHALL return a JSON array of all Global_Alias records plus only the authenticated user's own Private_Alias records.
2. WHEN a GET request is received at `/api/links` with a `search` query parameter, THE API SHALL return only Alias_Records whose Alias or Title contains the search term (case-insensitive).
3. WHEN a POST request is received at `/api/links` with a valid Alias and Destination_URL, THE API SHALL create a new Alias_Record in Cosmos DB with the authenticated user's email as `created_by`, a Click_Count of 0, the current UTC timestamp as `created_at`, and the specified Expiry_Policy (defaulting to `fixed` with `duration_months` of 12 if not provided).
4. WHEN a POST request is received at `/api/links` with an Alias that already exists as a Global_Alias (and the new alias is also global), THE API SHALL return an HTTP 409 Conflict response with a descriptive error message.
5. WHEN a PUT request is received at `/api/links/:alias` by the creator of the Alias_Record, THE API SHALL update the Destination_URL, Title, `is_private`, and Expiry_Policy fields of the matching Alias_Record.
6. WHEN a PUT request is received at `/api/links/:alias` with an updated Expiry_Policy, THE API SHALL recalculate the `expires_at` timestamp based on the new policy and reset the Expiry_Status to `active`.
7. WHEN a DELETE request is received at `/api/links/:alias` by the creator of the Alias_Record, THE API SHALL remove the matching Alias_Record from Cosmos DB.
8. WHEN a GET request is received at `/api/links` with a `sort` query parameter set to `clicks`, THE API SHALL return Alias_Records sorted by Click_Count in descending order.
9. WHEN a GET request is received at `/api/links`, THE API SHALL include the Click_Count and `last_accessed_at` fields in each returned Alias_Record.
10. WHEN a PUT or DELETE request targets a Private_Alias, THE API SHALL scope the operation to the Alias_Record owned by the authenticated user.
11. IF a POST or PUT request is received with a Destination_URL that is not a valid URL format, THEN THE API SHALL return an HTTP 400 Bad Request response with a descriptive validation error message.
12. IF a POST request is received with an Alias that contains characters other than lowercase alphanumeric characters and hyphens, THEN THE API SHALL return an HTTP 400 Bad Request response indicating the allowed alias format.
13. IF a POST or PUT request is received with an Expiry_Policy type that is not one of `never`, `fixed`, or `inactivity`, THEN THE API SHALL return an HTTP 400 Bad Request response with a descriptive validation error message.
14. WHEN a POST or PUT request specifies a `fixed` Expiry_Policy, THE API SHALL accept either a `duration_months` field with a value of 1, 3, or 12, or a `custom_expires_at` field with a future ISO 8601 UTC timestamp.
15. WHEN a POST or PUT request specifies an `inactivity` Expiry_Policy, THE API SHALL set the inactivity duration to 12 months (hardcoded); no configurable duration field is accepted.
16. WHEN a PUT request is received at `/api/links/:alias/renew` by the creator of the Alias_Record or an Admin, THE API SHALL reset the `expires_at` timestamp based on the current Expiry_Policy and set the Expiry_Status to `active`.
17. THE API SHALL perform case-insensitive conflict detection when checking alias uniqueness during creation.

### Requirement 3: Role-Based Access Control

**User Story:** As a system administrator, I want to enforce role-based permissions, so that regular users can only manage their own aliases while admins can manage all global aliases.

#### Acceptance Criteria

1. THE SWA_Config SHALL require Azure Entra ID authentication for all routes, including the redirection path `/:alias`.
2. WHEN an unauthenticated request is received at any route including `/:alias`, THE Go_Service SHALL return an HTTP 401 Unauthorized response.
3. WHEN a User sends a PUT or DELETE request for a Global_Alias the User did not create, THE API SHALL return an HTTP 403 Forbidden response.
4. WHEN an Admin sends a PUT or DELETE request for any Global_Alias, THE API SHALL allow the operation regardless of the Alias_Record creator.
5. THE API SHALL prevent Admins from managing (PUT or DELETE) other users' Private_Aliases; Admin privileges apply only to Global_Aliases.
6. WHEN an unauthenticated request is received at any `/api/*` endpoint, THE API SHALL return an HTTP 401 Unauthorized response.
7. THE SWA_Config SHALL define two roles: `User` and `Admin`, mapped to Azure Entra ID groups.
8. THE SWA_Config SHALL disable GitHub, Twitter, and all non-Entra ID authentication providers.

### Requirement 4: Management Dashboard UI

**User Story:** As an authenticated employee, I want a web-based dashboard to browse, search, create, edit, and delete URL aliases, so that I can manage aliases without using the API directly.

#### Acceptance Criteria

1. THE Management_Dashboard SHALL display a searchable list of all Global_Alias records and the current user's Private_Alias records.
2. WHEN a user types into the search bar, THE Management_Dashboard SHALL filter the displayed Alias_Records by Alias or Title within 300 milliseconds of the last keystroke (debounced).
3. WHEN a user clicks the "Create" button and submits a valid alias form, THE Management_Dashboard SHALL send a POST request to `/api/links` and display the newly created Alias_Record in the list.
4. WHEN creating an alias, THE Management_Dashboard SHALL provide a toggle or selector for the user to choose between "Global" and "Personal" (private) alias types.
5. WHEN a user creates a Personal alias with the same name as an existing Global_Alias, THE Management_Dashboard SHALL display an informational message explaining that the Interstitial_Page will be shown when both match.
6. WHEN a user clicks the "Edit" button on an Alias_Record the user owns, THE Management_Dashboard SHALL display a pre-filled form allowing the user to update the Destination_URL, Title, `is_private`, and Expiry_Policy fields.
7. WHEN a user clicks the "Delete" button on an Alias_Record the user owns, THE Management_Dashboard SHALL prompt for confirmation and, upon confirmation, send a DELETE request to `/api/links/:alias` and remove the Alias_Record from the displayed list.
8. IF the API returns an error response during any CRUD operation, THEN THE Management_Dashboard SHALL display an animated toast notification with a user-readable error message without exposing internal error details.
9. THE Management_Dashboard SHALL display the Click_Count and `last_accessed_at` timestamp for each Alias_Record in the list view.
10. WHILE the Management_Dashboard is loading data from the API, THE Management_Dashboard SHALL display skeleton loading states instead of spinners.
11. THE Management_Dashboard SHALL display Private_Alias records with a "Personal" badge or indicator to visually distinguish them from Global_Alias records.
12. WHEN a user creates or edits an alias, THE Management_Dashboard SHALL display an Expiry_Policy selector using a two-step flow: first select the type (`Never`, `Expire on date`, `After inactivity`), then for `Expire on date` show preset duration options (1 month, 3 months, 12 months) and a custom date picker, and for `After inactivity` show an informational note that the alias expires after 12 months of no access.
13. THE Management_Dashboard SHALL display the Expiry_Status and `expires_at` date for each Alias_Record in the list view.
14. THE Management_Dashboard SHALL visually distinguish Alias_Records with Expiry_Status `expiring_soon` (e.g., warning indicator) and `expired` (e.g., muted or strikethrough styling) from active records.
15. WHEN a user clicks a "Renew" action on an expired or expiring_soon Alias_Record the user owns, THE Management_Dashboard SHALL send a PUT request to `/api/links/:alias/renew` and update the displayed Expiry_Status to `active`.
16. THE Management_Dashboard SHALL provide a filter option to view aliases by Expiry_Status: `All`, `Active`, `Expiring Soon`, `Expired`, and `No Expiry`.
17. THE Management_Dashboard SHALL display aliases in lowercase in create and edit forms.

### Requirement 5: Database Schema

**User Story:** As a developer, I want a well-defined Cosmos DB schema for alias records, so that data is stored consistently and queries are efficient.

#### Acceptance Criteria

1. THE Go_Service SHALL store each Alias_Record as a document in a Cosmos DB container named `aliases` with the `alias` field as the partition key.
2. THE Go_Service SHALL store the following fields on each Alias_Record: `id` (string, composite key), `alias` (string, always lowercase), `destination_url` (string), `created_by` (string, user email), `title` (string), `click_count` (integer, default 0), `is_private` (boolean, default false), `created_at` (ISO 8601 UTC timestamp), `last_accessed_at` (ISO 8601 UTC timestamp, nullable), `expiry_policy_type` (string, one of `never`, `fixed`, `inactivity`; default `fixed`), `duration_months` (integer, nullable, one of 1, 3, or 12; used when `expiry_policy_type` is `fixed` with a preset duration), `custom_expires_at` (ISO 8601 UTC timestamp, nullable; used when `expiry_policy_type` is `fixed` with a custom date), `expires_at` (ISO 8601 UTC timestamp, nullable, computed; null when `expiry_policy_type` is `never`), `expiry_status` (string, one of `active`, `expiring_soon`, `expired`, `no_expiry`; default `active`), and `expired_at` (ISO 8601 UTC timestamp, nullable, set when the alias transitions to `expired` status).
3. FOR Global_Alias records, THE Go_Service SHALL set the document `id` to the alias name (e.g., `benefits`).
4. FOR Private_Alias records, THE Go_Service SHALL set the document `id` to a composite key of `{alias}:{created_by}` (e.g., `benefits:user@example.com`).
5. THE Go_Service SHALL always store the `alias` field in lowercase to enforce case-insensitive uniqueness.

### Requirement 6: Analytics Tracking

**User Story:** As a team lead, I want to see how often each alias is used, so that I can understand which internal resources are most accessed.

#### Acceptance Criteria

1. WHEN the Redirection_Engine performs a successful redirect, THE Go_Service SHALL atomically increment the Click_Count of the Alias_Record by 1.
2. WHEN the Redirection_Engine performs a successful redirect, THE Go_Service SHALL update the `last_accessed_at` field of the Alias_Record to the current UTC time.
3. WHEN a GET request is received at `/api/links`, THE API SHALL include the Click_Count and `last_accessed_at` fields in each returned Alias_Record.
4. WHEN a GET request is received at `/api/links` with a `sort` query parameter set to `clicks`, THE API SHALL return Alias_Records sorted by Click_Count in descending order.

### Requirement 7: Private Alias Scoping

**User Story:** As an employee, I want to create private aliases that are scoped only to me, so that I can keep personal bookmarks without exposing them to the organization, and without conflicting with other users' private aliases.

#### Acceptance Criteria

1. THE Go_Service SHALL scope each Private_Alias to the user who created it; multiple users can independently register the same alias name as a Private_Alias.
2. WHEN a user requests an alias via `/:alias` and the alias exists only as another user's Private_Alias, THE Redirection_Engine SHALL treat the alias as non-existent for the requesting user and redirect to the Management_Dashboard with a "create this link" suggestion.
3. THE API SHALL exclude other users' Private_Aliases from search results and GET `/api/links` responses; only the creator's own Private_Aliases are returned.
4. WHEN a GET request is received at `/api/links`, THE API SHALL return all Global_Alias records plus only the authenticated user's own Private_Alias records.

### Requirement 8: Deployment Configuration

**User Story:** As a DevOps engineer, I want a clear deployment configuration for Azure Static Web Apps, so that the service can be deployed and maintained reliably.

#### Acceptance Criteria

1. THE Go_Service SHALL include a `staticwebapp.config.json` file that configures route rules for the SWA, including the fallback route for the React SPA and the redirect wildcard route.
2. THE SWA_Config SHALL configure the `/api/*` routes to require the `authenticated` role.
3. THE SWA_Config SHALL configure a navigation fallback to `index.html` for all non-API, non-redirect routes to support client-side routing in the Management_Dashboard.
4. THE Go_Service SHALL use an Azure Functions Node.js backend deployed as the SWA linked API.

### Requirement 9: Alias Expiry Options

**User Story:** As an authenticated employee, I want to specify an expiry policy when creating or editing an alias, so that stale or temporary aliases are automatically cleaned up over time.

#### Acceptance Criteria

1. WHEN creating a new Alias_Record, THE API SHALL accept an Expiry_Policy with one of the following types: `never`, `fixed`, or `inactivity`.
2. WHEN an Expiry_Policy of type `fixed` is specified with a `duration_months` value of 1, 3, or 12, THE API SHALL calculate the `expires_at` timestamp by adding the corresponding duration to the current UTC time.
3. WHEN an Expiry_Policy of type `fixed` is specified with a `custom_expires_at` value, THE API SHALL set the `expires_at` timestamp to the provided future date.
4. WHEN an Expiry_Policy of type `never` is specified, THE API SHALL set `expires_at` to null and set Expiry_Status to `no_expiry`.
5. WHEN an Expiry_Policy of type `inactivity` is specified, THE API SHALL set the `expires_at` timestamp to 12 months from the current UTC time (hardcoded duration, no configurable field).
6. IF no Expiry_Policy is provided during alias creation, THEN THE API SHALL default to `fixed` with `duration_months` of 12.
7. WHEN an Alias_Record with an `inactivity` Expiry_Policy is accessed via the Redirection_Engine, THE Redirection_Engine SHALL recalculate the `expires_at` timestamp to 12 months from the current UTC time.

### Requirement 10: Alias Expiry Lifecycle Management

**User Story:** As a system administrator, I want expired aliases to go through a managed lifecycle with notifications and a grace period, so that alias owners have a chance to renew before permanent deletion.

#### Acceptance Criteria

1. WHEN an Alias_Record's `expires_at` timestamp is within 7 days of the current UTC time, THE Expiry_Processor SHALL update the Expiry_Status to `expiring_soon`.
2. WHEN an Alias_Record's `expires_at` timestamp is past the current UTC time, THE Expiry_Processor SHALL update the Expiry_Status to `expired` and set the `expired_at` timestamp to the current UTC time.
3. WHILE an Alias_Record has Expiry_Status `expired`, THE Redirection_Engine SHALL not perform a redirect and SHALL instead return an HTTP 410 Gone response.
4. WHILE an Alias_Record has Expiry_Status `expired` and the `expired_at` timestamp is within the 14-day Grace_Period, THE Go_Service SHALL retain the Alias_Record and allow the owner or an Admin to renew the alias.
5. WHEN an Alias_Record has Expiry_Status `expired` and the `expired_at` timestamp is older than 14 days (past the Grace_Period), THE Expiry_Processor SHALL permanently delete the Alias_Record from Cosmos DB.
6. WHEN an owner or Admin renews an expired Alias_Record within the Grace_Period, THE API SHALL reset the `expires_at` based on the current Expiry_Policy, set Expiry_Status to `active`, and clear the `expired_at` field.

### Requirement 11: Expiry Processing

**User Story:** As a DevOps engineer, I want a scheduled background process that evaluates and enforces alias expiry policies, so that expired aliases are handled automatically without manual intervention.

#### Acceptance Criteria

1. THE Expiry_Processor SHALL run as a timer-triggered Azure Function on a daily schedule (once every 24 hours).
2. WHEN the Expiry_Processor runs, THE Expiry_Processor SHALL query all Alias_Records where `expiry_policy_type` is not `never` and evaluate each record against its Expiry_Policy.
3. WHEN the Expiry_Processor identifies an Alias_Record with `expires_at` within 7 days, THE Expiry_Processor SHALL update the Expiry_Status to `expiring_soon`.
4. WHEN the Expiry_Processor identifies an Alias_Record with `expires_at` in the past and Expiry_Status not already `expired`, THE Expiry_Processor SHALL update the Expiry_Status to `expired` and set `expired_at` to the current UTC time.
5. WHEN the Expiry_Processor identifies an Alias_Record with Expiry_Status `expired` and `expired_at` older than 14 days, THE Expiry_Processor SHALL permanently delete the Alias_Record from Cosmos DB.
6. IF the Expiry_Processor encounters an error processing an individual Alias_Record, THEN THE Expiry_Processor SHALL log the error and continue processing the remaining Alias_Records.
7. WHEN the Expiry_Processor completes a run, THE Expiry_Processor SHALL log a summary including the count of records transitioned to `expiring_soon`, `expired`, and permanently deleted.

### Requirement 12: UI/UX Design Standards

**User Story:** As an authenticated employee, I want the Management Dashboard to have a modern, polished glassmorphism design, so that the interface is visually appealing and easy to use.

#### Acceptance Criteria

1. THE Management_Dashboard SHALL apply a frosted glass effect (using `backdrop-filter: blur`) on cards, modals, and panels.
2. THE Management_Dashboard SHALL use semi-transparent backgrounds with subtle gradients for primary UI surfaces.
3. THE Management_Dashboard SHALL use clean typography with the Inter font family or a system font stack as fallback.
4. THE Management_Dashboard SHALL apply smooth CSS transitions and animations for state changes (e.g., hover effects, panel open/close, list item add/remove).
5. THE Management_Dashboard SHALL use skeleton loading states (placeholder shapes matching content layout) instead of spinners when loading data from the API.
6. THE Management_Dashboard SHALL display animated toast notifications for success, error, and informational messages.
7. THE Management_Dashboard SHALL be responsive and support desktop and tablet viewport sizes.
8. THE Management_Dashboard SHALL support the keyboard shortcut `/` to focus the search bar.
9. THE Management_Dashboard SHALL maintain accessible contrast ratios over blurred backgrounds, support full keyboard navigation, include ARIA labels on interactive elements, and respect the `prefers-reduced-motion` media query by disabling animations when set.

### Requirement 13: Interstitial Conflict Resolution Page

**User Story:** As an employee, I want to see a clear choice when my private alias and a global alias share the same name, so that I can decide which destination to visit.

#### Acceptance Criteria

1. WHEN a user's Private_Alias and a Global_Alias both match the requested alias name, THE Redirection_Engine SHALL display the Interstitial_Page instead of performing an immediate redirect.
2. THE Interstitial_Page SHALL display the user's Private_Alias destination and the Global_Alias destination as two distinct options.
3. THE Interstitial_Page SHALL auto-redirect to the user's Private_Alias destination after 5 seconds.
4. THE Interstitial_Page SHALL display a visible countdown timer showing the remaining seconds before auto-redirect.
5. THE Interstitial_Page SHALL provide a clickable link to navigate to either destination immediately, cancelling the auto-redirect.
6. THE Interstitial_Page SHALL follow the glassmorphism UI design standards defined in Requirement 12.

### Requirement 14: Authentication and Single Sign-On

**User Story:** As an employee, I want to access the Go service seamlessly from my corporate laptop via SSO, and still be able to authenticate from personal devices, so that I experience minimal friction regardless of how I connect.

#### Acceptance Criteria

1. THE SWA_Config SHALL use Azure Entra ID as the sole identity provider for the Go_Service.
2. THE SWA_Config SHALL disable all authentication providers except Azure Entra ID (AAD), including GitHub, Twitter, and any other built-in SWA providers.
3. THE SWA_Config SHALL configure a custom login route that redirects to the Entra ID login flow.
4. THE SWA_Config SHALL configure a post-login redirect to return users to the URL the user originally requested.
5. WHILE a user is on a corporate device connected via GSA with an active Entra ID session, THE Go_Service SHALL authenticate the user via SSO with no interactive login prompt, leveraging the existing Entra ID session or Primary Refresh Token (PRT).
6. WHEN a user on a personal (non-GSA) device accesses the Go_Service, THE Go_Service SHALL redirect the user to the standard Entra ID login page for authentication.
7. WHEN a user on a personal device completes Entra ID authentication, THE Go_Service SHALL grant the user the same access and capabilities as a user on a corporate device.
8. THE SWA_Config SHALL NOT restrict access based on device type or network location -- authentication via Entra ID is the only access gate.
9. THE Go_Service SHALL be compatible with Microsoft Entra Global Secure Access (GSA) for zero-trust network access.
10. THE Go_Service SHALL NOT rely on network-level restrictions such as IP allowlists or VPN requirements for access control -- all access control is identity-based via Entra ID.
11. WHEN Conditional Access policies are configured in Entra ID (e.g., MFA requirements, compliant device policies), THE SWA authentication flow SHALL respect and enforce those policies.
12. THE SWA authentication session SHALL persist across browser sessions using SWA's built-in session management.
13. WHEN a user's Entra ID session expires or is revoked, THE Go_Service SHALL require re-authentication on the next request.
14. WHEN a user's session expires while using the Management_Dashboard, THE Management_Dashboard SHALL redirect the user to the Entra ID login flow and preserve the URL the user was attempting to access so the user is returned to the same page after re-authentication.
15. THE API SHALL extract the authenticated user's email from the Client_Principal header (`x-ms-client-principal`) provided by Azure Static Web Apps.
16. THE API SHALL use the authenticated user's email from the Client_Principal consistently for `created_by` fields, ownership checks, and private alias scoping.
17. THE API SHALL NOT trust user-provided identity information in request bodies -- only the Client_Principal header is authoritative for user identity.
18. THE Go_Service SHALL use SWA's built-in Entra ID authentication (configured via `staticwebapp.config.json`) rather than a custom MSAL implementation.
