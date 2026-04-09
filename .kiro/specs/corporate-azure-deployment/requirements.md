# Requirements Document

## Introduction

This specification covers the deployment pipeline, infrastructure configuration, and documentation required to deploy the Go URL Alias Service as a private, internal corporate application on Azure. The deployment uses Azure DevOps for CI/CD, Microsoft Entra ID (Azure AD) for single sign-on, Entra groups for role-based access control, and Azure Static Web Apps with an Azure Functions API backend backed by Cosmos DB. The solution must support seamless SSO via Global Secure Access (GSA) on corporate-managed devices while also allowing authentication from personal devices using an organisation Entra account.

## Glossary

- **Pipeline**: An Azure DevOps YAML pipeline definition (`azure-pipelines.yml`) that automates build, test, and deployment steps.
- **SWA**: Azure Static Web App — the hosting platform for the frontend and API.
- **Entra_ID**: Microsoft Entra ID (formerly Azure Active Directory) — the corporate identity provider.
- **Entra_App_Registration**: An application registration in Entra ID that enables OAuth 2.0 / OpenID Connect authentication for the SWA.
- **Entra_Group**: A security group in Entra ID used to assign roles to users.
- **GSA**: Global Secure Access — Microsoft's Security Service Edge solution that provides seamless SSO for corporate-managed devices.
- **SWA_Config**: The `staticwebapp.config.json` file that controls routing, authentication, and role mapping at the Azure SWA edge.
- **Cosmos_DB**: Azure Cosmos DB — the NoSQL database used for alias record storage.
- **Role_Mapping**: The SWA configuration that maps Entra group membership to application roles (e.g., mapping an Entra group to the "Admin" role).
- **Deployment_Token**: A secret token issued by the SWA resource used to authenticate deployments from the CI/CD pipeline.
- **Service_Connection**: An Azure DevOps service connection that provides authentication credentials for pipeline tasks to interact with Azure resources.

## Requirements

### Requirement 1: Azure DevOps CI/CD Pipeline

**User Story:** As a DevOps engineer, I want an Azure DevOps pipeline that automatically builds, tests, and deploys the Go URL Alias Service when code is pushed to the main branch, so that deployments are consistent and automated.

#### Acceptance Criteria

1. WHEN a commit is pushed to the `main` branch, THE Pipeline SHALL trigger a build and deployment run automatically.
2. THE Pipeline SHALL install dependencies for both the frontend (root `package.json`) and the API (`api/package.json`).
3. THE Pipeline SHALL execute the frontend test suite (`npm test` in root) and the API test suite (`npm test` in `api/`) before deployment.
4. IF any test suite fails, THEN THE Pipeline SHALL halt execution and report the failure without deploying.
5. THE Pipeline SHALL build the frontend by running `npm run build` in the project root, producing output in the `dist/` directory.
6. THE Pipeline SHALL build the API by running `npm run build` in the `api/` directory.
7. THE Pipeline SHALL generate the SWA configuration by running `AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts` before deployment.
8. THE Pipeline SHALL deploy the built artifacts to the Azure Static Web App using the `AzureStaticWebApp@0` task with `app_location` set to `/`, `api_location` set to `api/`, and `output_location` set to `dist/`.
9. THE Pipeline SHALL use a pipeline variable or variable group named `go-url-alias` to store the SWA deployment token, avoiding hardcoded secrets in the YAML file.
10. THE Pipeline SHALL use Node.js 20 as the runtime for all build and test steps.

### Requirement 2: Entra ID SSO Configuration

**User Story:** As a corporate user, I want to authenticate using my organisation's Entra ID account via single sign-on, so that I can access the Go URL Alias Service without managing separate credentials.

#### Acceptance Criteria

1. THE Entra_App_Registration SHALL be configured as a single-tenant application (accounts in the organisational directory only).
2. THE Entra_App_Registration SHALL include a redirect URI matching the SWA authentication callback URL pattern: `https://<swa-hostname>/.auth/login/aad/callback`.
3. THE Entra_App_Registration SHALL have an `openid`, `profile`, and `email` delegated permission configured under Microsoft Graph API permissions.
4. THE Entra_App_Registration SHALL have a client secret generated and stored as the `AAD_CLIENT_SECRET` application setting in the SWA resource.
5. THE SWA_Config SHALL reference the Entra tenant ID in the `openIdIssuer` URL and the client ID and client secret via the `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET` setting names.
6. THE SWA_Config SHALL block all non-Entra identity providers (GitHub, Twitter, Google) by returning HTTP 404 for their login routes.
7. WHEN an unauthenticated user accesses any protected route, THE SWA SHALL redirect the user to the Entra ID login page (`/.auth/login/aad`) with a post-login redirect back to the originally requested page.

### Requirement 3: Seamless SSO via Global Secure Access

**User Story:** As a corporate user on a GSA-managed device, I want to be signed in automatically without entering credentials, so that accessing go links is frictionless.

#### Acceptance Criteria

1. THE Deployment_Documentation SHALL include instructions for enabling the Entra App Registration as an enterprise application with SSO enabled.
2. THE Deployment_Documentation SHALL describe how to configure the GSA traffic forwarding profile to include the SWA hostname so that authentication tokens are passed transparently.
3. THE Deployment_Documentation SHALL describe how to verify that Kerberos or PRT-based seamless SSO is functioning by testing from a domain-joined, GSA-enrolled device.
4. WHEN a user on a GSA-managed corporate device navigates to the SWA URL, THE SWA SHALL authenticate the user without displaying a credential prompt (seamless SSO).
5. WHEN a user on a personal (non-GSA) device navigates to the SWA URL, THE SWA SHALL redirect the user to the Entra ID login page where the user authenticates with their organisation account credentials.

### Requirement 4: Admin Role via Entra Group Membership

**User Story:** As an IT administrator, I want the "Admin" application role to be controlled by Entra group membership, so that I can manage administrative access centrally without modifying application configuration.

#### Acceptance Criteria

1. THE SWA_Config SHALL include a `rolesSource` configuration pointing to an Azure Function that returns role assignments based on Entra group membership.
2. THE Deployment_Documentation SHALL describe how to create an Entra security group (e.g., "Go-URL-Alias-Admins") and assign users to the group.
3. THE Deployment_Documentation SHALL describe how to configure the Entra App Registration to emit group claims (`groupMembershipClaims` set to `SecurityGroup`) in the ID token.
4. WHEN a user who is a member of the designated admin Entra group authenticates, THE SWA SHALL include the "Admin" role in the user's `userRoles` array in the `x-ms-client-principal` header.
5. WHEN a user who is not a member of the designated admin Entra group authenticates, THE SWA SHALL include only the default roles ("anonymous", "authenticated") in the user's `userRoles` array.
6. THE Deployment_Documentation SHALL include the implementation of the custom role assignment function that maps Entra group object IDs to SWA application roles.

### Requirement 5: Corporate Environment Variables and Application Settings

**User Story:** As a DevOps engineer, I want all required environment variables and application settings documented and configured, so that the deployment is complete and functional on first deploy.

#### Acceptance Criteria

1. THE SWA resource SHALL have the following application settings configured: `AUTH_MODE` set to `corporate`, `CORPORATE_LOCK` set to `true`, `COSMOS_CONNECTION_STRING` with the Cosmos DB connection string, `AAD_CLIENT_ID` with the Entra app client ID, and `AAD_CLIENT_SECRET` with the Entra app client secret.
2. THE Deployment_Documentation SHALL list every required application setting, its purpose, and where to obtain its value.
3. THE Deployment_Documentation SHALL describe how to configure application settings in the Azure portal and via Azure CLI.
4. IF `CORPORATE_LOCK` is set to `true` and `AUTH_MODE` is not `corporate`, THEN THE API SHALL refuse to start and log a descriptive error message.
5. THE Deployment_Documentation SHALL describe how to optionally set `RESTRICT_CREATE_TO_ADMINS=true` to limit link creation to Admin-role users only.

### Requirement 6: Azure Resource Provisioning Documentation

**User Story:** As a DevOps engineer, I want step-by-step documentation for provisioning all required Azure resources, so that I can set up the infrastructure from scratch.

#### Acceptance Criteria

1. THE Deployment_Documentation SHALL include step-by-step instructions for creating an Azure Static Web App resource, including the recommended SKU (Standard, required for custom auth and role mapping).
2. THE Deployment_Documentation SHALL include step-by-step instructions for creating an Azure Cosmos DB account with the NoSQL API, a database named `go-url-alias`, and a container named `aliases` with partition key `/alias`.
3. THE Deployment_Documentation SHALL include step-by-step instructions for creating the Entra App Registration with the required redirect URIs, API permissions, and client secret.
4. THE Deployment_Documentation SHALL include step-by-step instructions for creating the Azure DevOps service connection and linking the SWA deployment token to the pipeline.
5. THE Deployment_Documentation SHALL include Azure CLI commands as an alternative to portal-based provisioning for each resource.
6. THE Deployment_Documentation SHALL specify the minimum required Azure RBAC permissions for the engineer performing the provisioning.

### Requirement 7: Pipeline Configuration and Secrets Management

**User Story:** As a DevOps engineer, I want pipeline secrets managed securely via Azure DevOps variable groups, so that sensitive values like deployment tokens and connection strings are not exposed in source control.

#### Acceptance Criteria

1. THE Pipeline SHALL reference a variable group (e.g., `go-url-alias`) for all secret values including the SWA deployment token.
2. THE Deployment_Documentation SHALL describe how to create the Azure DevOps variable group and add the required secret variables.
3. THE Deployment_Documentation SHALL describe how to link the variable group to the pipeline.
4. THE Pipeline SHALL mark all secret variables as secret type in the variable group so they are masked in pipeline logs.
5. THE Deployment_Documentation SHALL describe how to obtain the SWA deployment token from the Azure portal or via Azure CLI.

### Requirement 8: SWA Configuration for Corporate Mode

**User Story:** As a DevOps engineer, I want the SWA configuration to enforce corporate authentication on all routes, so that no unauthenticated access is possible.

#### Acceptance Criteria

1. THE SWA_Config SHALL require the `authenticated` role on all API routes except `/api/auth-config`, `/api/links` (GET), and `/api/redirect/*`.
2. THE SWA_Config SHALL require the `authenticated` role on the catch-all route (`/*`).
3. THE SWA_Config SHALL require the `authenticated` role on the manage page route (`/_/manage`).
4. THE SWA_Config SHALL configure a 401 response override that redirects to `/.auth/login/aad` with a `post_login_redirect_uri` parameter preserving the original URL.
5. THE Pipeline SHALL regenerate `staticwebapp.config.json` using the `generate-swa-config.ts` script with `AUTH_MODE=corporate` during each deployment to ensure the config matches the target mode.
6. THE SWA_Config SHALL specify `node:20` as the API runtime in the `platform` section.

### Requirement 9: Comprehensive Deployment Documentation

**User Story:** As a DevOps engineer, I want a single comprehensive deployment guide, so that I can follow it end-to-end to deploy the Go URL Alias Service in a corporate environment.

#### Acceptance Criteria

1. THE Deployment_Documentation SHALL be a Markdown file located at `docs/CORPORATE-DEPLOYMENT.md`.
2. THE Deployment_Documentation SHALL include sections covering: prerequisites, Azure resource provisioning, Entra App Registration and SSO configuration, GSA seamless SSO setup, Entra group-to-role mapping, Azure DevOps pipeline setup, environment variables and application settings, SWA configuration generation, verification and testing steps, and troubleshooting guidance.
3. THE Deployment_Documentation SHALL include a prerequisites section listing required tools (Azure CLI, Node.js 20, Azure DevOps access), required Azure permissions, and required Entra ID permissions.
4. THE Deployment_Documentation SHALL include a verification checklist that an engineer can follow after deployment to confirm the service is functioning correctly.
5. THE Deployment_Documentation SHALL include a troubleshooting section covering common deployment failures and their resolutions.
