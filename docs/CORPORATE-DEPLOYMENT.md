# Corporate Deployment Guide — Go URL Alias Service

This guide walks through deploying the Go URL Alias Service as a private, internal corporate application on Azure. The deployment uses Azure Static Web Apps for hosting, Azure Functions for the API backend, Cosmos DB for data storage, Microsoft Entra ID for single sign-on, and Azure DevOps for CI/CD.

By the end of this guide you will have a fully functional, SSO-protected internal URL shortener accessible only to members of your organisation.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Azure Resource Provisioning](#2-azure-resource-provisioning)
3. [Entra ID SSO Configuration](#3-entra-id-sso-configuration)
4. [GSA Seamless SSO Setup](#4-gsa-seamless-sso-setup)
5. [Entra Group-to-Role Mapping](#5-entra-group-to-role-mapping)
6. [Azure DevOps Pipeline Setup](#6-azure-devops-pipeline-setup)
7. [Environment Variables and Application Settings](#7-environment-variables-and-application-settings)
8. [SWA Configuration Generation](#8-swa-configuration-generation)
9. [Verification Checklist](#9-verification-checklist)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) | Latest | Provision and manage Azure resources |
| [Node.js](https://nodejs.org/) | 20.x LTS | Build and run the application and API |
| [Git](https://git-scm.com/) | Latest | Clone the repository and push changes |
| Azure DevOps access | — | Create pipelines, variable groups, and service connections |

Verify your tool versions:

```bash
az --version
node --version   # should print v20.x.x
git --version
```

### Required Azure Permissions

| Permission | Scope | Why |
|------------|-------|-----|
| **Contributor** | Target resource group | Create and manage SWA, Cosmos DB, and related resources |
| **Application Administrator** | Microsoft Entra ID | Create and configure App Registrations and Enterprise Applications |

### Required Entra ID Permissions

- Ability to **create App Registrations** in your organisation's Entra ID tenant.
- Ability to **create Security Groups** (or have an administrator create them on your behalf) for role-based access control.

> **Tip:** If you do not have these permissions, contact your Entra ID Global Administrator or Privileged Role Administrator to request them before proceeding.

---

## 2. Azure Resource Provisioning

This section covers creating the three core Azure resources required for the deployment: an Azure Static Web App, a Cosmos DB account, and an Entra App Registration. Each subsection provides both Azure Portal and Azure CLI instructions.

### Minimum RBAC Permissions for Provisioning

Before you begin, ensure the account performing provisioning has the following minimum permissions:

| Permission | Scope | Required For |
|------------|-------|--------------|
| **Contributor** | Resource group | Creating SWA and Cosmos DB resources |
| **Application Administrator** | Entra ID tenant | Creating App Registrations and configuring API permissions |
| **User Access Administrator** (optional) | Resource group | Assigning RBAC roles to other team members after provisioning |

> **Tip:** If your organisation uses Privileged Identity Management (PIM), activate the required roles before starting.

### 2.1 Create Azure Static Web App (Standard SKU)

The Standard SKU is required for custom authentication configuration and the `rolesSource` feature used for Entra group-to-role mapping.

#### Azure Portal

1. Navigate to the [Azure portal](https://portal.azure.com) and sign in.
2. Click **Create a resource** → search for **Static Web App** → click **Create**.
3. Fill in the basics:
   - **Subscription:** Select your subscription.
   - **Resource group:** Select an existing group or create a new one (e.g., `rg-go-url-alias`).
   - **Name:** Enter a name (e.g., `swa-go-url-alias`). This determines the default hostname `<name>.azurestaticapps.net`.
   - **Plan type:** Select **Standard**.
   - **Region:** Choose the region closest to your users.
4. Under **Deployment details**, select **Other** (you will configure Azure DevOps deployment separately).
5. Click **Review + create** → **Create**.
6. Once created, navigate to the resource and note the **URL** (e.g., `https://swa-go-url-alias.azurestaticapps.net`). You will need this for the Entra redirect URI.
7. Go to **Settings → Manage deployment token** and copy the token. You will need this for the Azure DevOps pipeline variable group.

#### Azure CLI

```bash
# Set variables
RESOURCE_GROUP="rg-go-url-alias"
SWA_NAME="swa-go-url-alias"
LOCATION="eastus2"

# Create resource group (skip if it already exists)
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

# Create Static Web App (Standard SKU)
az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard

# Retrieve the default hostname
az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostname" \
  --output tsv

# Retrieve the deployment token
az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" \
  --output tsv
```

Save the hostname and deployment token — you will need both in later steps.

### 2.2 Create Cosmos DB Account, Database, and Container

The application uses Azure Cosmos DB with the NoSQL API to store alias records.

#### Azure Portal

1. In the Azure portal, click **Create a resource** → search for **Azure Cosmos DB** → click **Create**.
2. Select **Azure Cosmos DB for NoSQL** → click **Create**.
3. Fill in the basics:
   - **Subscription:** Select your subscription.
   - **Resource group:** Select the same resource group (e.g., `rg-go-url-alias`).
   - **Account Name:** Enter a globally unique name (e.g., `cosmos-go-url-alias`).
   - **Location:** Choose the same region as your SWA.
   - **Capacity mode:** Select **Serverless** (recommended for low-to-moderate traffic) or **Provisioned throughput** depending on your usage.
4. Click **Review + create** → **Create**.
5. Once the account is created, navigate to it and open **Data Explorer**.
6. Click **New Database**:
   - **Database id:** `go-url-alias`
   - Click **OK**.
7. Expand the `go-url-alias` database, then click **New Container**:
   - **Container id:** `aliases`
   - **Partition key:** `/alias`
   - Click **OK**.
8. Go to **Settings → Keys** and copy the **PRIMARY CONNECTION STRING**. You will need this for the `COSMOS_CONNECTION_STRING` application setting.

#### Azure CLI

```bash
# Set variables
RESOURCE_GROUP="rg-go-url-alias"
COSMOS_ACCOUNT="cosmos-go-url-alias"
LOCATION="eastus2"
DATABASE_NAME="go-url-alias"
CONTAINER_NAME="aliases"
PARTITION_KEY="/alias"

# Create Cosmos DB account (NoSQL API, serverless)
az cosmosdb create \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --locations regionName="$LOCATION" \
  --capabilities EnableServerless \
  --kind GlobalDocumentDB

# Create the database
az cosmosdb sql database create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DATABASE_NAME"

# Create the container with partition key /alias
az cosmosdb sql container create \
  --account-name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --database-name "$DATABASE_NAME" \
  --name "$CONTAINER_NAME" \
  --partition-key-path "$PARTITION_KEY"

# Retrieve the primary connection string
az cosmosdb keys list \
  --name "$COSMOS_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv
```

Save the connection string — you will need it for the `COSMOS_CONNECTION_STRING` application setting.

### 2.3 Create Entra App Registration

The App Registration enables OpenID Connect authentication between the SWA and Microsoft Entra ID.

#### Azure Portal

1. In the Azure portal, navigate to **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Fill in the registration form:
   - **Name:** `Go URL Alias Service` (or your preferred display name).
   - **Supported account types:** Select **Accounts in this organizational directory only** (single tenant).
   - **Redirect URI:**
     - Platform: **Web**
     - URI: `https://<swa-hostname>/.auth/login/aad/callback`
       (replace `<swa-hostname>` with the hostname from step 2.1, e.g., `https://swa-go-url-alias.azurestaticapps.net/.auth/login/aad/callback`)
3. Click **Register**.
4. On the app overview page, note the **Application (client) ID** and **Directory (tenant) ID**. You will need both later.

##### Configure API Permissions

5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**.
6. Search for and select the following permissions:
   - `openid`
   - `profile`
   - `email`
7. Click **Add permissions**.
8. If your organisation requires it, click **Grant admin consent for \<your tenant\>**.

##### Generate Client Secret

9. Go to **Certificates & secrets** → **Client secrets** → **New client secret**.
10. Enter a description (e.g., `SWA Auth Secret`) and select an expiry period.
11. Click **Add**.
12. **Immediately copy the secret value** — it will not be shown again. This value will be stored as the `AAD_CLIENT_SECRET` application setting.

#### Azure CLI

```bash
# Set variables
SWA_HOSTNAME="swa-go-url-alias.azurestaticapps.net"  # replace with your actual hostname
APP_NAME="Go URL Alias Service"

# Create the App Registration (single tenant)
APP_ID=$(az ad app create \
  --display-name "$APP_NAME" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "https://$SWA_HOSTNAME/.auth/login/aad/callback" \
  --query appId \
  --output tsv)

echo "Application (client) ID: $APP_ID"

# Get the tenant ID
TENANT_ID=$(az account show --query tenantId --output tsv)
echo "Tenant ID: $TENANT_ID"

# Add Microsoft Graph delegated permissions (openid, profile, email)
# Microsoft Graph resource ID: 00000003-0000-0000-c000-000000000000
# Permission IDs:
#   openid  = 37f7f235-527c-4136-accd-4a02d197296e
#   profile = 14dad69e-099b-42c9-810b-d002981feec1
#   email   = 64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0

GRAPH_RESOURCE_ID="00000003-0000-0000-c000-000000000000"

az ad app permission add \
  --id "$APP_ID" \
  --api "$GRAPH_RESOURCE_ID" \
  --api-permissions \
    37f7f235-527c-4136-accd-4a02d197296e=Scope \
    14dad69e-099b-42c9-810b-d002981feec1=Scope \
    64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0=Scope

# Grant admin consent (requires sufficient Entra ID permissions)
az ad app permission admin-consent --id "$APP_ID"

# Generate a client secret (valid for 2 years)
CLIENT_SECRET=$(az ad app credential reset \
  --id "$APP_ID" \
  --append \
  --display-name "SWA Auth Secret" \
  --years 2 \
  --query password \
  --output tsv)

echo "Client Secret: $CLIENT_SECRET"
echo "⚠️  Save this secret now — it cannot be retrieved later."
```

Save the **Application (client) ID**, **Tenant ID**, and **Client Secret**. You will configure these as SWA application settings in [Section 7](#7-environment-variables-and-application-settings).

---

> **Next:** Continue to [Section 3 — Entra ID SSO Configuration](#3-entra-id-sso-configuration) to configure single sign-on for the application.

## 3. Entra ID SSO Configuration

This section covers configuring the Entra App Registration and the SWA authentication settings so that the application uses Microsoft Entra ID as the sole identity provider. By the end of this section, unauthenticated users will be redirected to the Entra login page, non-Entra providers will be blocked, and authenticated sessions will be established via OpenID Connect.

> **Prerequisite:** You must have completed [Section 2.3 — Create Entra App Registration](#23-create-entra-app-registration) before proceeding. You will need the **Application (client) ID**, **Directory (tenant) ID**, and **Client Secret** from that step.

### 3.1 Single-Tenant App Registration

The App Registration must be configured as a **single-tenant** application so that only users within your organisation's Entra ID directory can authenticate.

During registration (Section 2.3), you selected **"Accounts in this organizational directory only"**. Verify this is still the case:

#### Azure Portal

1. Navigate to **Microsoft Entra ID** → **App registrations** → select your app (e.g., `Go URL Alias Service`).
2. On the **Overview** page, confirm that **Supported account types** shows **"My organization only"** (single tenant).
3. If it shows a different value, click **Authentication** in the left menu → under **Supported account types**, select **Accounts in this organizational directory only** → click **Save**.

#### Azure CLI

```bash
# Verify the sign-in audience
az ad app show \
  --id "$APP_ID" \
  --query "signInAudience" \
  --output tsv
# Expected output: AzureADMyOrg
```

### 3.2 Redirect URI Setup

The redirect URI must match the SWA authentication callback pattern exactly. SWA uses the path `/.auth/login/aad/callback` for the Entra ID OpenID Connect callback.

**Required redirect URI format:**

```
https://<swa-hostname>/.auth/login/aad/callback
```

For example, if your SWA hostname is `swa-go-url-alias.azurestaticapps.net`:

```
https://swa-go-url-alias.azurestaticapps.net/.auth/login/aad/callback
```

#### Azure Portal

1. Navigate to your App Registration → **Authentication**.
2. Under **Platform configurations → Web**, verify the redirect URI is listed.
3. If missing, click **Add URI**, enter the full callback URL, and click **Save**.

#### Azure CLI

```bash
# Verify current redirect URIs
az ad app show \
  --id "$APP_ID" \
  --query "web.redirectUris" \
  --output tsv

# Add or update the redirect URI if needed
SWA_HOSTNAME="swa-go-url-alias.azurestaticapps.net"  # replace with your hostname

az ad app update \
  --id "$APP_ID" \
  --web-redirect-uris "https://$SWA_HOSTNAME/.auth/login/aad/callback"
```

> **Important:** The redirect URI must use `https://` and must match the SWA default hostname exactly. If you configure a custom domain later, add a second redirect URI for the custom domain.

### 3.3 Microsoft Graph Delegated Permissions

The application requires three Microsoft Graph **delegated** permissions to obtain user identity information during the OpenID Connect flow:

| Permission | Purpose |
|------------|---------|
| `openid` | Required for OpenID Connect authentication; provides the `sub` claim |
| `profile` | Provides the user's display name and other profile information |
| `email` | Provides the user's email address |

These should already be configured from Section 2.3. To verify:

#### Azure Portal

1. Navigate to your App Registration → **API permissions**.
2. Confirm the following permissions are listed under **Microsoft Graph (Delegated)**:
   - `openid`
   - `profile`
   - `email`
3. Confirm the **Status** column shows a green checkmark (admin consent granted). If not, click **Grant admin consent for \<your tenant\>**.

#### Azure CLI

```bash
# List current API permissions
az ad app permission list \
  --id "$APP_ID" \
  --output table

# If permissions are missing, add them (see Section 2.3 for permission IDs)
# Then grant admin consent
az ad app permission admin-consent --id "$APP_ID"
```

### 3.4 Client Secret and `AAD_CLIENT_SECRET` App Setting

The client secret generated in Section 2.3 must be stored as an application setting on the SWA resource so that the SWA authentication middleware can use it to complete the OpenID Connect token exchange.

#### Store the Client Secret as a SWA Application Setting

##### Azure Portal

1. Navigate to your Static Web App resource in the Azure portal.
2. Go to **Settings → Configuration**.
3. Click **Add** and create the following application setting:
   - **Name:** `AAD_CLIENT_SECRET`
   - **Value:** Paste the client secret value you copied in Section 2.3.
4. Click **OK** → **Save**.

##### Azure CLI

```bash
SWA_NAME="swa-go-url-alias"
RESOURCE_GROUP="rg-go-url-alias"

az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names "AAD_CLIENT_SECRET=<your-client-secret>"
```

> **Security note:** The client secret is sensitive. Never commit it to source control. In the SWA application settings, it is stored encrypted at rest and injected into the runtime environment securely.

#### Client Secret Rotation

Client secrets have an expiry date. Set a calendar reminder to rotate the secret before it expires:

1. Generate a new client secret in the App Registration (Certificates & secrets).
2. Update the `AAD_CLIENT_SECRET` application setting in the SWA resource with the new value.
3. Delete the old secret from the App Registration once the new one is confirmed working.

### 3.5 SWA Authentication Configuration (`staticwebapp.config.json`)

The SWA configuration file ties together the Entra App Registration with the SWA authentication middleware. In corporate mode, the `generate-swa-config.ts` script produces the following `auth` block in `staticwebapp.config.json`:

```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  }
}
```

| Field | Value | Description |
|-------|-------|-------------|
| `openIdIssuer` | `https://login.microsoftonline.com/{TENANT_ID}/v2.0` | The OpenID Connect issuer URL. Replace `{TENANT_ID}` with your Entra directory (tenant) ID. |
| `clientIdSettingName` | `AAD_CLIENT_ID` | The name of the SWA application setting that holds the Entra App Registration client ID. |
| `clientSecretSettingName` | `AAD_CLIENT_SECRET` | The name of the SWA application setting that holds the Entra App Registration client secret. |

#### Configure the Required SWA Application Settings

Both `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET` must be set as application settings on the SWA resource. The SWA runtime reads these setting names from the config and resolves them to the actual values at runtime.

##### Azure Portal

1. Navigate to your Static Web App → **Settings → Configuration**.
2. Add the following application settings (if not already present):

| Setting Name | Value |
|-------------|-------|
| `AAD_CLIENT_ID` | The Application (client) ID from your Entra App Registration |
| `AAD_CLIENT_SECRET` | The client secret value from Section 2.3 |

3. Click **Save**.

##### Azure CLI

```bash
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names \
    "AAD_CLIENT_ID=<your-client-id>" \
    "AAD_CLIENT_SECRET=<your-client-secret>"
```

> **Note:** The `{TENANT_ID}` placeholder in the `openIdIssuer` URL is replaced with your actual tenant ID when you run the SWA config generator. If you are generating the config manually, replace it with your Directory (tenant) ID from the Entra App Registration overview page.

### 3.6 Blocking Non-Entra Identity Providers

In corporate mode, only Entra ID (`aad`) is permitted as an identity provider. The SWA config blocks all other built-in providers by returning HTTP 404 for their login routes:

```json
{
  "routes": [
    { "route": "/.auth/login/github", "statusCode": 404 },
    { "route": "/.auth/login/twitter", "statusCode": 404 },
    { "route": "/.auth/login/google", "statusCode": 404 }
  ]
}
```

This ensures that:
- Navigating to `/.auth/login/github` returns **404 Not Found** instead of a GitHub login page.
- Navigating to `/.auth/login/twitter` returns **404 Not Found** instead of a Twitter login page.
- Navigating to `/.auth/login/google` returns **404 Not Found** instead of a Google login page.
- The only functional login route is `/.auth/login/aad`, which redirects to your organisation's Entra ID login page.

These routes are generated automatically by the `generate-swa-config.ts` script when `AUTH_MODE=corporate`. No manual configuration is needed — the pipeline handles this during deployment.

### 3.7 Unauthenticated User Redirect (401 → Entra Login)

When an unauthenticated user attempts to access any protected route, the SWA returns a 401 response. The SWA config includes a `responseOverrides` section that intercepts this 401 and redirects the user to the Entra ID login page:

```json
{
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer",
      "statusCode": 302
    }
  }
}
```

| Field | Value | Description |
|-------|-------|-------------|
| `redirect` | `/.auth/login/aad?post_login_redirect_uri=.referrer` | Redirects to the Entra login page. The `post_login_redirect_uri=.referrer` parameter tells SWA to redirect the user back to the page they originally requested after successful authentication. |
| `statusCode` | `302` | HTTP 302 Found — a temporary redirect to the login page. |

**How the flow works:**

1. A user navigates to `https://<swa-hostname>/_/manage` (or any protected route).
2. SWA checks for the `authenticated` role in the user's session.
3. If the user is not authenticated, SWA returns a 401.
4. The `responseOverrides` rule intercepts the 401 and issues a 302 redirect to `/.auth/login/aad?post_login_redirect_uri=/_/manage`.
5. The user authenticates with Entra ID.
6. After successful authentication, SWA redirects the user back to `/_/manage`.

This configuration is generated automatically by the `generate-swa-config.ts` script in corporate mode. All routes requiring the `authenticated` role (including `/*`, `/api/*`, and `/_/manage`) trigger this redirect flow for unauthenticated users.

### 3.8 Verification

After completing the SSO configuration, verify the following:

| Check | Expected Result |
|-------|-----------------|
| Navigate to `https://<swa-hostname>/` | Redirects to Entra ID login page (or auto-authenticates via GSA) |
| Navigate to `/.auth/login/github` | Returns 404 Not Found |
| Navigate to `/.auth/login/twitter` | Returns 404 Not Found |
| Navigate to `/.auth/login/google` | Returns 404 Not Found |
| Navigate to `/.auth/login/aad` | Redirects to Entra ID login page |
| Authenticate and check redirect | Returns to the originally requested page after login |
| Check `/.auth/me` after login | Returns JSON with `clientPrincipal` containing `identityProvider: "aad"` |

---

> **Next:** Continue to [Section 4 — GSA Seamless SSO Setup](#4-gsa-seamless-sso-setup) to configure seamless single sign-on for corporate-managed devices.

## 4. GSA Seamless SSO Setup

Global Secure Access (GSA) is Microsoft's Security Service Edge solution that enables seamless single sign-on for users on corporate-managed devices. When configured correctly, users on GSA-enrolled, domain-joined devices are authenticated automatically — no credential prompt is displayed. Users on personal (non-GSA) devices are redirected to the standard Entra ID login page.

> **Prerequisite:** You must have completed [Section 3 — Entra ID SSO Configuration](#3-entra-id-sso-configuration) before proceeding. The Entra App Registration must be fully configured with SSO settings, redirect URIs, and API permissions.

### 4.1 Enable the Entra App Registration as an Enterprise Application with SSO

By default, an Entra App Registration does not have an associated Enterprise Application (service principal) with SSO enabled. You need to ensure the service principal exists and that SSO is configured.

#### Azure Portal

1. Navigate to **Microsoft Entra ID** → **Enterprise applications**.
2. Search for your app by name (e.g., `Go URL Alias Service`). If it appears in the list, the service principal already exists — skip to step 4.
3. If the app does not appear, navigate to **App registrations** → select your app → on the **Overview** page, click the link under **Managed application in local directory** to create the service principal. Alternatively, navigate to **Enterprise applications** → **New application** → **Create your own application** → select **"Register an application to integrate with Microsoft Entra ID"** and link it to your existing App Registration.
4. Select the Enterprise Application from the list.
5. Go to **Single sign-on** in the left menu.
6. Select **SAML** or **OpenID Connect** as the SSO method (for SWA, OpenID Connect is used — this is already configured via the App Registration). Confirm that SSO is shown as enabled.
7. Go to **Properties** and ensure:
   - **Enabled for users to sign-in?** is set to **Yes**.
   - **User assignment required?** is set to **No** (so all users in the tenant can access the app) or **Yes** (if you want to restrict access to specific users/groups).

#### Azure CLI

```bash
# Create the service principal (Enterprise Application) if it doesn't exist
az ad sp create --id "$APP_ID"

# Verify the service principal exists
az ad sp show --id "$APP_ID" --query "displayName" --output tsv

# Enable the service principal for user sign-in
az ad sp update \
  --id "$APP_ID" \
  --set accountEnabled=true

# Optional: Disable user assignment requirement (allow all tenant users)
az ad sp update \
  --id "$APP_ID" \
  --set appRoleAssignmentRequired=false
```

> **Note:** The service principal is the identity object that GSA and Entra ID use to manage SSO sessions. Without it, seamless SSO tokens cannot be issued for your application.

### 4.2 Configure the GSA Traffic Forwarding Profile

For seamless SSO to work, the GSA traffic forwarding profile must be configured to route traffic destined for your SWA hostname through the Global Secure Access service. This allows GSA to inject authentication tokens (PRT or Kerberos tickets) transparently into requests.

#### Azure Portal (Microsoft Entra Admin Center)

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com).
2. Navigate to **Global Secure Access** → **Connect** → **Traffic forwarding**.
3. Enable the **Microsoft traffic** profile (if not already enabled). This profile covers Microsoft Entra ID and Microsoft 365 traffic, which includes the Entra authentication endpoints used by your SWA.
4. If your SWA hostname is not automatically covered by the Microsoft traffic profile, add a custom traffic forwarding rule:
   - Navigate to **Global Secure Access** → **Connect** → **Traffic forwarding** → **Private access profile** (or create a custom profile).
   - Click **Add** or **Edit** the profile.
   - Add a **Fully Qualified Domain Name (FQDN)** rule:
     - **FQDN:** `<swa-hostname>` (e.g., `swa-go-url-alias.azurestaticapps.net`)
     - **Protocol:** HTTPS
     - **Port:** 443
   - Save the profile.
5. Ensure the traffic forwarding profile is **assigned** to the devices or device groups that should receive seamless SSO.

#### Verification of Traffic Forwarding

To confirm that GSA is forwarding traffic for your SWA hostname:

1. On a GSA-enrolled device, open a command prompt and run:
   ```cmd
   netsh trace show global
   ```
   or check the Global Secure Access client status in the system tray.
2. In the Entra admin center, navigate to **Global Secure Access** → **Monitor** → **Traffic logs**.
3. Filter by your SWA hostname and verify that traffic entries appear, confirming that requests are being routed through GSA.

> **Important:** The GSA client must be installed and running on the corporate device. The client intercepts DNS and network traffic for configured FQDNs and routes it through the Global Secure Access cloud service, enabling token injection for seamless SSO.

### 4.3 Verify Kerberos/PRT-Based Seamless SSO

Once the Enterprise Application and GSA traffic forwarding are configured, verify that seamless SSO is functioning correctly from a domain-joined, GSA-enrolled device.

#### What is PRT-Based Seamless SSO?

A **Primary Refresh Token (PRT)** is a key artifact of Microsoft Entra authentication on Windows 10/11 devices that are either Entra ID joined, hybrid Entra ID joined, or Entra ID registered. The PRT enables single sign-on across browser and native applications. When GSA routes traffic through its service, it can present the PRT to Entra ID on behalf of the user, completing authentication without any user interaction.

**Kerberos-based SSO** applies in hybrid environments where on-premises Active Directory is federated with Entra ID. The device's Kerberos ticket is exchanged for an Entra token transparently.

#### Verification Steps

Perform the following tests from a **domain-joined, GSA-enrolled corporate device**:

1. **Clear existing browser sessions** to ensure a clean test:
   - Close all browser windows.
   - Clear cookies for `login.microsoftonline.com` and your SWA hostname.
   - Alternatively, open an InPrivate/Incognito window (the PRT is still available to the browser via the Windows Web Account Manager).

2. **Navigate to the SWA URL:**
   ```
   https://<swa-hostname>/
   ```

3. **Observe the authentication flow:**
   - The SWA should trigger a redirect to `/.auth/login/aad`.
   - Entra ID should detect the PRT (or Kerberos ticket) from the GSA-enrolled device.
   - The user should be authenticated **automatically** — no username or password prompt should appear.
   - The browser should redirect back to the originally requested page with an active session.

4. **Verify the authenticated session:**
   - Navigate to `https://<swa-hostname>/.auth/me`.
   - Confirm the response contains a `clientPrincipal` object with:
     - `identityProvider: "aad"`
     - `userDetails` matching the signed-in user's email or UPN.

5. **Check the PRT status on the device** (optional, for troubleshooting):
   ```cmd
   dsregcmd /status
   ```
   Look for the following in the output:
   - **AzureAdJoined:** YES (or **DomainJoined:** YES for hybrid)
   - **SSO State** section showing `AzureAdPrt: YES` — confirms a PRT is present.
   - `AzureAdPrtUpdateTime` — shows when the PRT was last refreshed.

6. **Check GSA client connectivity:**
   - In the system tray, click the **Global Secure Access** client icon.
   - Verify the status shows **Connected**.
   - If disconnected, right-click and select **Connect** or check network connectivity.

#### Expected Results

| Scenario | Expected Behavior |
|----------|-------------------|
| Domain-joined, GSA-enrolled device | User is authenticated automatically — no credential prompt. The browser briefly redirects through the Entra login endpoint and returns to the app with an active session. |
| Entra ID joined device with PRT | Same as above — PRT is used for seamless authentication. |
| Hybrid Entra ID joined device | Kerberos ticket or PRT is used depending on the environment configuration. No credential prompt. |

### 4.4 Expected Behavior: GSA Device vs. Personal Device

The following table summarises the expected authentication experience depending on the device type:

| Device Type | GSA Enrolled? | Authentication Experience |
|-------------|---------------|---------------------------|
| Corporate device (domain-joined or Entra joined) | Yes | **Seamless SSO** — no credential prompt. The user navigates to the SWA URL and is authenticated automatically via PRT/Kerberos through GSA. |
| Corporate device (domain-joined or Entra joined) | No (GSA client not installed/running) | User is redirected to the Entra ID login page. Depending on device configuration, the PRT may still enable SSO through the browser's Web Account Manager, but this is not guaranteed without GSA. |
| Personal device | N/A | User is redirected to the **Entra ID login page** where they must enter their organisation account credentials (username and password). Multi-factor authentication (MFA) may be required depending on Conditional Access policies. |
| Mobile device (iOS/Android) with Company Portal | Depends on MDM config | If the device is enrolled in Intune and GSA is configured for mobile, seamless SSO may apply. Otherwise, the user sees the Entra login prompt. |

#### Testing from a Personal Device

To verify the personal device experience:

1. Open a browser on a personal (non-corporate) device.
2. Navigate to `https://<swa-hostname>/`.
3. The SWA should redirect to the Entra ID login page (`login.microsoftonline.com`).
4. Enter your organisation account credentials.
5. Complete MFA if prompted (depending on your Conditional Access policies).
6. After successful authentication, you should be redirected back to the application.

### 4.5 Troubleshooting GSA Seamless SSO

| Symptom | Possible Cause | Resolution |
|---------|---------------|------------|
| Credential prompt appears on a GSA-enrolled device | GSA traffic forwarding profile does not include the SWA hostname | Add the SWA FQDN to the traffic forwarding profile (see Section 4.2) |
| Credential prompt appears on a GSA-enrolled device | GSA client is not running or is disconnected | Check the GSA client status in the system tray; reconnect if needed |
| Credential prompt appears on a GSA-enrolled device | Device does not have a valid PRT | Run `dsregcmd /status` and check `AzureAdPrt: YES`. If NO, re-join the device or sign out and back in to refresh the PRT |
| Credential prompt appears on a GSA-enrolled device | Enterprise Application is not enabled for sign-in | Verify **Enabled for users to sign-in?** is **Yes** in the Enterprise Application properties (Section 4.1) |
| Authentication loop (repeated redirects) | Redirect URI mismatch between App Registration and SWA hostname | Verify the redirect URI in the App Registration matches `https://<swa-hostname>/.auth/login/aad/callback` exactly |
| `dsregcmd /status` shows `AzureAdPrt: NO` | Device is not Entra ID joined or hybrid joined | Join the device to Entra ID or on-premises AD (with hybrid join configured) |
| GSA client shows "Disconnected" | Network connectivity issue or GSA service outage | Check internet connectivity; verify the GSA service is operational in the Entra admin center |
| Personal device user cannot authenticate | User account is not in the Entra tenant | Ensure the user has an account in the organisation's Entra ID directory |

---

> **Next:** Continue to [Section 5 — Entra Group-to-Role Mapping](#5-entra-group-to-role-mapping) to configure admin role assignment based on Entra group membership.

## 5. Entra Group-to-Role Mapping

This section covers configuring Entra security groups to control the `Admin` application role in the Go URL Alias Service. By the end of this section, members of a designated Entra security group will automatically receive the `Admin` role when they authenticate, while all other users will have only the default `anonymous` and `authenticated` roles.

> **Prerequisite:** You must have completed [Section 3 — Entra ID SSO Configuration](#3-entra-id-sso-configuration) and have a working Entra App Registration with SSO. You also need the SWA resource deployed on the **Standard SKU** (required for the `rolesSource` feature).

### 5.1 Create an Entra Security Group

Create a security group in Entra ID that will represent the admin users of the Go URL Alias Service. Any user added to this group will receive the `Admin` role.

#### Azure Portal

1. Navigate to **Microsoft Entra ID** → **Groups** → **New group**.
2. Fill in the group details:
   - **Group type:** Security
   - **Group name:** `Go-URL-Alias-Admins` (or your preferred name)
   - **Group description:** `Members of this group receive the Admin role in the Go URL Alias Service`
   - **Membership type:** Assigned (or Dynamic if you want automatic membership based on user attributes)
3. Click **Create**.
4. Open the newly created group and note the **Object ID** — you will need this when configuring the role assignment function.
5. Add users to the group:
   - Go to **Members** → **Add members**.
   - Search for and select the users who should have admin access.
   - Click **Select**.

#### Azure CLI

```bash
# Create the security group
GROUP_ID=$(az ad group create \
  --display-name "Go-URL-Alias-Admins" \
  --mail-nickname "go-url-alias-admins" \
  --description "Members of this group receive the Admin role in the Go URL Alias Service" \
  --query id \
  --output tsv)

echo "Group Object ID: $GROUP_ID"

# Add a user to the group (replace with the user's Object ID or UPN)
az ad group member add \
  --group "$GROUP_ID" \
  --member-id "<user-object-id>"

# Verify group membership
az ad group member list \
  --group "$GROUP_ID" \
  --query "[].{Name:displayName, UPN:userPrincipalName}" \
  --output table
```

> **Important:** Save the **Group Object ID** — you will configure it as an environment variable (`ADMIN_GROUP_ID`) in the role assignment function.

### 5.2 Configure `groupMembershipClaims` in the App Registration Manifest

For the role assignment function to know which groups a user belongs to, the Entra App Registration must be configured to include group membership claims in the ID token.

#### Azure Portal

1. Navigate to **Microsoft Entra ID** → **App registrations** → select your app (e.g., `Go URL Alias Service`).
2. Click **Manifest** in the left menu.
3. Find the `groupMembershipClaims` property and change its value from `null` to `"SecurityGroup"`:
   ```json
   "groupMembershipClaims": "SecurityGroup"
   ```
4. Click **Save**.

This tells Entra ID to include the object IDs of all security groups the user belongs to in the `groups` claim of the ID token.

#### Azure CLI

```bash
# Update the App Registration manifest to emit security group claims
az ad app update \
  --id "$APP_ID" \
  --set groupMembershipClaims=SecurityGroup

# Verify the change
az ad app show \
  --id "$APP_ID" \
  --query "groupMembershipClaims" \
  --output tsv
# Expected output: SecurityGroup
```

> **Note:** If a user belongs to more than 200 groups, Entra ID will not include the groups in the token and will instead provide a link to the Microsoft Graph API to retrieve them. For most organisations, the direct token claim approach is sufficient. If your users are members of a very large number of groups, you may need to implement a Graph API call in the role assignment function as a fallback.

### 5.3 Configure `rolesSource` in the SWA Configuration

Azure Static Web Apps (Standard SKU) supports a `rolesSource` configuration that points to an API endpoint responsible for returning custom role assignments. When a user authenticates, SWA calls this endpoint and merges the returned roles into the user's session.

Add the `rolesSource` property to the `auth` section of `staticwebapp.config.json`:

```json
{
  "auth": {
    "rolesSource": "/api/roles",
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  }
}
```

| Field | Value | Description |
|-------|-------|-------------|
| `rolesSource` | `/api/roles` | The API endpoint that SWA calls after authentication to retrieve custom roles for the user. This must be a route handled by your Azure Functions backend. |

> **Note:** If you are using the `generate-swa-config.ts` script, you will need to update it to include the `rolesSource` property when `AUTH_MODE=corporate`. Alternatively, you can add it manually to the generated `staticwebapp.config.json` after generation.

### 5.4 Implement the Custom Role Assignment Function

The role assignment function is an Azure Function that SWA calls after a user authenticates. It receives the user's client principal, checks group membership, and returns the appropriate roles.

#### How It Works

1. SWA sends a POST request to the `/api/roles` endpoint with the `x-ms-client-principal` header.
2. The function decodes the Base64-encoded client principal to extract the user's claims, including group membership.
3. The function checks whether any of the user's group claims match the configured admin group object ID.
4. If the user is a member of the admin group, the function returns `{ "roles": ["Admin"] }`.
5. If the user is not a member, the function returns `{ "roles": [] }`.

#### Implementation

Create a new Azure Function at `api/src/functions/roles.ts`:

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
  claims: { typ: string; val: string }[];
}

const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID || "";

// The claim type for group membership in Entra ID tokens
const GROUP_CLAIM_TYPE = "groups";

function extractClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

function getRolesForPrincipal(principal: ClientPrincipal): string[] {
  if (!ADMIN_GROUP_ID) return [];

  const groupClaims = principal.claims
    .filter((c) => c.typ === GROUP_CLAIM_TYPE)
    .map((c) => c.val);

  if (groupClaims.includes(ADMIN_GROUP_ID)) {
    return ["Admin"];
  }

  return [];
}

async function rolesHandler(
  req: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const principal = extractClientPrincipal(req);

  if (!principal) {
    return {
      status: 200,
      jsonBody: { roles: [] },
    };
  }

  const roles = getRolesForPrincipal(principal);

  return {
    status: 200,
    jsonBody: { roles },
  };
}

app.http("roles", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "roles",
  handler: rolesHandler,
});
```

#### Key Implementation Details

| Aspect | Detail |
|--------|--------|
| **Endpoint** | `POST /api/roles` — SWA calls this endpoint automatically after authentication when `rolesSource` is configured |
| **Input** | The `x-ms-client-principal` header, Base64-encoded JSON containing the user's identity and claims |
| **Group claim** | The `claims` array contains entries with `typ: "groups"` and `val: "<group-object-id>"` for each security group the user belongs to |
| **Output** | `{ "roles": ["Admin"] }` if the user is in the admin group, or `{ "roles": [] }` otherwise |
| **Auth level** | `anonymous` — the function must be accessible without additional authentication since SWA calls it internally during the auth flow |
| **Environment variable** | `ADMIN_GROUP_ID` — the Object ID of the Entra security group created in Section 5.1 |

#### Configure the `ADMIN_GROUP_ID` Application Setting

##### Azure Portal

1. Navigate to your Static Web App → **Settings → Configuration**.
2. Click **Add** and create the following application setting:
   - **Name:** `ADMIN_GROUP_ID`
   - **Value:** The Object ID of the `Go-URL-Alias-Admins` group from Section 5.1.
3. Click **OK** → **Save**.

##### Azure CLI

```bash
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names "ADMIN_GROUP_ID=<group-object-id>"
```

### 5.5 Expected Behavior

Once the Entra security group, group claims, `rolesSource`, and role assignment function are all configured, the following behavior applies:

| User Type | Entra Group Membership | Roles in Session | Access Level |
|-----------|----------------------|------------------|--------------|
| Admin user | Member of `Go-URL-Alias-Admins` | `anonymous`, `authenticated`, `Admin` | Full access including admin features (e.g., managing all links, restricted create when `RESTRICT_CREATE_TO_ADMINS=true`) |
| Regular user | Not a member of the admin group | `anonymous`, `authenticated` | Standard access — can use the service but cannot access admin-only features |
| Unauthenticated user | N/A | `anonymous` | Redirected to Entra login for any protected route |

#### How the Role Assignment Flow Works End-to-End

```
1. User navigates to https://<swa-hostname>/
2. SWA detects the user is unauthenticated → redirects to /.auth/login/aad
3. User authenticates with Entra ID (seamlessly via GSA or via login prompt)
4. Entra ID issues an ID token containing group claims (group object IDs)
5. SWA receives the token and constructs the x-ms-client-principal
6. SWA calls POST /api/roles with the x-ms-client-principal header
7. The role assignment function:
   a. Decodes the client principal
   b. Extracts group claims from the claims array
   c. Checks if any group matches ADMIN_GROUP_ID
   d. Returns { "roles": ["Admin"] } or { "roles": [] }
8. SWA merges the returned roles into the user's session
9. The user's userRoles now include "Admin" (if applicable)
```

### 5.6 Verification

After completing the role mapping configuration, verify the following:

| Check | How | Expected Result |
|-------|-----|-----------------|
| Group exists | Entra ID → Groups → search for `Go-URL-Alias-Admins` | Group appears with correct members |
| Group claims enabled | App Registration → Manifest → `groupMembershipClaims` | Value is `"SecurityGroup"` |
| `ADMIN_GROUP_ID` set | SWA → Configuration → Application settings | Setting exists with the correct group Object ID |
| Admin user roles | Authenticate as a group member → navigate to `/.auth/me` | `userRoles` array includes `"Admin"` |
| Non-admin user roles | Authenticate as a non-member → navigate to `/.auth/me` | `userRoles` array includes only `"anonymous"` and `"authenticated"` |
| Role assignment function | `POST /api/roles` with a valid `x-ms-client-principal` header | Returns `{ "roles": ["Admin"] }` for group members |

---

> **Next:** Continue to [Section 6 — Azure DevOps Pipeline Setup](#6-azure-devops-pipeline-setup) to configure the CI/CD pipeline for automated deployments.

## 6. Azure DevOps Pipeline Setup

This section covers configuring Azure DevOps to run the CI/CD pipeline defined in `azure-pipelines.yml`. You will create a variable group to store secrets, obtain the SWA deployment token, create a service connection, and link everything to the pipeline. By the end of this section, pushes to the `main` branch will automatically build, test, and deploy the application.

> **Prerequisite:** You must have completed [Section 2.1 — Create Azure Static Web App](#21-create-azure-static-web-app-standard-sku) and have the SWA resource deployed. You also need **Project Administrator** or **Build Administrator** permissions in your Azure DevOps project.

### 6.1 Obtain the SWA Deployment Token

The deployment token authenticates the pipeline to deploy artifacts to your Azure Static Web App. You can obtain it from the Azure portal or via the Azure CLI.

#### Azure Portal

1. Navigate to the [Azure portal](https://portal.azure.com) and sign in.
2. Open your Static Web App resource (e.g., `swa-go-url-alias`).
3. In the left menu, go to **Settings → Manage deployment token**.
4. Click **Reset deployment token** if you need a fresh token, or copy the existing token.
5. Save the token securely — you will add it to the Azure DevOps variable group in the next step.

#### Azure CLI

```bash
# Set variables
SWA_NAME="swa-go-url-alias"
RESOURCE_GROUP="rg-go-url-alias"

# Retrieve the deployment token
az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" \
  --output tsv
```

Save the output — this is your `DEPLOYMENT_TOKEN` value.

> **Security note:** The deployment token grants full deployment access to your SWA resource. Treat it as a secret and never commit it to source control.

### 6.2 Create the `go-url-alias` Variable Group

The pipeline references a variable group named `go-url-alias` to access the deployment token without hardcoding secrets in the YAML file. All secret values used by the pipeline are stored here.

#### Azure DevOps Portal

1. Navigate to your Azure DevOps project.
2. Go to **Pipelines → Library**.
3. Click **+ Variable group**.
4. Configure the variable group:
   - **Variable group name:** `go-url-alias`
   - **Description:** `Secrets and configuration for the Go URL Alias Service pipeline`
5. Click **Save** (you will add variables in the next step).

#### Azure DevOps CLI

```bash
# Install the Azure DevOps CLI extension (if not already installed)
az extension add --name azure-devops

# Set the default organisation and project
az devops configure --defaults \
  organization=https://dev.azure.com/<your-org> \
  project=<your-project>

# Create the variable group
az pipelines variable-group create \
  --name "go-url-alias" \
  --description "Secrets and configuration for the Go URL Alias Service pipeline" \
  --variables placeholder=temp
```

> **Note:** The CLI requires at least one variable when creating a group. The `placeholder` variable will be replaced in the next step.

### 6.3 Add `DEPLOYMENT_TOKEN` as a Secret Variable

The `DEPLOYMENT_TOKEN` variable holds the SWA deployment token obtained in Section 6.1. It must be marked as a **secret** so that its value is masked in pipeline logs and cannot be read back from the UI.

#### Azure DevOps Portal

1. Navigate to **Pipelines → Library** → click on the `go-url-alias` variable group.
2. Click **+ Add** to add a new variable:
   - **Name:** `DEPLOYMENT_TOKEN`
   - **Value:** Paste the SWA deployment token from Section 6.1.
3. Click the **lock icon** (🔒) next to the value field to mark the variable as a **secret**. Once locked, the value is encrypted and cannot be viewed again in the UI.
4. If you created a `placeholder` variable via the CLI, delete it now.
5. Click **Save**.

#### Azure DevOps CLI

```bash
# Get the variable group ID
GROUP_ID=$(az pipelines variable-group list \
  --query "[?name=='go-url-alias'].id" \
  --output tsv)

# Add the DEPLOYMENT_TOKEN as a secret variable
az pipelines variable-group variable create \
  --group-id "$GROUP_ID" \
  --name "DEPLOYMENT_TOKEN" \
  --value "<your-deployment-token>" \
  --secret true

# Remove the placeholder variable (if created via CLI)
az pipelines variable-group variable delete \
  --group-id "$GROUP_ID" \
  --name "placeholder" \
  --yes
```

> **Important:** Secret variables are marked as secret type in the variable group so they are automatically masked in pipeline logs. If the pipeline attempts to print the value, Azure DevOps replaces it with `***`.

### 6.4 Create an Azure DevOps Service Connection

A service connection provides the pipeline with credentials to interact with Azure resources. While the `AzureStaticWebApp@0` task uses the deployment token directly (not a service connection), a service connection is useful for other Azure CLI tasks you may add to the pipeline in the future (e.g., configuring app settings, managing Cosmos DB).

#### Azure DevOps Portal

1. Navigate to your Azure DevOps project.
2. Go to **Project settings** (gear icon in the bottom-left) → **Service connections**.
3. Click **New service connection** → select **Azure Resource Manager** → click **Next**.
4. Select **Service principal (automatic)** as the authentication method → click **Next**.
5. Configure the connection:
   - **Scope level:** Subscription
   - **Subscription:** Select the Azure subscription containing your SWA and Cosmos DB resources.
   - **Resource group:** Select your resource group (e.g., `rg-go-url-alias`). Scoping to the resource group limits the service principal's access.
   - **Service connection name:** `azure-go-url-alias` (or your preferred name).
   - **Description:** `Service connection for the Go URL Alias Service Azure resources`
   - Check **Grant access permission to all pipelines** if you want all pipelines in the project to use this connection. Otherwise, you will need to authorise it per-pipeline.
6. Click **Save**.

#### Azure DevOps CLI

```bash
# Create a service connection using the Azure DevOps CLI
# Note: The automatic method requires interactive browser authentication
az devops service-endpoint azurerm create \
  --azure-rm-service-principal-id "<service-principal-app-id>" \
  --azure-rm-subscription-id "<subscription-id>" \
  --azure-rm-subscription-name "<subscription-name>" \
  --azure-rm-tenant-id "<tenant-id>" \
  --name "azure-go-url-alias" \
  --project "<your-project>"
```

> **Tip:** The automatic (service principal) method is recommended because Azure DevOps creates and manages the service principal for you. If your organisation requires a pre-created service principal, select **Service principal (manual)** and provide the client ID, client secret, and tenant ID.

### 6.5 Link the Variable Group to the Pipeline

The `azure-pipelines.yml` file already references the `go-url-alias` variable group in its `variables` section:

```yaml
variables:
  - group: go-url-alias
```

However, the variable group must also be **authorised** for use by the pipeline. This can happen automatically on the first pipeline run or be configured in advance.

#### Option A: Authorise on First Run (Recommended)

1. Trigger the pipeline by pushing a commit to the `main` branch (or run it manually).
2. The first run will pause and display a **"Permit access"** prompt because the pipeline is requesting access to the `go-url-alias` variable group.
3. Click **Permit** to authorise the pipeline to use the variable group.
4. The pipeline will resume and use the `DEPLOYMENT_TOKEN` secret from the variable group.

#### Option B: Pre-Authorise via the Library

1. Navigate to **Pipelines → Library** → click on the `go-url-alias` variable group.
2. Click the **Pipeline permissions** tab (or the **Security** tab, depending on your Azure DevOps version).
3. Click **+** (Add pipeline) and select your pipeline (e.g., `go-url-alias` or the name of your pipeline).
4. Click **Save**. The pipeline is now pre-authorised to use the variable group without a manual approval step.

#### Azure DevOps CLI

```bash
# Get the variable group ID
GROUP_ID=$(az pipelines variable-group list \
  --query "[?name=='go-url-alias'].id" \
  --output tsv)

# Authorise all pipelines to use the variable group
az pipelines variable-group update \
  --group-id "$GROUP_ID" \
  --authorize true
```

### 6.6 Create the Pipeline in Azure DevOps

The pipeline definition already exists in the repository at `azure-pipelines.yml`. You need to create a pipeline in Azure DevOps that points to this file.

#### Azure DevOps Portal

1. Navigate to your Azure DevOps project → **Pipelines** → **New pipeline**.
2. Select your repository source:
   - If your code is in **Azure Repos Git**, select it and choose the repository.
   - If your code is in **GitHub**, select GitHub and authorise the connection.
3. On the **Configure** step, select **Existing Azure Pipelines YAML file**.
4. Set the path to `/azure-pipelines.yml` and the branch to `main`.
5. Click **Continue**.
6. Review the pipeline YAML. Verify it references the `go-url-alias` variable group and the `$(DEPLOYMENT_TOKEN)` variable.
7. Click **Run** to trigger the first pipeline run, or click **Save** to save without running.

#### Azure DevOps CLI

```bash
# Create the pipeline pointing to the existing YAML file
az pipelines create \
  --name "go-url-alias" \
  --repository "<repository-name>" \
  --branch main \
  --yml-path azure-pipelines.yml \
  --repository-type tfsgit
```

> **Note:** Replace `--repository-type tfsgit` with `--repository-type github` if your repository is hosted on GitHub. You will also need to provide a GitHub service connection via `--service-connection`.

### 6.7 Verification

After completing the pipeline setup, verify the following:

| Check | How | Expected Result |
|-------|-----|-----------------|
| Variable group exists | Pipelines → Library | `go-url-alias` group is listed with `DEPLOYMENT_TOKEN` (locked) |
| Secret is masked | Trigger a pipeline run and check logs | `DEPLOYMENT_TOKEN` value appears as `***` in any log output |
| Pipeline triggers on push | Push a commit to `main` | Pipeline run starts automatically |
| Pipeline completes | Check pipeline run status | All steps pass: install → test → build → generate config → deploy |
| SWA is updated | Navigate to the SWA URL after a successful deploy | Application reflects the latest changes |
| Service connection works | Project settings → Service connections | `azure-go-url-alias` connection shows a successful status |

---

> **Next:** Continue to [Section 7 — Environment Variables and Application Settings](#7-environment-variables-and-application-settings) to configure all required SWA application settings.

## 7. Environment Variables and Application Settings

Azure Static Web Apps application settings are injected as environment variables into the Azure Functions API backend at runtime. This section documents every required and optional setting, explains where to obtain each value, and shows how to configure them via the Azure portal and Azure CLI.

> **Prerequisite:** You must have completed [Section 2 — Azure Resource Provisioning](#2-azure-resource-provisioning) and [Section 3 — Entra ID SSO Configuration](#3-entra-id-sso-configuration) before proceeding. You will need the Cosmos DB connection string, Entra App Registration client ID, and client secret from those steps.

### 7.1 Required Application Settings

The following application settings **must** be configured on the SWA resource for the corporate deployment to function correctly:

| Setting | Value | Purpose | Where to Obtain |
|---------|-------|---------|-----------------|
| `AUTH_MODE` | `corporate` | Activates the `CorporateStrategy` authentication strategy. When set to `corporate`, the API uses Entra ID as the sole identity provider and enforces corporate authentication on all protected endpoints. | Static value — always set to `corporate` for corporate deployments. |
| `CORPORATE_LOCK` | `true` | Prevents the authentication mode from being switched away from `corporate` at runtime. Acts as a safety mechanism to ensure the deployment cannot accidentally fall back to a less restrictive auth mode. | Static value — always set to `true` for corporate deployments. |
| `COSMOS_CONNECTION_STRING` | `AccountEndpoint=https://<account>.documents.azure.com:443/;AccountKey=<key>;` | Provides the connection string for the Azure Cosmos DB account. The API uses this to connect to the `go-url-alias` database and `aliases` container. | Azure portal: Cosmos DB account → **Settings → Keys** → **PRIMARY CONNECTION STRING**. Azure CLI: see [Section 2.2](#22-create-cosmos-db-account-database-and-container). |
| `AAD_CLIENT_ID` | `<guid>` (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) | The Application (client) ID of the Entra App Registration. The SWA authentication middleware uses this to identify the application during the OpenID Connect flow. | Azure portal: Entra ID → **App registrations** → your app → **Overview** → **Application (client) ID**. Azure CLI: `az ad app show --id "$APP_ID" --query appId --output tsv`. |
| `AAD_CLIENT_SECRET` | `<secret>` | The client secret for the Entra App Registration. The SWA authentication middleware uses this to complete the OpenID Connect token exchange with Entra ID. | Azure portal: Entra ID → **App registrations** → your app → **Certificates & secrets** → copy the secret **Value** (only visible immediately after creation). See [Section 2.3](#23-create-entra-app-registration). |

### 7.2 Optional Application Settings

| Setting | Value | Default | Purpose |
|---------|-------|---------|---------|
| `RESTRICT_CREATE_TO_ADMINS` | `true` | Not set (all authenticated users can create links) | When set to `true`, only users with the `Admin` role (assigned via Entra group membership — see [Section 5](#5-entra-group-to-role-mapping)) can create new short links. All other authenticated users can view and use existing links but cannot create new ones. This is useful for organisations that want to centralise link management to a small team of administrators. |

### 7.3 Configure Settings via Azure Portal

1. Navigate to the [Azure portal](https://portal.azure.com) and sign in.
2. Go to your Static Web App resource (e.g., `swa-go-url-alias`).
3. In the left menu, click **Settings → Configuration**.
4. Click **Add** for each setting and enter the name and value:

   | Name | Value |
   |------|-------|
   | `AUTH_MODE` | `corporate` |
   | `CORPORATE_LOCK` | `true` |
   | `COSMOS_CONNECTION_STRING` | *(paste your Cosmos DB primary connection string)* |
   | `AAD_CLIENT_ID` | *(paste your Entra App Registration client ID)* |
   | `AAD_CLIENT_SECRET` | *(paste your Entra App Registration client secret)* |

5. *(Optional)* Add `RESTRICT_CREATE_TO_ADMINS` with value `true` if you want to limit link creation to Admin-role users.
6. Click **Save**. The SWA will restart the API backend to pick up the new settings.

> **Tip:** Application settings are stored encrypted at rest and injected into the Azure Functions runtime as environment variables. They are never exposed in source control or pipeline logs.

### 7.4 Configure Settings via Azure CLI

```bash
# Set variables
SWA_NAME="swa-go-url-alias"
RESOURCE_GROUP="rg-go-url-alias"

# Configure all required application settings in a single command
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names \
    "AUTH_MODE=corporate" \
    "CORPORATE_LOCK=true" \
    "COSMOS_CONNECTION_STRING=<your-cosmos-connection-string>" \
    "AAD_CLIENT_ID=<your-client-id>" \
    "AAD_CLIENT_SECRET=<your-client-secret>"

# Optional: restrict link creation to Admin-role users
az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --setting-names "RESTRICT_CREATE_TO_ADMINS=true"
```

To verify the current application settings:

```bash
az staticwebapp appsettings list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --output table
```

> **Security note:** The `az staticwebapp appsettings list` command displays setting names but masks secret values. To update a secret, use `az staticwebapp appsettings set` with the new value.

### 7.5 `CORPORATE_LOCK` Safety Mechanism

The `CORPORATE_LOCK` setting is a safety mechanism that prevents accidental misconfiguration of the authentication mode in a corporate deployment.

**Behavior:**

- When `CORPORATE_LOCK` is set to `true` **and** `AUTH_MODE` is set to `corporate`: the API starts normally using the `CorporateStrategy` for authentication.
- When `CORPORATE_LOCK` is set to `true` **and** `AUTH_MODE` is **not** set to `corporate` (e.g., `AUTH_MODE=demo` or `AUTH_MODE` is missing): the API **refuses to start** and logs a descriptive error message explaining the misconfiguration.

This prevents a scenario where someone accidentally changes `AUTH_MODE` to a less restrictive mode (such as `demo`) while `CORPORATE_LOCK` is still enabled, which could expose the application without proper corporate authentication.

**Example error scenario:**

If the application settings are configured as:
```
CORPORATE_LOCK=true
AUTH_MODE=demo
```

The API will fail to start and log an error similar to:

```
CORPORATE_LOCK is enabled but AUTH_MODE is "demo" (expected "corporate").
Refusing to start. Set AUTH_MODE=corporate or remove CORPORATE_LOCK to proceed.
```

**Resolution:** Either set `AUTH_MODE=corporate` to match the lock, or remove the `CORPORATE_LOCK` setting if you intentionally want to switch to a different authentication mode.

> **Recommendation:** Always keep `CORPORATE_LOCK=true` in production corporate deployments. Only remove it temporarily during planned authentication mode migrations, and re-enable it immediately after.

### 7.6 Verification

After configuring all application settings, verify the following:

| Check | How | Expected Result |
|-------|-----|-----------------|
| Settings are saved | Azure portal → SWA → Configuration | All five required settings are listed |
| API starts successfully | Navigate to `https://<swa-hostname>/api/auth-config` | Returns `{ "mode": "corporate" }` |
| Cosmos DB connectivity | Create a short link via the UI | Link is created and persisted successfully |
| CORPORATE_LOCK works | Temporarily change `AUTH_MODE` to `demo` (then revert) | API refuses to start; logs show descriptive error |
| RESTRICT_CREATE_TO_ADMINS | Set to `true`, attempt link creation as non-admin | Non-admin users receive a 403 Forbidden response |

---

> **Next:** Continue to [Section 8 — SWA Configuration Generation](#8-swa-configuration-generation) to understand how the pipeline generates the SWA configuration file.

## 8. SWA Configuration Generation

The Azure DevOps pipeline regenerates `staticwebapp.config.json` on every deployment using the `scripts/generate-swa-config.ts` script. This ensures the SWA routing, authentication, and platform configuration always matches the target authentication mode — no manual editing of the config file is required.

### 8.1 How the Generator Works

The script at `scripts/generate-swa-config.ts` reads the `AUTH_MODE` environment variable and produces a complete `staticwebapp.config.json` at the project root. It supports three modes (`corporate`, `public`, `dev`), but the pipeline always invokes it with `AUTH_MODE=corporate`:

```bash
AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts
```

The script:

1. Reads `AUTH_MODE` from the environment and validates it against the allowed values (`corporate`, `public`, `dev`).
2. Calls the internal `generateSwaConfig(mode)` function, which returns a plain object representing the SWA configuration for the requested mode.
3. Serialises the object as pretty-printed JSON and writes it to `staticwebapp.config.json` in the current working directory.
4. Exits with a non-zero code if `AUTH_MODE` is missing or invalid, which causes the pipeline to halt before deployment.

Because the config is regenerated from code on every deploy, any manual edits to `staticwebapp.config.json` are overwritten. All routing and auth changes should be made in the generator script, not in the JSON file directly.

### 8.2 Pipeline Integration

The generation step runs after the build steps and before the `AzureStaticWebApp@0` deploy task in `azure-pipelines.yml`:

```yaml
- script: |
    AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts
  displayName: "Generate SWA config (corporate mode)"
```

This placement ensures:

- The frontend and API are already built, so the deploy task can pick up the freshly generated config alongside the build artifacts.
- If the generation step fails (e.g., missing `AUTH_MODE`), the pipeline halts and no deployment occurs.
- The config is never stale — every deployment gets a config that matches the current state of the generator script.

### 8.3 Generated Configuration (Corporate Mode)

When `AUTH_MODE=corporate`, the script produces a `staticwebapp.config.json` with the following sections:

#### Entra-Only Authentication

```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  }
}
```

Microsoft Entra ID (AAD) is configured as the sole identity provider. The `clientIdSettingName` and `clientSecretSettingName` fields reference SWA application settings — the actual secret values are resolved at runtime from the settings you configured in [Section 7](#7-environment-variables-and-application-settings).

> **Note:** Replace `{TENANT_ID}` with your Entra directory (tenant) ID. The generator outputs the placeholder; the SWA runtime resolves it if you configure the tenant ID in your app settings, or you can update the script to inject it at generation time.

#### Blocked Providers

```json
{
  "routes": [
    { "route": "/.auth/login/github", "statusCode": 404 },
    { "route": "/.auth/login/twitter", "statusCode": 404 },
    { "route": "/.auth/login/google", "statusCode": 404 }
  ]
}
```

All non-Entra built-in identity providers (GitHub, Twitter, Google) are blocked by returning HTTP 404 on their login routes. This prevents users from bypassing Entra SSO.

#### Authenticated Routes

The generated config requires the `authenticated` role on the following routes:

| Route | Purpose |
|-------|---------|
| `/api/*` | All API endpoints require authentication |
| `/_/manage` | The management page (rewritten to `/index.html`) |
| `/*` | Catch-all — every other page requires authentication |

Page rewrite routes (`/_/not-found`, `/_/interstitial`, `/_/kitchen-sink`, `/_/manage`) are also included to ensure SPA navigation works correctly. The `/{alias}` route rewrites to `/api/redirect/{alias}` for alias resolution.

#### 401 Response Override

```json
{
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer",
      "statusCode": 302
    }
  }
}
```

When an unauthenticated user hits a protected route, the SWA intercepts the 401 and issues a 302 redirect to the Entra login page. The `post_login_redirect_uri=.referrer` parameter ensures the user is returned to the page they originally requested after authentication.

#### Navigation Fallback

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/*", "/_/*"]
  }
}
```

The navigation fallback rewrites unmatched routes to `/index.html` so that the React SPA router can handle client-side navigation. API, auth, and internal routes are excluded from the fallback.

#### Platform and API Runtime

```json
{
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

The `platform.apiRuntime` field specifies the Node.js version used by the Azure Functions API backend. The generator currently outputs `node:20`.

### 8.4 Full Generated Config Reference

For reference, the complete `staticwebapp.config.json` produced by `AUTH_MODE=corporate` looks like this:

```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/{TENANT_ID}/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  },
  "routes": [
    { "route": "/.auth/login/github", "statusCode": 404 },
    { "route": "/.auth/login/twitter", "statusCode": 404 },
    { "route": "/.auth/login/google", "statusCode": 404 },
    {
      "route": "/login",
      "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer"
    },
    { "route": "/api/*", "allowedRoles": ["authenticated"] },
    { "route": "/_/not-found", "rewrite": "/index.html" },
    { "route": "/_/interstitial", "rewrite": "/index.html" },
    { "route": "/_/kitchen-sink", "rewrite": "/index.html" },
    { "route": "/_/manage", "rewrite": "/index.html" },
    { "route": "/{alias}", "rewrite": "/api/redirect/{alias}" },
    { "route": "/*", "allowedRoles": ["authenticated"] }
  ],
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer",
      "statusCode": 302
    }
  },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/*", "/_/*"]
  },
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

### 8.5 Customising the Generator

If you need to modify the generated SWA configuration (e.g., add additional blocked providers, change route rules, or update the API runtime version), edit `scripts/generate-swa-config.ts` directly. Key functions to look at:

| Function | Purpose |
|----------|---------|
| `generateCorporateConfig()` | Assembles the full config object for corporate mode |
| `aadAuth()` | Returns the Entra identity provider registration block |
| `blockProvider(provider)` | Returns a route that blocks a given provider with 404 |
| `pageRewrites()` | Returns the SPA page rewrite routes |
| `basePlatform()` | Returns the `platform` section (API runtime version) |
| `baseNavigationFallback()` | Returns the navigation fallback configuration |

After making changes, run the generator locally to preview the output:

```bash
AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts
cat staticwebapp.config.json
```

Commit the updated script — the pipeline will pick up the changes on the next deploy and regenerate the config automatically.

### 8.6 Verification

| Check | How | Expected Result |
|-------|-----|-----------------|
| Generator runs locally | `AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts` | `staticwebapp.config.json` is created at the project root |
| Entra-only auth | Inspect `auth.identityProviders` in the generated JSON | Only `azureActiveDirectory` is present |
| Blocked providers | Inspect `routes` for `/.auth/login/github`, `/twitter`, `/google` | Each returns `statusCode: 404` |
| Authenticated routes | Inspect `routes` for `/api/*` and `/*` | Both have `allowedRoles: ["authenticated"]` |
| 401 redirect | Inspect `responseOverrides["401"]` | Redirects to `/.auth/login/aad?post_login_redirect_uri=.referrer` with status 302 |
| API runtime | Inspect `platform.apiRuntime` | `node:20` |
| Pipeline regenerates config | Push a commit to `main` and check pipeline logs | The "Generate SWA config" step runs and outputs the file path |

---

> **Next:** Continue to [Section 9 — Verification Checklist](#9-verification-checklist) to confirm the deployment is fully functional.

## 9. Verification Checklist

After completing the deployment, work through this checklist to confirm the service is fully functional. Perform each check in order — later checks depend on earlier ones passing.

> **Tip:** Keep a browser DevTools Network tab open during verification to inspect redirects, status codes, and response headers.

### 9.1 Authentication and Provider Lockdown

| # | Check | Steps | Expected Result |
|---|-------|-------|-----------------|
| 1 | SWA URL redirects to Entra login | Navigate to `https://<swa-hostname>/` in a private/incognito window | Browser redirects to `login.microsoftonline.com` with your tenant's Entra ID login page |
| 2 | GitHub provider blocked | Navigate to `https://<swa-hostname>/.auth/login/github` | HTTP 404 Not Found |
| 3 | Twitter provider blocked | Navigate to `https://<swa-hostname>/.auth/login/twitter` | HTTP 404 Not Found |
| 4 | Google provider blocked | Navigate to `https://<swa-hostname>/.auth/login/google` | HTTP 404 Not Found |
| 5 | Entra login works | Navigate to `https://<swa-hostname>/.auth/login/aad` and authenticate | Redirects back to the app after successful login |
| 6 | Post-login redirect preserves URL | Navigate to `https://<swa-hostname>/_/manage` while unauthenticated | After Entra login, redirects back to `/_/manage` |

### 9.2 API and Application Functionality

| # | Check | Steps | Expected Result |
|---|-------|-------|-----------------|
| 7 | Auth config returns corporate mode | `curl https://<swa-hostname>/api/auth-config` | JSON response containing `"mode": "corporate"` |
| 8 | Create a link | Authenticate, then create a new alias via the UI or API | Link is created successfully and appears in the list |
| 9 | Read links | Navigate to the manage page or call `GET /api/links` | Returns the list of aliases including the one just created |
| 10 | Update a link | Edit the alias URL or description via the UI or API | Changes are persisted and reflected on refresh |
| 11 | Delete a link | Delete the test alias via the UI or API | Alias is removed from the list and redirect no longer works |
| 12 | Redirect works | Create an alias (e.g., `test`) and navigate to `https://<swa-hostname>/test` | Browser redirects to the target URL |

### 9.3 Role-Based Access Control

| # | Check | Steps | Expected Result |
|---|-------|-------|-----------------|
| 13 | Admin role for group members | Authenticate as a user who is a member of the admin Entra group, then check `/.auth/me` | `userRoles` array includes `"Admin"` alongside `"authenticated"` and `"anonymous"` |
| 14 | No Admin role for non-members | Authenticate as a user who is **not** in the admin Entra group, then check `/.auth/me` | `userRoles` array contains only `"authenticated"` and `"anonymous"` |
| 15 | Admin-only features (optional) | If `RESTRICT_CREATE_TO_ADMINS=true`, attempt to create a link as a non-admin user | Request is rejected with 403 Forbidden |

### 9.4 GSA Seamless SSO

| # | Check | Steps | Expected Result |
|---|-------|-------|-----------------|
| 16 | GSA device — seamless SSO | From a domain-joined, GSA-enrolled corporate device, navigate to `https://<swa-hostname>/` in a clean browser session | User is authenticated automatically with no credential prompt |
| 17 | Personal device — login prompt | From a personal (non-GSA) device, navigate to `https://<swa-hostname>/` | Entra ID login page is displayed, requiring the user to enter credentials |

### 9.5 Infrastructure Health

| # | Check | Steps | Expected Result |
|---|-------|-------|-----------------|
| 18 | Cosmos DB connectivity | Create and retrieve an alias | No errors; data persists across page refreshes |
| 19 | SWA application settings | In Azure portal, navigate to SWA → Configuration | All required settings are present: `AUTH_MODE`, `CORPORATE_LOCK`, `COSMOS_CONNECTION_STRING`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET` |
| 20 | Pipeline runs successfully | Push a commit to `main` and monitor the Azure DevOps pipeline | All steps pass: install → test → build → generate config → deploy |

> **All 20 checks passing?** Your corporate deployment is fully operational.

---

## 10. Troubleshooting

This section covers common issues encountered during and after deployment, organised by category.

### 10.1 Pipeline Failures

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `npm ci` fails with dependency errors | Lockfile out of sync, registry unreachable, or Node.js version mismatch | Run `npm ci` locally to reproduce. Ensure `package-lock.json` is committed and up to date. Verify the pipeline uses Node.js 20. |
| `npm test` fails (root or api) | Failing unit or property tests | Run `npm test` locally in the failing directory. Fix the failing tests and push again. The pipeline halts on test failure to prevent deploying broken code. |
| `npm run build` fails | TypeScript compilation errors, missing imports, or Vite config issues | Run `npm run build` locally to reproduce. Check for TypeScript errors with `npx tsc --noEmit`. |
| SWA config generation fails | `AUTH_MODE` not set, or `generate-swa-config.ts` has errors | Ensure the pipeline step sets `AUTH_MODE=corporate` as an environment variable. Run the generator locally: `AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts`. |
| `AzureStaticWebApp@0` task fails with auth error | Invalid or expired deployment token | Regenerate the deployment token in the Azure portal (SWA → Manage deployment token) or via CLI: `az staticwebapp secrets list --name <swa-name> --resource-group <rg>`. Update the `DEPLOYMENT_TOKEN` variable in the `go-url-alias` variable group. |
| `AzureStaticWebApp@0` task fails with "resource not found" | SWA resource deleted or name mismatch | Verify the SWA resource exists in the Azure portal. Ensure the deployment token matches the correct SWA resource. |
| Pipeline cannot access variable group | Variable group not linked to the pipeline | In Azure DevOps, go to Pipelines → your pipeline → Edit → Variables → Variable groups → link the `go-url-alias` group. |

### 10.2 Authentication Failures

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Entra login page shows "Application not found" or AADSTS error | Misconfigured App Registration — wrong client ID, deleted app, or tenant mismatch | Verify `AAD_CLIENT_ID` in SWA app settings matches the Application (client) ID in the Entra App Registration overview. Confirm the app is registered in the correct tenant. |
| Login fails with "invalid client secret" | Missing or incorrect `AAD_CLIENT_SECRET` | Navigate to the App Registration → Certificates & secrets. Check if the secret has expired. Generate a new secret and update the `AAD_CLIENT_SECRET` SWA application setting. |
| Redirect URI mismatch error after login | The redirect URI in the App Registration does not match the SWA callback URL | Verify the redirect URI is exactly `https://<swa-hostname>/.auth/login/aad/callback`. Check for trailing slashes, protocol mismatches (`http` vs `https`), or hostname typos. Update the App Registration redirect URI if needed. |
| Login succeeds but user sees 403 on all pages | User is authenticated but lacks the `authenticated` role, or route config is misconfigured | Check `/.auth/me` to verify the user's roles. Inspect `staticwebapp.config.json` to ensure routes require `authenticated` (not a custom role). Regenerate the SWA config with `AUTH_MODE=corporate`. |
| Redirect loop between SWA and Entra login | 401 override redirect misconfigured, or cookies not being set | Clear browser cookies for the SWA hostname and `login.microsoftonline.com`. Verify the `responseOverrides` section in `staticwebapp.config.json` is correct. Check that the SWA is using the Standard SKU (Free SKU has auth limitations). |

### 10.3 CORPORATE_LOCK Errors

| Symptom | Cause | Resolution |
|---------|-------|------------|
| API returns 500 or refuses to start with "CORPORATE_LOCK" error | `CORPORATE_LOCK=true` is set but `AUTH_MODE` is not `corporate` | Set `AUTH_MODE=corporate` in the SWA application settings. Both settings must be consistent — `CORPORATE_LOCK=true` requires `AUTH_MODE=corporate`. |
| API works locally but fails in production with lock error | Local `.env` has `AUTH_MODE=corporate` but SWA app settings are missing or different | Verify all SWA application settings in the Azure portal (SWA → Configuration). Ensure `AUTH_MODE=corporate` and `CORPORATE_LOCK=true` are both set. |
| Accidentally deployed with wrong AUTH_MODE | Pipeline generated config with wrong mode, or app setting was changed | Update the `AUTH_MODE` application setting to `corporate`. Re-run the pipeline to regenerate `staticwebapp.config.json` with the correct mode. |

### 10.4 Cosmos DB Connectivity

| Symptom | Cause | Resolution |
|---------|-------|------------|
| API returns 500 errors on link operations | Missing or invalid `COSMOS_CONNECTION_STRING` | Verify the connection string in SWA application settings. Retrieve a fresh connection string: `az cosmosdb keys list --name <account> --resource-group <rg> --type connection-strings`. |
| "Resource Not Found" errors from Cosmos DB | Database or container does not exist | Verify the database `go-url-alias` and container `aliases` exist in the Cosmos DB account. Create them if missing (see [Section 2.2](#22-create-cosmos-db-account-database-and-container)). |
| Cosmos DB connection timeout | Firewall rules blocking access, or wrong region | Check the Cosmos DB account's **Networking** settings. Ensure "Allow access from Azure services" is enabled, or add the SWA's outbound IPs to the firewall allow list. |
| High latency on link operations | Cosmos DB account in a different region than the SWA | Provision the Cosmos DB account in the same region as the SWA for lowest latency. |

### 10.5 GSA Not Forwarding Traffic

| Symptom | Cause | Resolution |
|---------|-------|------------|
| Users on GSA devices see Entra login prompt instead of seamless SSO | GSA traffic forwarding profile does not include the SWA hostname | Add the SWA FQDN to the GSA traffic forwarding profile (see [Section 4.2](#42-configure-the-gsa-traffic-forwarding-profile)). Verify the profile is assigned to the correct device groups. |
| GSA client not intercepting traffic | GSA client not installed, not running, or not enrolled | Check the GSA client status in the system tray on the corporate device. Ensure the device is domain-joined and GSA-enrolled. Restart the GSA client if needed. |
| Seamless SSO works intermittently | PRT expired or device trust issue | Run `dsregcmd /status` on the device to check Entra join status and PRT validity. If the PRT is expired, lock and unlock the device to refresh it. |
| Traffic logs show no entries for SWA hostname | FQDN rule not matching, or DNS resolution bypassing GSA | Verify the FQDN in the traffic forwarding profile matches the SWA hostname exactly (no wildcards unless intended). Check that the device's DNS is resolving through GSA. |

### 10.6 General Debugging Tips

- **Check `/.auth/me`:** After authenticating, navigate to `https://<swa-hostname>/.auth/me` to inspect the decoded client principal, including identity provider, user ID, user roles, and claims.
- **Check pipeline logs:** In Azure DevOps, open the pipeline run and expand each step to see detailed output. Failed steps show error messages and exit codes.
- **Check SWA deployment logs:** In the Azure portal, navigate to your SWA → **Deployment history** to see the status of recent deployments.
- **Test locally:** Run the SWA config generator locally (`AUTH_MODE=corporate npx tsx scripts/generate-swa-config.ts`) and inspect the output before pushing to the pipeline.
- **Regenerate and redeploy:** Many configuration issues are resolved by updating the relevant application setting and re-running the pipeline to regenerate and redeploy.

---

> **Congratulations!** You have completed the corporate deployment of the Go URL Alias Service. If you encounter issues not covered in this guide, check the [Azure Static Web Apps documentation](https://learn.microsoft.com/azure/static-web-apps/) and the [Microsoft Entra ID documentation](https://learn.microsoft.com/entra/identity/).
