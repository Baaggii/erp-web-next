# ERP-Web-Next Project Plan

## 1. Introduction
This document outlines the roadmap, scope, architecture, milestones, and deliverables for the ERP-Web-Next project—a multi-tenant, React + Express ERP web application with per-company user management, forms, reporting, and mosaic-style dashboard layouts.

## 2. Objectives
- **Secure Authentication**: JWT cookie-based login by Employee ID or Email.
- **Multi-company Support**: Assign users to multiple companies with per-company roles.
- **User Management**: Admin CRUD on users and company assignments; self-service password change.
- **Forms & Reports**: Dynamic form renderer via JSON schema; embeddable chart/report components.
- **Mosaic Dashboard**: Flexible, windowed layouts (React Mosaic) for simultaneous views.
- **Config & Settings**: Per-tenant settings page; runtime feature flags.
- **Deployment**: Simple Apache + PM2 without special proxy modules.

## 3. Scope & Features
1. **Auth & User**  
   - `/erp/api/auth/health`, `/login`, `/me`, `/logout`  
   - `/erp/api/users`: GET|POST  
   - `/erp/api/users/:id`: PUT|DELETE  
   - `/erp/api/users/:id/password`: PUT (old/new/confirm)  
   - `/erp/api/user_companies`: GET|POST|PUT|DELETE

2. **Forms**  
   - `/erp/api/forms`: list & JSON schema endpoints.  
   - React renderer to POST form data.

3. **Reports**  
   - Data fetching endpoints; generic `<ReportsViewer>` wrapper.

4. **Dashboard (Mosaic)**  
   - Launchable modules (SalesDashboard, GLInquiry, etc.) in resizable tiles.  
   - Layout persistence per user.

5. **Settings**  
   - Global & tenant-specific configs.  
 - Feature toggles (e.g. enable/disable mosaic).

6. **Coding Tables Upload**
   - Upload Excel sheets to create simple lookup tables.
   - Support user-friendly descriptions for calculated fields (e.g. `age - today - birthdate`).

## 4. Architecture & Tech Stack
- **Front-end**  
  - React v18, React Router v6, React Mosaic  
  - Vite bundler  
  - Context API for Auth & Theme  
- **Back-end**  
  - Node .js (ESM), Express v4  
  - `mysql2/promise`  
  - `bcryptjs` for hashing  
  - `jsonwebtoken` for JWT  
- **DB Schema**  
  - `user_roles(id PK, name)`
  - `users(empid PK, email, name, password, role_id FK→user_roles.id, created_by, created_at)`
  - `companies(id PK, name, created_at)`  
  - `user_companies(empid FK→users.empid, company_id FK→companies.id, role_id FK→user_roles.id, created_by, created_at)`
  - Single-database multi-tenant (company_id discriminator)

## 5. Milestones & Timeline

| Phase                | Tasks                                                                                            | ETA   |
|----------------------|--------------------------------------------------------------------------------------------------|-------|
| **Phase 1**          | Setup repo, env, `.htaccess`, PM2, Docker dev                                                    | 1 day |
| **Phase 2: Auth & User**       | Auth routes, login by ID/email, JWT cookie, `RequireAuth`, login form                     | 2 days|
| **Phase 3: User Mgmt** | Admin CRUD, self-password change, UI (`Users.jsx`), API integration, validation                  | 3 days|
| **Phase 4: Forms & Reports**    | JSON form renderer, sample `/forms`, basic `/reports` component                            | 3 days|
| **Phase 5: Mosaic Dashboard**   | Integrate React Mosaic, scaffold windows, layout save/load                                 | 4 days|
| **Phase 6: Settings & Multi-tenant polish** | Settings page, theme toggles, multi-company switch, error-boundary, i18n           | 4 days|
| **Phase 7: Testing & Deployment** | Unit + integration tests, CORS & proxy fallback, performance tuning, docs, final deploy | 3 days|

_Total: ∼20 calendar days_

## 6. Deployment & Configuration
- **Apache `.htaccess`**  
  ```apache
  RewriteEngine On
  RewriteBase /erp/
  # Static assets
  RewriteRule ^assets/(.*)$ /erp/assets/$1 [L]
  # API proxy (if mod_proxy available)
  # ProxyPass /erp/api/ http://127.0.0.1:3002/erp/api/
  # ProxyPassReverse /erp/api/ http://127.0.0.1:3002/erp/api/
  # Fallback to React router
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteRule ^ index.html [QSA,L]

PM2

pm2 start api-server/server.js --name erp-app --update-env

7. Testing & Validation
Manual: Use provided test-erp.sh to validate each endpoint.

Automated: Jest + Supertest for backend; React Testing Library for front-end.
