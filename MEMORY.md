# Tokenly Project Memory

## Project Status
- **Phase**: Phase 1 COMPLETE + Azure Table Storage admin backend implemented
- **Repo**: https://github.com/ComputClaw/tokenly.git (branch: main)
- **Tests**: 234 tests passing (9 test suites — 63 Azure Table + 59 InMemory + Jest API + Vitest frontend)
- **Next step**: Phase 2 (Client Launcher + Worker, persistent token storage plugins)

## Phase 1 Completion Summary
- **API**: 33+ source files (interfaces, models, plugins, services, functions)
- **Frontend**: 22+ source files (React SPA with Vite + Tailwind + Chart.js)
- **TypeScript**: Strict mode with noUncheckedIndexedAccess, branded types, Result types

## Recent Changes (latest session)
- **Renamed `AdminUser` → `User`** across all specs, models, interfaces, plugins, services, functions, tests, and frontend
- **Single-row storage** for both users and clients in Azure Table Storage (removed dual-row indexing)
- **Routes use `manage/` prefix**, function registration names use `mgmt*`
- **Client `description` field** added end-to-end (model → storage → API → frontend)
- **Frontend fixes**: Zod schemas use `.nullable()` for fields API can return as `null`

## Architecture Decisions (confirmed with user)
- **Hosting**: Azure Static Web Apps (SWA) with managed API
- **Backend**: Azure Functions v4, Node.js programming model v4, TypeScript, Node.js 22
- **Frontend**: React + Vite + Tailwind CSS + Chart.js
- **Storage**: Azure Table Storage for admin plugin (`AzureTableAdminStorage`), in-memory for token plugin (for now)
- **Package manager**: npm
- **Testing**: Jest (API), Vitest (frontend)
- **User rejected**: Serving static files via Azure Function catch-all (wasteful invocations) — SWA is the right approach

## API Routes
All API routes use `/api/manage/` prefix. Function registration names use `mgmt*`.
- `GET /manage/clients` — list clients (filterable by status)
- `PUT /manage/clients/{clientId}` — update client (description)
- `DELETE /manage/clients/{clientId}` — delete client
- `PUT /manage/clients/{clientId}/approve` — approve client
- `PUT /manage/clients/{clientId}/reject` — reject client
- `GET/PUT /manage/config/{key}` — config (special key: `default_client_config`)
- `GET /manage/users`, `POST /manage/users` — list/create users
- `GET /manage/status` — system status
- `GET /manage/audit` — audit log

## Azure Functions Gotchas
- **`admin` is a reserved route/name prefix** — Azure Functions blocks any function name or route starting with `admin` (including `administration`). Use `manage/` for routes and `mgmt*` for function registration names instead.
- Port 7071 TIME_WAIT: after stopping `func`, the port may stay in TIME_WAIT for ~30s. Wait before restarting, or kill stale `func` processes.

## Azure Table Storage Notes
- **Single-row storage** for users (`name~{username}`) and clients (`id~{clientId}`)
- Hostname/userId lookups scan rows and filter in-memory (acceptable at expected scale)
- `#` character is **not allowed** in partition/row keys — use `~` (tilde) as separator
- System `timestamp` property overwrites domain fields — use `audit_ts` and map back
- Range queries with `~` separator: upper bound increments prefix char (e.g., `name~` to `namf`)
- `TableEntityQueryOptions` has `filter` and `select` only — no `top` property
- Azurite: run with `npx azurite`, not `azurite-table`
- Arrays/nested objects → JSON string in `{name}_json` property; `null` → empty string `""`

## Frontend Notes
- Zod schemas must use `.nullable()` for fields the API can return as `null` — otherwise validation silently fails
- `default_client_config` is a special config key bridged to dedicated storage methods
- `api-client.ts` handles JWT refresh via axios interceptors with `WeakSet` retry tracking

## Project Layout
- `api/` → Azure Functions (SWA managed API)
- `web/admin/` → React SPA (SWA frontend)
- `client/` → Launcher + Worker (later)
- `specs/` → 6 component specifications
- `CLAUDE.md` → Project guide (checked in)

## Container Wiring
- `api/src/services/container.ts` — uses env var `ADMIN_STORAGE_BACKEND` (memory | azure_table)
- `TOKENLY_TABLE_STORAGE_CONNECTION` — Azure Table Storage connection string (default: UseDevelopmentStorage=true)
- `TOKENLY_TABLE_PREFIX` — table name prefix (default: tokenly)
