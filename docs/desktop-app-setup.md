# Desktop Application Setup & Deployment Guide

This repository contains two dedicated Electron desktop shells:
1. **`@odyssey/desktop-admin`** (`apps/desktop-admin`): Reception, Pharmacy POS, Billing/Cashier, Inventory.
2. **`@odyssey/desktop-provider`** (`apps/desktop-provider`): Doctor Consultations, EMR, Clinical SOAP notes.

---

## 1. Quick Start (Development Mode)

Make sure your Next.js web servers are running (`pnpm dev` in the repository root).

### To launch Admin & POS Desktop App:
```powershell
pnpm desktop:admin:dev
```

### To launch Doctor Portal Desktop App:
```powershell
pnpm desktop:provider:dev
```

### Built-in Desktop Developer Shortcuts:
- **`F12`** or **`Ctrl + Shift + I`**: Open Chrome DevTools & Console directly inside the app.
- **`F5`** or **`Ctrl + R`**: Hard reload the portal.

---

## 2. Deploying Web Portals to Cloudflare Pages

1. In the [Cloudflare Dashboard](https://dash.cloudflare.com/), navigate to **Workers & Pages** $\rightarrow$ **Create application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
2. Create two Pages projects from this repository:

| Project | Root Directory | Build Output Directory | Environment Variables |
| :--- | :--- | :--- | :--- |
| **`odyssey-admin`** | `apps/admin-web` | `.next` (or `out`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **`odyssey-provider`** | `apps/provider-web` | `.next` (or `out`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

---

## 3. Securing & Hiding the Portals from the Public (Cloudflare WAF)

Each desktop app automatically injects a secret security header on every request:
- **Header Name**: `X-Odyssey-App-Key`
- **Default Secret Value**: `odyssey_desktop_admin_secure_key` / `odyssey_desktop_provider_secure_key`

### Blocking Public Browsers:
In Cloudflare Dashboard $\rightarrow$ **Websites** $\rightarrow$ **Security** $\rightarrow$ **WAF** $\rightarrow$ **Custom Rules**:
1. Click **Create Rule**:
   - **Rule Name**: `Block Non-Desktop Traffic`
   - **Field**: `Hostname` equals `admin.yourclinic.com`
   - **And**: `HTTP Request Header` $\rightarrow$ `X-Odyssey-App-Key` does NOT equal `odyssey_desktop_admin_secure_key`
   - **Action**: `Block` (or `Managed Challenge`)

*Now, anyone who tries to open the URL in Chrome/Safari is blocked. Only the compiled `.exe` desktop app can load the portal.*

---

## 4. Building the Windows Installers (`.exe`)

To build the production installer for the clinic computers:

```powershell
# Build Admin & POS Installer (.exe)
pnpm desktop:admin:build

# Build Doctor Portal Installer (.exe)
pnpm desktop:provider:build
```

The compiled setup files will be placed in:
- `apps/desktop-admin/dist/Odyssey Admin & POS Setup 1.0.0.exe`
- `apps/desktop-provider/dist/Odyssey Doctor Portal Setup 1.0.0.exe`

Give these `.exe` files to the clinic staff **once**. From then on, any changes you push to Git will automatically update on their desktop screens upon restart/refresh!
