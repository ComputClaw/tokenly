# Tokenly

**Personal AI token usage tracking across all your platforms**

## Overview

Tokenly is a distributed system for collecting and analyzing AI token usage from across your entire infrastructure. Whether you're running OpenClaw agents, using Azure OpenAI, calling Anthropic APIs, or any other LLM services - Tokenly gives you unified visibility into your AI spending.

## The Problem

AI costs can spiral quickly when you have:
- Multiple AI agents running 24/7
- Different applications calling various LLM APIs
- Services spread across different platforms and providers
- No central view of token consumption and costs

Without tracking, you discover expensive usage patterns too late.

## The Solution

Tokenly automatically discovers and collects token usage data from JSONL log files across your systems, giving you:

- **Unified Dashboard** - All AI spending in one place
- **Cost Trending** - Daily, weekly, monthly burn rates
- **Service Breakdown** - Which models and providers cost the most
- **Platform Analysis** - Which applications are driving costs
- **Budget Monitoring** - Alerts when spending exceeds thresholds

## Architecture

### Distributed Collection
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Laptop    │    │ Office PC   │    │  Cloud VM   │    │    VPS      │    │ Raspberry   │
│  (MacBook)  │    │ (Windows)   │    │   (Azure)   │    │  (Linux)    │    │     Pi      │
│ ┌─launcher──┐│    │ ┌─launcher──┐│    │ ┌─launcher──┐│    │ ┌─launcher──┐│    │ ┌─launcher──┐│
│ │  ┌worker┐ ││    │ │  ┌worker┐ ││    │ │  ┌worker┐ ││    │ │  ┌worker┐ ││    │ │  ┌worker┐ ││
│ │  └──────┘ ││    │ │  └──────┘ ││    │ │  └──────┘ ││    │ │  └──────┘ ││    │ │  └──────┘ ││
│ └───────────┘│    │ └───────────┘│    │ └───────────┘│    │ └───────────┘│    │ └───────────┘│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │                   │
       └───────────────────┼───────────────────┼───────────────────┼───────────────────┘
                           │
                  ┌─────────────────┐
                  │    Tokenly      │
                  │     Server      │
                  └─────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Azure Functions v4, TypeScript, Node.js 22 |
| **Frontend** | React 19, Vite 7, Tailwind CSS 4, Chart.js |
| **Client** | Go 1.24+, cross-platform binaries |
| **Hosting** | Azure Static Web Apps (CDN + managed API) |
| **Storage** | In-memory (dev) / Azure Table Storage (prod) |
| **Auth** | JWT with httpOnly refresh cookies, bcrypt |

### Client Components

**Launcher** (Small, stable service)
- Manages worker lifecycle via state-file IPC
- Handles heartbeats and server communication
- Exponential backoff on connection failures
- Cross-platform: Windows, macOS, Linux (x64 + arm64)

**Worker** (The detective engine)
- Smart discovery of JSONL files using glob patterns
- Validates files (50%+ valid records threshold)
- Concurrent uploads with configurable parallelism
- Learning engine tracks directory success rates

### Server Components

**Core API** - 12 Azure Functions endpoints
- `/api/heartbeat` - Client registration and approval
- `/api/ingest` - Token usage data collection (JSON + multipart)
- `/api/auth/*` - Authentication (login, refresh, logout)
- `/api/manage/*` - Client management, users, config, audit, analytics

**Storage Plugins** (dependency-injected, swappable)
- **Admin Storage** - Client registry, users, config, audit logs
  - In-memory backend (development)
  - Azure Table Storage backend (production)
- **Token Storage** - Usage records, analytics, time-series
  - In-memory backend with deduplication and trend analysis

**Admin Interface** - React SPA with 7 pages
- Dashboard with metric cards and usage trend charts
- Client management with approve/reject workflow
- Analytics with cost trends, top services/models, breakdowns
- Configuration, user management, and audit trail

## Client Workflow

1. **Registration** - Client sends heartbeat, waits for server approval
2. **Discovery** - Smart scanning of common log locations:
   - Linux: `/var/log/*`, `/opt/*/logs/`, `/home/*/logs/`
   - Windows: `%APPDATA%/logs/`, `%PROGRAMDATA%/logs/`
3. **Collection** - Upload JSONL files older than 24 hours
4. **Cleanup** - Delete uploaded files, remove empty directories
5. **Learning** - Remember successful locations for efficient future scans

## Token Usage Format

Expected JSONL format for token usage logs:

```jsonl
{"timestamp": "2026-02-09T09:38:00Z", "service": "anthropic", "model": "claude-sonnet-4", "input_tokens": 1205, "output_tokens": 847, "cost_usd": 0.0234, "session_id": "abc123"}
{"timestamp": "2026-02-09T09:39:00Z", "service": "azure-openai", "model": "gpt-4", "input_tokens": 892, "output_tokens": 445, "cost_usd": 0.0156, "application": "chatbot"}
```

## Key Features

### Zero Configuration
- Clients require no manual setup
- All configuration delivered via server heartbeat responses
- Automatic discovery of log locations
- Server-side approval workflow

### Secure & Controlled
- JWT authentication with httpOnly refresh cookies
- bcrypt password hashing, permission-based access control
- Clients must be approved before collecting data
- Full audit trail of all admin actions

### Smart Discovery
- Platform-aware log location scanning
- Learning algorithm remembers successful paths with weighted scoring
- Heuristic expansion (if logs found in `/var/log/app1/`, check `/var/log/app2/`)
- Efficient scanning with adaptive intervals

### Reliable Architecture
- Launcher/worker two-process model prevents update failures
- Branded types prevent ID mix-ups at compile time
- Discriminated union Result types for error handling
- Plugin architecture enables swappable storage backends

## Project Status

### Phase 1: Server + Admin Interface - COMPLETE
- [x] Server Core API (12 endpoints, TypeScript/Azure Functions)
- [x] Admin Storage Plugin (in-memory + Azure Table Storage)
- [x] Token Storage Plugin (in-memory with analytics)
- [x] Admin Interface (React SPA, 7 pages, dark theme)
- [x] JWT authentication with refresh tokens
- [x] Audit logging and permission system

### Phase 2: Client + Production Storage - IN PROGRESS
- [x] Go client MVP (launcher + worker, cross-platform)
- [x] JSONL discovery, validation, and upload pipeline
- [x] Learning engine for optimized scanning
- [ ] Persistent token storage (PostgreSQL / InfluxDB)
- [ ] System service installation (systemd / Windows Service)
- [ ] Client auto-update mechanism

### Phase 3: Advanced Features - PLANNED
- [ ] Budget alerts and threshold notifications
- [ ] Advanced analytics and cost projections
- [ ] Multi-tenant support

## Project Structure

```
Tokenly/
├── api/                    → Azure Functions backend (TypeScript)
│   └── src/
│       ├── functions/      → 12 HTTP trigger handlers
│       ├── services/       → Business logic (admin, client, JWT)
│       ├── interfaces/     → Plugin contracts
│       ├── plugins/        → InMemory + AzureTable storage
│       └── models/         → Domain models, DTOs, branded types
├── web/admin/              → React SPA frontend
│   └── src/
│       ├── pages/          → 7 pages (dashboard, clients, analytics, ...)
│       ├── components/     → Reusable UI (Button, Card, Modal, ...)
│       ├── contexts/       → Auth state management
│       └── services/       → API client with auto-refresh
├── client/go/              → Go client (launcher + worker)
│   ├── cmd/                → Entry points (launcher, worker)
│   └── internal/           → Config, platform, scanner, uploader, learner
├── specs/                  → 8 component specifications (language-agnostic)
└── swa-cli.config.json     → Local development config
```

## Getting Started

### Local Development

```bash
# Install dependencies
cd api && npm install
cd web/admin && npm install

# Start the full stack (SWA CLI)
npx swa start    # Frontend on :4280, API on :7071

# Build the Go client
cd client/go && make build
```

### Deploy a Client

```bash
./tokenly-launcher --server https://your-server.com
```

The launcher registers with the server, waits for admin approval, then automatically starts the worker to discover and upload token usage data.

### Approve Clients

Use the admin interface to review and approve pending clients. All client configuration is managed server-side and delivered via heartbeat responses.

## Specifications

| Spec | Component |
|------|-----------|
| [`01-client-launcher-spec.md`](specs/01-client-launcher-spec.md) | Client Launcher - system service managing worker lifecycle |
| [`02-client-worker-spec.md`](specs/02-client-worker-spec.md) | Client Worker - JSONL discovery, upload, and learning engine |
| [`03-server-core-spec.md`](specs/03-server-core-spec.md) | Server Core - HTTP API, auth, client management, ingestion |
| [`04-admin-storage-plugin-spec.md`](specs/04-admin-storage-plugin-spec.md) | Admin Storage Plugin - client registry, config, users, audit |
| [`05-token-storage-plugin-spec.md`](specs/05-token-storage-plugin-spec.md) | Token Storage Plugin - usage data and analytics |
| [`06-admin-interface-spec.md`](specs/06-admin-interface-spec.md) | Admin Interface - React SPA for management and analytics |
| [`07-client-protocol-spec.md`](specs/07-client-protocol-spec.md) | Client Protocol - language-agnostic interoperability contracts |
| [`08-ingestion-post-processor-spec.md`](specs/08-ingestion-post-processor-spec.md) | Ingestion Post-Processor - async JSONL parsing and validation |

All specifications are implementation-agnostic, using JSON data models, operation tables, and behavioral descriptions.

---

*Tokenly: Because knowing where your tokens go is the first step to AI cost management.*