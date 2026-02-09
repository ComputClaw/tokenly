# Tokenly - Project Guide

## Overview

Tokenly is a distributed AI token usage tracking system. See `specs/` for detailed component specifications.

## Architecture

- **Hosting**: Azure Static Web Apps (SWA) with managed API
- **Frontend**: React + Vite + Tailwind CSS + Chart.js (SPA)
- **Backend**: Azure Functions v4 (Node.js programming model v4, TypeScript)
- **Runtime**: Node.js 22
- **Package manager**: npm
- **Testing**: Jest
- **Storage**: In-memory implementations for both Admin Storage and Token Storage plugins (for now)

## Project Structure

```
Tokenly2/
  api/                  → Azure Functions (SWA managed API)
    src/
      functions/        → HTTP trigger handlers
      services/         → Business logic
      interfaces/       → Plugin contracts
      plugins/          → In-memory storage implementations
      models/           → Domain models, DTOs
    package.json
    tsconfig.json
    host.json
  web/admin/            → React SPA (SWA frontend)
    src/
    public/
    staticwebapp.config.json
    package.json
    vite.config.ts
  client/               → Launcher + Worker (later)
  specs/                → Component specifications
  swa-cli.config.json   → SWA CLI config (local dev)
```

## Specifications

| Spec | Component |
|------|-----------|
| `specs/01-client-launcher-spec.md` | Client Launcher - system service managing worker lifecycle |
| `specs/02-client-worker-spec.md` | Client Worker - JSONL file discovery, upload, and learning engine |
| `specs/03-server-core-spec.md` | Server Core - HTTP API, auth, client management, ingestion |
| `specs/04-admin-storage-plugin-spec.md` | Admin Storage Plugin - client registry, config, users, audit |
| `specs/05-token-storage-plugin-spec.md` | Token Storage Plugin - high-volume usage data and analytics |
| `specs/06-admin-interface-spec.md` | Admin Interface - React SPA for management and analytics |

## Implementation Scope

**Current phase (Phase 1):**
- Server Core (spec 03) - Azure Functions API
- Admin Storage Plugin (spec 04) - In-memory implementation
- Token Storage Plugin (spec 05) - In-memory implementation
- Admin Interface (spec 06) - React SPA

**Later:**
- Client Launcher + Worker (specs 01, 02)
- Persistent storage plugins (PostgreSQL, InfluxDB)

## Key Design Decisions

- SWA serves static frontend files from CDN (no function invocations for HTML/JS/CSS)
- `/api/v1/*` routes to Azure Functions backend automatically
- SPA fallback routing handled by SWA
- Storage plugins wired via dependency injection; in-memory for development, swappable to persistent backends later
- JWT authentication with httpOnly refresh cookies for admin interface
- All client configuration delivered via server heartbeat responses (zero-config clients)

## Memory

This project uses `MEMORY.md` (located at `~/.claude/projects/D--Source-Tokenly2/memory/MEMORY.md`) for persistent cross-conversation memories and learnings. Check it for context from previous sessions.
