# Implementation Plan: Corporate Azure Deployment

## Overview

Create the Azure DevOps CI/CD pipeline YAML and comprehensive corporate deployment documentation. No new application logic is required — the deliverables are a pipeline definition and a Markdown deployment guide that reference existing codebase components.

## Tasks

- [x] 1. Create Azure DevOps CI/CD pipeline
  - [x] 1.1 Create `azure-pipelines.yml` at the repository root
    - Define `trigger` on `main` branch only
    - Set `pool` to `ubuntu-latest`
    - Reference `go-url-alias` variable group for `DEPLOYMENT_TOKEN` secret
    - Add step: install Node.js 20 using `NodeTool@0`
    - Add step: `npm ci` in project root for frontend dependencies
    - Add step: `npm ci` in `api/` for API dependencies
    - Add step: `npm test` in project root (frontend tests); pipeline halts on failure
    - Add step: `npm test` in `api/` (API tests); pipeline halts on failure
    - Add step: `npm run build` in project root (Vite build → `dist/`)
    - Add step: `npm run build` in `api/` (TypeScript compile)
    - Add step: `AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts` to generate SWA config
    - Add step: `AzureStaticWebApp@0` task with `app_location: /`, `api_location: api/`, `output_location: dist/`, `skip_app_build: true`, `skip_api_build: true`, and `azure_static_web_apps_api_token: $(DEPLOYMENT_TOKEN)`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 2. Checkpoint — Validate pipeline YAML
  - Ensure the pipeline YAML is syntactically valid and all steps are correctly ordered. Ask the user if questions arise.

- [x] 3. Create comprehensive deployment documentation
  - [x] 3.1 Create `docs/CORPORATE-DEPLOYMENT.md` with document header and prerequisites section
    - Add title, introduction, and table of contents
    - List required tools: Azure CLI, Node.js 20, Azure DevOps access, Git
    - List required Azure permissions: Contributor on resource group, Application Administrator in Entra ID
    - List required Entra ID permissions: ability to create App Registrations and Security Groups
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 3.2 Add Azure resource provisioning section
    - Step-by-step instructions for creating Azure Static Web App (Standard SKU) via portal and Azure CLI
    - Step-by-step instructions for creating Cosmos DB account (NoSQL API), database `go-url-alias`, container `aliases` with partition key `/alias` via portal and Azure CLI
    - Step-by-step instructions for creating Entra App Registration with redirect URI `https://<swa-hostname>/.auth/login/aad/callback`, API permissions (`openid`, `profile`, `email`), and client secret generation via portal and Azure CLI
    - Specify minimum Azure RBAC permissions for provisioning
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 3.3 Add Entra ID SSO configuration section
    - Document single-tenant app registration configuration
    - Document redirect URI setup matching SWA callback pattern
    - Document Microsoft Graph delegated permissions (`openid`, `profile`, `email`)
    - Document client secret creation and storage as `AAD_CLIENT_SECRET` SWA app setting
    - Document `openIdIssuer` URL with tenant ID, `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET` setting names in SWA config
    - Document blocking non-Entra providers (GitHub, Twitter, Google → 404)
    - Document 401 redirect to `/.auth/login/aad` with `post_login_redirect_uri`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.4 Add GSA seamless SSO setup section
    - Document enabling Entra App Registration as enterprise application with SSO
    - Document configuring GSA traffic forwarding profile to include SWA hostname
    - Document verification steps for Kerberos/PRT-based seamless SSO from domain-joined GSA-enrolled device
    - Document expected behavior: no credential prompt on GSA device, Entra login prompt on personal device
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.5 Add Entra group-to-role mapping section
    - Document creating Entra security group (e.g., "Go-URL-Alias-Admins")
    - Document configuring `groupMembershipClaims: SecurityGroup` in App Registration manifest
    - Document `rolesSource` configuration in SWA pointing to role assignment API endpoint
    - Document the custom role assignment function implementation that maps Entra group object IDs to `"Admin"` role
    - Document expected behavior: admin group members get `Admin` role, others get only `anonymous`/`authenticated`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.6 Add Azure DevOps pipeline setup section
    - Document creating `go-url-alias` variable group in Azure DevOps
    - Document adding `DEPLOYMENT_TOKEN` as a secret variable
    - Document linking variable group to the pipeline
    - Document obtaining SWA deployment token from Azure portal and via Azure CLI
    - Document creating Azure DevOps service connection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 3.7 Add environment variables and application settings section
    - Document all required SWA application settings: `AUTH_MODE=corporate`, `CORPORATE_LOCK=true`, `COSMOS_CONNECTION_STRING`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`
    - Document each setting's purpose and where to obtain its value
    - Document how to configure settings via Azure portal and Azure CLI
    - Document `CORPORATE_LOCK=true` + `AUTH_MODE≠corporate` error behavior
    - Document optional `RESTRICT_CREATE_TO_ADMINS=true` setting
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 3.8 Add SWA configuration generation section
    - Document how `scripts/generate-swa-config.ts` works with `AUTH_MODE=corporate`
    - Document that the pipeline regenerates `staticwebapp.config.json` on each deploy
    - Document the generated config: Entra-only auth, blocked providers, authenticated routes, 401 redirect, `node:20` API runtime
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 3.9 Add verification checklist and troubleshooting section
    - Verification checklist: SWA URL redirects to Entra login, non-Entra providers return 404, `/api/auth-config` returns `corporate` mode, link CRUD works, Admin role present for group members, GSA seamless SSO works, personal device shows login prompt
    - Troubleshooting: pipeline failures (deps, tests, build, deploy token), auth failures (misconfigured app registration, missing client secret, redirect URI mismatch), CORPORATE_LOCK errors, Cosmos DB connectivity, GSA not forwarding traffic
    - _Requirements: 9.4, 9.5_

- [x] 4. Final checkpoint — Review all deliverables
  - Ensure `azure-pipelines.yml` covers all Requirement 1 acceptance criteria
  - Ensure `docs/CORPORATE-DEPLOYMENT.md` covers all sections listed in Requirement 9.2
  - Ensure all requirements (1–9) are referenced by at least one task
  - Ask the user if questions arise.

## Notes

- No property-based tests are needed — deliverables are declarative YAML and documentation, not executable logic
- Existing property tests (`swa-config.property.ts`, `auth-strategy.property.ts`) already cover the components this deployment relies on
- The `generate-swa-config.ts` script and auth strategy system are already implemented and tested; no modifications needed
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
