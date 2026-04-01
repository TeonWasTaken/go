# Requirements Document

## Introduction

The Go URL Alias Service currently supports a single deployment mode: corporate Azure Entra ID authentication enforced for all interactions. This feature rearchitects the authentication layer to support three configurable deployment modes — corporate, public, and dev — selected via a single `AUTH_MODE` environment variable. The refactoring introduces a dependency-injection pattern for auth strategy, eliminating scattered `DEV_MODE` conditionals and enabling clean separation of authentication concerns across deployment contexts. A Corporate_Lock safety mechanism prevents accidental misconfiguration of corporate deployments into public mode.

## Glossary

- **Auth_Strategy**: An injectable module that implements authentication extraction, route protection rules, and identity provider configuration for a specific deployment mode.
- **Auth_Mode**: A configuration value (`corporate`, `public`, or `dev`) that selects which Auth_Strategy the system uses at startup.
- **Corporate_Strategy**: The Auth_Strategy for enterprise deployments requiring Azure Entra ID SSO for all interactions.
- **Public_Strategy**: The Auth_Strategy for public deployments allowing unauthenticated access to public redirects while requiring sign-in via a configurable identity provider (e.g., Google, GitHub) for link management.
- **Dev_Strategy**: The Auth_Strategy for local development that provides mock identity without external identity providers.
- **Strategy_Registry**: A mapping from Auth_Mode values to their corresponding Auth_Strategy implementations, used by the Strategy_Factory to resolve the active strategy.
- **Strategy_Factory**: The component that reads the Auth_Mode configuration and returns the corresponding Auth_Strategy from the Strategy_Registry.
- **Protected_Endpoint**: An API endpoint that requires a valid authenticated identity (create, update, delete, renew, list links).
- **Public_Endpoint**: An API endpoint that can be accessed without authentication (redirect resolution in public mode, scrape-title).
- **SWA_Config**: The `staticwebapp.config.json` file that controls route-level authentication enforcement, identity provider availability, and 401 redirect behavior in Azure Static Web Apps.
- **Identity_Extraction**: The process of reading authentication headers and returning an AuthIdentity object (email + roles) or null.
- **Redirect_Endpoint**: The `GET /{alias}` route that resolves an alias to its destination URL and performs an HTTP 302 redirect.
- **Corporate_Lock**: A safety mechanism controlled by the `CORPORATE_LOCK` environment variable that, when set to `true`, prevents the API from starting in any Auth_Mode other than `corporate`.
- **Identity_Provider_List**: A configurable list of allowed identity providers for the Public_Strategy (e.g., `google`, `github`), defaulting to Google when not specified.

## Requirements

### Requirement 1: Auth Mode Configuration

**User Story:** As a deployer, I want to select the authentication mode via a single environment variable, so that I can switch between corporate, public, and dev deployments without code changes.

#### Acceptance Criteria

1. THE Strategy_Factory SHALL read the `AUTH_MODE` environment variable to determine the active Auth_Strategy.
2. THE Strategy_Factory SHALL support exactly three Auth_Mode values: `corporate`, `public`, and `dev`.
3. IF the `AUTH_MODE` environment variable is not set or contains an unrecognized value, THEN THE Strategy_Factory SHALL fail with a descriptive error message at startup.
4. THE Strategy_Factory SHALL instantiate the Auth_Strategy once at startup and provide the same instance to all request handlers via dependency injection.

### Requirement 2: Strategy Registry and Dependency Injection

**User Story:** As a developer, I want auth strategies registered in a central registry and injected into handlers, so that adding new strategies requires no changes to handler code.

#### Acceptance Criteria

1. THE Strategy_Registry SHALL map each Auth_Mode value to its corresponding Auth_Strategy constructor.
2. THE Strategy_Factory SHALL resolve the Auth_Strategy from the Strategy_Registry using the configured Auth_Mode.
3. WHEN a request handler requires authentication, THE request handler SHALL receive the Auth_Strategy via dependency injection rather than calling a global factory function.
4. THE Strategy_Registry SHALL be extensible, allowing new Auth_Strategy implementations to be registered without modifying existing strategies or handlers.

### Requirement 3: Corporate Auth Strategy

**User Story:** As a corporate deployer, I want all interactions locked down behind Azure Entra ID SSO, so that only authenticated employees can access the service.

#### Acceptance Criteria

1. WHILE Auth_Mode is `corporate`, THE Corporate_Strategy SHALL extract identity from the `x-ms-client-principal` Base64-encoded header provided by Azure Static Web Apps.
2. WHILE Auth_Mode is `corporate`, THE Corporate_Strategy SHALL return null when the `x-ms-client-principal` header is missing or contains invalid data.
3. WHILE Auth_Mode is `corporate`, THE SWA_Config SHALL enforce the `authenticated` role on all `/api/*` routes.
4. WHILE Auth_Mode is `corporate`, THE SWA_Config SHALL enforce the `authenticated` role on the `/*` catch-all route.
5. WHILE Auth_Mode is `corporate`, THE SWA_Config SHALL configure Azure Active Directory as the sole identity provider.
6. WHILE Auth_Mode is `corporate`, THE SWA_Config SHALL block GitHub, Twitter, and Google identity providers with a 404 status.
7. WHILE Auth_Mode is `corporate`, THE Redirect_Endpoint SHALL require a valid authenticated identity and return 401 when identity is null.

### Requirement 4: Public Auth Strategy

**User Story:** As a public deployer, I want public links to be accessible without sign-in and link management to require authentication via a configurable identity provider, so that anyone can follow shared links while only authorized users can manage them.

#### Acceptance Criteria

1. WHILE Auth_Mode is `public`, THE Public_Strategy SHALL accept a configurable Identity_Provider_List specifying which identity providers are allowed (e.g., `google`, `github`).
2. WHILE Auth_Mode is `public`, THE Public_Strategy SHALL default to Google as the sole identity provider when no Identity_Provider_List is configured.
3. WHILE Auth_Mode is `public`, THE Public_Strategy SHALL extract identity from OAuth tokens or session headers provided by the configured identity providers.
4. WHILE Auth_Mode is `public`, THE Public_Strategy SHALL return null when no valid authentication credential from a configured identity provider is present.
5. WHILE Auth_Mode is `public`, THE Redirect_Endpoint SHALL resolve and redirect public (non-private) aliases without requiring authentication.
6. WHILE Auth_Mode is `public`, THE Redirect_Endpoint SHALL return 401 for private alias resolution when no authenticated identity is present.
7. WHILE Auth_Mode is `public`, THE Protected_Endpoint for creating links SHALL require a valid authenticated identity.
8. WHILE Auth_Mode is `public`, THE Protected_Endpoint for updating links SHALL require a valid authenticated identity.
9. WHILE Auth_Mode is `public`, THE Protected_Endpoint for deleting links SHALL require a valid authenticated identity.
10. WHILE Auth_Mode is `public`, THE Protected_Endpoint for listing links SHALL require a valid authenticated identity.
11. WHILE Auth_Mode is `public`, THE SWA_Config SHALL enable the identity providers specified in the Identity_Provider_List.
12. WHILE Auth_Mode is `public`, THE SWA_Config SHALL block identity providers not included in the Identity_Provider_List with a 404 status.
13. WHILE Auth_Mode is `public`, THE SWA_Config SHALL allow unauthenticated access to the `/{alias}` redirect route.
14. WHILE Auth_Mode is `public`, THE SWA_Config SHALL enforce the `authenticated` role on link management API routes (`POST /api/links`, `PUT /api/links/*`, `DELETE /api/links/*`).

### Requirement 5: Dev Auth Strategy

**User Story:** As a developer, I want a dev auth strategy that uses the same DI pattern as production strategies, so that dev mode is tested through the same code paths without scattered if-statements.

#### Acceptance Criteria

1. WHILE Auth_Mode is `dev`, THE Dev_Strategy SHALL return a mock identity using the `x-mock-user-email` header, the `DEV_USER_EMAIL` environment variable, or a default value of `dev@localhost` (in that priority order).
2. WHILE Auth_Mode is `dev`, THE Dev_Strategy SHALL return mock roles using the `x-mock-user-roles` header, the `DEV_USER_ROLES` environment variable, or a default value of `User` (in that priority order).
3. WHILE Auth_Mode is `dev`, THE Dev_Strategy SHALL always return a non-null identity (mock users are always authenticated).
4. THE Dev_Strategy SHALL be registered in the Strategy_Registry using the same interface as Corporate_Strategy and Public_Strategy.

### Requirement 6: Eliminate Scattered Dev Mode Conditionals

**User Story:** As a developer, I want all `DEV_MODE` environment variable checks removed from non-auth code, so that the codebase uses a single DI-based pattern for mode-dependent behavior.

#### Acceptance Criteria

1. THE cosmos-client module SHALL select between Cosmos DB and the in-memory store based on an injected or configured storage strategy rather than checking the `DEV_MODE` environment variable.
2. THE seed-data module SHALL load seed data based on the active storage configuration rather than checking the `DEV_MODE` environment variable.
3. WHEN the `AUTH_MODE` is `dev` and no `COSMOS_CONNECTION_STRING` is configured, THE cosmos-client module SHALL use the in-memory store.
4. WHEN the `AUTH_MODE` is `corporate` or `public` and no `COSMOS_CONNECTION_STRING` is configured, THE cosmos-client module SHALL fail with a descriptive error message.
5. THE codebase SHALL contain zero references to the `DEV_MODE` environment variable after the refactoring is complete.

### Requirement 7: Redirect Endpoint Auth Flexibility

**User Story:** As a deployer, I want the redirect endpoint to adapt its authentication requirement based on the active auth mode, so that corporate mode stays locked down while public mode allows public access to shared links.

#### Acceptance Criteria

1. THE Auth_Strategy interface SHALL expose a method or property indicating whether the Redirect_Endpoint requires authentication.
2. WHEN the Auth_Strategy indicates redirect requires authentication, THE Redirect_Endpoint SHALL return 401 for requests without a valid identity.
3. WHEN the Auth_Strategy indicates redirect does not require authentication and no identity is present, THE Redirect_Endpoint SHALL resolve only public (non-private) aliases.
4. WHEN the Auth_Strategy indicates redirect does not require authentication and no identity is present, THE Redirect_Endpoint SHALL skip private alias lookup entirely.
5. WHEN the Auth_Strategy indicates redirect does not require authentication and a valid identity is present, THE Redirect_Endpoint SHALL resolve both private and public aliases (same behavior as authenticated mode).

### Requirement 8: SWA Config Generation per Auth Mode

**User Story:** As a deployer, I want the SWA configuration to match the active auth mode, so that route-level protections and identity provider settings are correct for each deployment.

#### Acceptance Criteria

1. THE system SHALL provide a documented SWA_Config template or generation mechanism for each Auth_Mode.
2. THE corporate SWA_Config SHALL redirect 401 responses to the Azure AD login endpoint.
3. THE public SWA_Config SHALL redirect 401 responses to the login endpoint of the primary configured identity provider.
4. THE public SWA_Config SHALL allow unauthenticated access to the `/{alias}` rewrite route.
5. THE dev SWA_Config SHALL not enforce any authentication on routes (all routes accessible).

### Requirement 9: Frontend Auth Awareness

**User Story:** As a user, I want the frontend to adapt its login flow and UI based on the deployment mode, so that I see the correct sign-in option for my deployment.

#### Acceptance Criteria

1. THE frontend SHALL detect the active Auth_Mode via an API endpoint or injected configuration.
2. WHILE Auth_Mode is `corporate`, THE frontend SHALL direct users to the Azure AD login flow when authentication is required.
3. WHILE Auth_Mode is `public`, THE frontend SHALL direct users to the login flow of the primary configured identity provider when authentication is required.
4. WHILE Auth_Mode is `public`, THE frontend SHALL display public links on the landing page without requiring sign-in.
5. WHILE Auth_Mode is `public`, THE frontend SHALL prompt for sign-in only when the user attempts to create, edit, or delete a link.
6. WHILE Auth_Mode is `dev`, THE frontend SHALL skip login redirects and operate as if the user is always authenticated.

### Requirement 10: Corporate Lock Safety Mechanism

**User Story:** As a corporate deployer, I want a safety mechanism that prevents the API from accidentally starting in public or dev mode, so that a misconfiguration cannot expose the service without corporate authentication.

#### Acceptance Criteria

1. THE Strategy_Factory SHALL read the `CORPORATE_LOCK` environment variable at startup.
2. WHILE `CORPORATE_LOCK` is set to `true` and Auth_Mode is not `corporate`, THE Strategy_Factory SHALL refuse to start and fail with a descriptive error message indicating that Corporate_Lock prevents non-corporate modes.
3. WHILE `CORPORATE_LOCK` is set to `true` and Auth_Mode is `corporate`, THE Strategy_Factory SHALL proceed with normal startup.
4. WHEN `CORPORATE_LOCK` is not set or is set to `false`, THE Strategy_Factory SHALL allow any valid Auth_Mode value.
5. THE corporate SWA_Config SHALL act as defense-in-depth by enforcing the `authenticated` role on all routes and blocking non-AAD identity providers at the edge, so that unauthenticated requests are rejected even if API-level auth is misconfigured.
6. WHEN `CORPORATE_LOCK` is `true`, THE Strategy_Factory SHALL validate that Auth_Mode is `corporate` before any other startup logic executes.
