# Requirements Document

## Introduction

"Go" is an internal URL aliasing service that allows employees to create short, memorable aliases (e.g., `go/benefits`, `go/wiki`) that redirect to longer destination URLs. The service provides a management dashboard for creating and discovering aliases, enforces role-based access control via Azure Entra ID, and tracks basic analytics on alias usage. The system is built on Azure Static Web Apps with Azure Functions and Cosmos DB.

## Glossary

- **Go_Service**: The overall URL aliasing application, including the frontend, backend API, and redirection engine.
- **Redirection_Engine**: The backend component (Azure Function) responsible for looking up an alias in the database and performing an HTTP 302 redirect to the destination URL.
- **Management_Dashboard**: The React-based frontend UI that allows authenticated users to create, edit, delete, search, and browse URL aliases.
- **Alias**: A short, unique string identifier (e.g., `benefits`) that maps to a destination URL.
- **Destination_URL**: The full URL that an alias redirects to.
- **Alias_Record**: A document in Cosmos DB representing a single alias, including its metadata (destination URL, creator, title, click count, visibility, timestamps).
- **API**: The set of Azure Functions that provide CRUD operations for aliases and handle redirection logic.
- **User**: An authenticated employee with the 'User' role who can create and manage their own aliases.
- **Admin**: An authenticated employee with the 'Admin' role who can manage all aliases in the system.
- **Click_Count**: An integer field on an Alias_Record that tracks the total number of redirects performed for that alias.
- **SWA_Config**: The `staticwebapp.config.json` file that defines authentication and route-level authorization rules for Azure Static Web Apps.
- **Expiry_Policy**: A configuration on an Alias_Record that determines when the alias expires. Possible types are: fixed-duration (1 month, 3 months, 6 months, 12 months), inactivity-based (expires after a specified period of no access), or never (no expiration).
- **Expiry_Status**: The computed state of an Alias_Record's expiry: `active` (not expired), `expiring_soon` (within 7 days of expiration), `expired` (past expiration date), or `no_expiry` (never expires).
- **Grace_Period**: A 14-day window after an alias expires during which the alias is soft-deleted (redirects are disabled) but can still be restored by the owner or an Admin.
- **Expiry_Processor**: A scheduled Azure Function that runs daily to evaluate Alias_Records against their Expiry_Policy and transition them through expiry states (active → expired → permanently deleted).

## Requirements

### Requirement 1: Alias Redirection

**User Story:** As an employee, I want to type a short alias path into my browser, so that I am redirected to the correct destination URL without needing to remember the full link.

#### Acceptance Criteria

1. WHEN a request is received at the path `/:alias`, THE Redirection_Engine SHALL look up the Alias in Cosmos DB and return an HTTP 302 redirect to the corresponding Destination_URL.
2. WHEN a request is received at the path `/:alias` and no matching Alias_Record exists, THE Redirection_Engine SHALL redirect the user to the Management_Dashboard home page with the attempted alias pre-filled as a "create this link" suggestion.
3. WHEN a successful redirect is performed, THE Redirection_Engine SHALL increment the Click_Count of the matching Alias_Record by 1.
4. WHEN a successful redirect is performed, THE Redirection_Engine SHALL update the `last_accessed_at` timestamp of the matching Alias_Record to the current UTC time.
5. WHILE an Alias_Record has `is_private` set to true, THE Redirection_Engine SHALL only perform the redirect if the requesting user is the creator of the Alias_Record or has the Admin role.
6. WHILE an Alias_Record has Expiry_Status set to `expired`, THE Redirection_Engine SHALL return an HTTP 410 Gone response and redirect the user to the Management_Dashboard with a message indicating the alias has expired.
7. IF the Redirection_Engine encounters a database error during alias lookup, THEN THE Redirection_Engine SHALL return an HTTP 500 response with a generic error message and log the error details server-side.

### Requirement 2: Alias Management API

**User Story:** As an authenticated employee, I want a set of API endpoints to create, read, update, and delete URL aliases, so that I can manage my aliases programmatically and through the dashboard.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/links`, THE API SHALL return a JSON array of all Alias_Records where `is_private` is false, or where the requesting user is the creator.
2. WHEN a GET request is received at `/api/links` with a `search` query parameter, THE API SHALL return only Alias_Records whose Alias or Title contains the search term (case-insensitive).
3. WHEN a POST request is received at `/api/links` with a valid Alias and Destination_URL, THE API SHALL create a new Alias_Record in Cosmos DB with the authenticated user's email as `created_by`, a Click_Count of 0, the current UTC timestamp as `created_at`, and the specified Expiry_Policy (defaulting to `12 months` if not provided).
4. WHEN a POST request is received at `/api/links` with an Alias that already exists, THE API SHALL return an HTTP 409 Conflict response with a descriptive error message.
5. WHEN a PUT request is received at `/api/links/:alias` by the creator of the Alias_Record, THE API SHALL update the Destination_URL, Title, `is_private`, and Expiry_Policy fields of the matching Alias_Record.
6. WHEN a PUT request is received at `/api/links/:alias` with an updated Expiry_Policy, THE API SHALL recalculate the `expires_at` timestamp based on the new policy and reset the Expiry_Status to `active`.
7. WHEN a DELETE request is received at `/api/links/:alias` by the creator of the Alias_Record, THE API SHALL remove the matching Alias_Record from Cosmos DB.
8. IF a POST or PUT request is received with a Destination_URL that is not a valid URL format, THEN THE API SHALL return an HTTP 400 Bad Request response with a descriptive validation error message.
9. IF a POST request is received with an Alias that contains characters other than lowercase alphanumeric characters and hyphens, THEN THE API SHALL return an HTTP 400 Bad Request response indicating the allowed alias format.
10. IF a POST or PUT request is received with an Expiry_Policy type that is not one of `1_month`, `3_months`, `6_months`, `12_months`, `never`, or `inactivity_based`, THEN THE API SHALL return an HTTP 400 Bad Request response with a descriptive validation error message.
11. WHEN a POST or PUT request specifies an `inactivity_based` Expiry_Policy, THE API SHALL require an `inactivity_months` field with a value between 1 and 24.
12. WHEN a PUT request is received at `/api/links/:alias/renew` by the creator of the Alias_Record or an Admin, THE API SHALL reset the `expires_at` timestamp based on the current Expiry_Policy and set the Expiry_Status to `active`.

### Requirement 3: Role-Based Access Control

**User Story:** As a system administrator, I want to enforce role-based permissions, so that regular users can only manage their own aliases while admins can manage all aliases.

#### Acceptance Criteria

1. THE SWA_Config SHALL require Azure Entra ID authentication for all routes except the redirection path `/:alias`.
2. WHEN a User sends a PUT or DELETE request for an Alias_Record the User did not create, THE API SHALL return an HTTP 403 Forbidden response.
3. WHEN an Admin sends a PUT or DELETE request for any Alias_Record, THE API SHALL allow the operation regardless of the Alias_Record creator.
4. WHEN an unauthenticated request is received at any `/api/*` endpoint, THE API SHALL return an HTTP 401 Unauthorized response.
5. THE SWA_Config SHALL define two roles: `User` and `Admin`, mapped to Azure Entra ID groups.

### Requirement 4: Management Dashboard UI

**User Story:** As an authenticated employee, I want a web-based dashboard to browse, search, create, edit, and delete URL aliases, so that I can manage aliases without using the API directly.

#### Acceptance Criteria

1. THE Management_Dashboard SHALL display a searchable list of all public Alias_Records and the current user's private Alias_Records.
2. WHEN a user types into the search bar, THE Management_Dashboard SHALL filter the displayed Alias_Records by Alias or Title within 300 milliseconds of the last keystroke (debounced).
3. WHEN a user clicks the "Create" button and submits a valid alias form, THE Management_Dashboard SHALL send a POST request to `/api/links` and display the newly created Alias_Record in the list.
4. WHEN a user clicks the "Edit" button on an Alias_Record the user owns, THE Management_Dashboard SHALL display a pre-filled form allowing the user to update the Destination_URL, Title, and `is_private` fields.
5. WHEN a user clicks the "Delete" button on an Alias_Record the user owns, THE Management_Dashboard SHALL prompt for confirmation and, upon confirmation, send a DELETE request to `/api/links/:alias` and remove the Alias_Record from the displayed list.
6. IF the API returns an error response during any CRUD operation, THEN THE Management_Dashboard SHALL display a user-readable error notification without exposing internal error details.
7. THE Management_Dashboard SHALL display the Click_Count and `last_accessed_at` timestamp for each Alias_Record in the list view.
8. WHILE the Management_Dashboard is loading data from the API, THE Management_Dashboard SHALL display a loading indicator.
9. WHEN a user creates or edits an alias, THE Management_Dashboard SHALL display an Expiry_Policy selector with the following preset options: `1 month`, `3 months`, `6 months`, `12 months`, `Never`, and `After inactivity` (with a configurable inactivity period).
10. WHEN the `After inactivity` option is selected, THE Management_Dashboard SHALL display a secondary input allowing the user to specify the inactivity period in months (1 to 24).
11. THE Management_Dashboard SHALL display the Expiry_Status and `expires_at` date for each Alias_Record in the list view.
12. THE Management_Dashboard SHALL visually distinguish Alias_Records with Expiry_Status `expiring_soon` (e.g., warning indicator) and `expired` (e.g., muted or strikethrough styling) from active records.
13. WHEN a user clicks a "Renew" action on an expired or expiring_soon Alias_Record the user owns, THE Management_Dashboard SHALL send a PUT request to `/api/links/:alias/renew` and update the displayed Expiry_Status to `active`.
14. THE Management_Dashboard SHALL provide a filter option to view aliases by Expiry_Status: `All`, `Active`, `Expiring Soon`, `Expired`, and `No Expiry`.

### Requirement 5: Database Schema

**User Story:** As a developer, I want a well-defined Cosmos DB schema for alias records, so that data is stored consistently and queries are efficient.

#### Acceptance Criteria

1. THE Go_Service SHALL store each Alias_Record as a document in a Cosmos DB container named `aliases` with the Alias as the partition key.
2. THE Go_Service SHALL store the following fields on each Alias_Record: `alias` (string, unique), `destination_url` (string), `created_by` (string, user email), `title` (string), `click_count` (integer, default 0), `is_private` (boolean, default false), `created_at` (ISO 8601 UTC timestamp), `last_accessed_at` (ISO 8601 UTC timestamp, nullable), `expiry_policy_type` (string, one of `1_month`, `3_months`, `6_months`, `12_months`, `never`, `inactivity_based`; default `12_months`), `inactivity_months` (integer, nullable, required when `expiry_policy_type` is `inactivity_based`), `expires_at` (ISO 8601 UTC timestamp, nullable, null when `expiry_policy_type` is `never`), `expiry_status` (string, one of `active`, `expiring_soon`, `expired`, `no_expiry`; default `active`), and `expired_at` (ISO 8601 UTC timestamp, nullable, set when the alias transitions to `expired` status).
3. THE Go_Service SHALL use the `alias` field as the document `id` in Cosmos DB to enforce uniqueness.

### Requirement 6: Analytics Tracking

**User Story:** As a team lead, I want to see how often each alias is used, so that I can understand which internal resources are most accessed.

#### Acceptance Criteria

1. WHEN the Redirection_Engine performs a successful redirect, THE Go_Service SHALL atomically increment the Click_Count of the Alias_Record by 1.
2. WHEN the Redirection_Engine performs a successful redirect, THE Go_Service SHALL update the `last_accessed_at` field of the Alias_Record to the current UTC time.
3. WHEN a GET request is received at `/api/links`, THE API SHALL include the Click_Count and `last_accessed_at` fields in each returned Alias_Record.
4. WHEN a GET request is received at `/api/links` with a `sort` query parameter set to `clicks`, THE API SHALL return Alias_Records sorted by Click_Count in descending order.

### Requirement 7: Alias Redirection for Private Links

**User Story:** As an employee, I want to create private aliases that only I (and admins) can use, so that I can keep personal bookmarks without exposing them to the entire organization.

#### Acceptance Criteria

1. WHILE an Alias_Record has `is_private` set to true, THE Redirection_Engine SHALL return an HTTP 403 Forbidden response if the requesting user is not the creator and does not have the Admin role.
2. WHILE an Alias_Record has `is_private` set to true, THE API SHALL exclude the Alias_Record from GET `/api/links` responses unless the requesting user is the creator or has the Admin role.

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

1. WHEN creating a new Alias_Record, THE API SHALL accept an Expiry_Policy with one of the following types: `1_month`, `3_months`, `6_months`, `12_months`, `never`, or `inactivity_based`.
2. WHEN an Expiry_Policy of type `1_month`, `3_months`, `6_months`, or `12_months` is specified, THE API SHALL calculate the `expires_at` timestamp by adding the corresponding duration to the current UTC time.
3. WHEN an Expiry_Policy of type `never` is specified, THE API SHALL set `expires_at` to null and set Expiry_Status to `no_expiry`.
4. WHEN an Expiry_Policy of type `inactivity_based` is specified, THE API SHALL calculate the `expires_at` timestamp by adding the specified `inactivity_months` duration to the current UTC time, and recalculate `expires_at` each time the `last_accessed_at` field is updated.
5. IF no Expiry_Policy is provided during alias creation, THEN THE API SHALL default to `12_months`.
6. WHEN an Alias_Record with an `inactivity_based` Expiry_Policy is accessed via the Redirection_Engine, THE Redirection_Engine SHALL recalculate the `expires_at` timestamp by adding the `inactivity_months` duration to the current UTC time.

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
