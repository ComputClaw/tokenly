# Tokenly Project Memory

## Project Status
- **Phase**: Pre-implementation. All specs written, CLAUDE.md created, repo pushed to GitHub.
- **Repo**: https://github.com/ComputClaw/tokenly.git (branch: main)
- **Next step**: Start building Phase 1 (API + storage plugins + admin UI)

## Architecture Decisions (confirmed with user)
- **Hosting**: Azure Static Web Apps (SWA) with managed API
- **Backend**: Azure Functions v4, Node.js programming model v4, TypeScript, Node.js 22
- **Frontend**: React + Vite + Tailwind CSS + Chart.js
- **Storage**: In-memory for both plugins (for now)
- **Package manager**: npm
- **Testing**: Jest
- **User rejected**: Serving static files via Azure Function catch-all (wasteful invocations) — SWA is the right approach

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
