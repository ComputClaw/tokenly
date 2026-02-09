# Tokenly Project Memory

## Project Status
- **Phase**: Phase 1 COMPLETE. All code built, reviewed, fixed, and tested.
- **Repo**: https://github.com/ComputClaw/tokenly.git (branch: main)
- **Next step**: Commit Phase 1, then Phase 2 (Client Launcher + Worker, persistent storage plugins)

## Phase 1 Completion Summary
- **API**: 33 source files (interfaces, models, plugins, services, functions)
- **Frontend**: 22 source files (React SPA with Vite + Tailwind + Chart.js)
- **Tests**: 202 tests passing (150 API Jest + 52 Frontend Vitest)
- **Reviews**: Both API and frontend reviewed, all findings fixed
- **TypeScript**: Strict mode with noUncheckedIndexedAccess, branded types, Result types

## Architecture Decisions (confirmed with user)
- **Hosting**: Azure Static Web Apps (SWA) with managed API
- **Backend**: Azure Functions v4, Node.js programming model v4, TypeScript, Node.js 22
- **Frontend**: React + Vite + Tailwind CSS + Chart.js
- **Storage**: Azure Table Storage for admin plugin, in-memory for token plugin (for now)
- **Package manager**: npm
- **Testing**: Jest
- **User rejected**: Serving static files via Azure Function catch-all (wasteful invocations) — SWA is the right approach

## Azure Functions Gotchas
- **`admin` is a reserved route/name prefix** — Azure Functions blocks any function name or route starting with `admin` (including `administration`). Use `manage/` for routes and `mgmt*` for function registration names instead.
- Port 7071 TIME_WAIT: after stopping `func`, the port may stay in TIME_WAIT for ~30s. Wait before restarting.

## Azure Table Storage Notes
- `#` character is **not allowed** in partition/row keys — use `~` (tilde) as separator
- System `timestamp` property overwrites domain fields — use `audit_ts` and map back
- `TableTransaction.deleteEntity(partitionKey, rowKey)` — partitionKey is first arg
- Range queries with `~` separator: upper bound increments prefix char (e.g., `name~` to `namf`)
- `TableEntityQueryOptions` has `filter` and `select` only — no `top` property
- Azurite: run with `npx azurite`, not `azurite-table`

## Project Layout
- `api/` → Azure Functions (SWA managed API)
- `web/admin/` → React SPA (SWA frontend)
- `client/` → Launcher + Worker (later)
- `specs/` → 6 component specifications
- `CLAUDE.md` → Project guide (checked in)

## Implementation Scope (Phase 1)
- Server Core (spec 03)
- Admin Storage Plugin (spec 04) - in-memory
- Token Storage Plugin (spec 05) - in-memory
- Admin Interface (spec 06) - React SPA
