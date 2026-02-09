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

### Client Components

**Launcher** (Small, stable service)
- Manages worker lifecycle
- Handles heartbeats and server communication
- Downloads and installs worker updates
- Registers as system service (systemd/Windows Service)

**Worker** (The detective engine)
- Smart discovery of JSONL files containing token usage
- Processes files older than 24 hours
- Uploads data and cleans up local files
- Learns from successful discoveries

### Server Components

**Core API**
- `/heartbeat` - Client registration and approval
- `/ingest` - Token usage data collection
- `/auth/*` - Admin authentication (login, refresh, logout)
- `/admin/*` - Client management, user management, system status

**Shared Library**
- Service interfaces (client management, admin operations, JWT tokens, etc.)
- Domain models, DTOs, and exceptions
- Plugin interfaces (Admin Storage, Token Storage)

**Storage Plugins**
- **Admin Storage Plugin** - Client registry, system config, audit logs
- **Token Storage Plugin** - High-volume usage data, analytics, time-series
- Multiple backends: In-memory (development), database, cloud storage

**Admin Interface**
- Approve new clients
- Monitor collection status
- View usage analytics

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
- Server-side approval workflow
- Automatic discovery of log locations
- Self-updating client binaries

### Secure & Controlled
- Clients must be approved before collecting data
- Hostname-based client identification
- Server can enable/disable collection per client
- Configurable collection parameters

### Smart Discovery
- Platform-aware log location scanning
- Learning algorithm remembers successful paths
- Heuristic expansion (if logs found in `/var/log/app1/`, check `/var/log/app2/`)
- Efficient scanning with adaptive intervals

### Reliable Updates
- Launcher/worker pattern prevents update failures
- Checksum verification for security
- Seamless binary replacement without service interruption
- Version management with rollback capability

## Development Roadmap

### Phase 1: Core Collection
- [x] Server API framework
- [x] Basic client worker (discovery + upload)
- [x] Simple approval system
- [x] Storage plugin system (in-memory)

### Phase 2: Production Ready
- [ ] Client launcher + auto-updates
- [ ] Admin web interface
- [ ] Persistent storage plugins (database, cloud)

### Phase 3: Analytics
- [ ] Usage dashboard
- [ ] Cost trending and alerts
- [ ] Advanced analytics and insights

## Getting Started

1. **Deploy the server** - Set up the Tokenly server core on your hosting platform of choice
2. **Deploy clients** - Install client launchers on your target machines with `--server <url>`
3. **Approve clients** - Use the admin interface to approve registered clients

See the [`specs/`](specs/) folder for detailed component specifications and API contracts.

## Use Cases

- **Personal AI Spending** - Track costs across all your AI experiments and projects
- **Agent Fleets** - Monitor token usage from multiple AI agents  
- **Development Teams** - Understand which features drive AI costs
- **Budget Management** - Set spending limits and get alerts
- **Usage Optimization** - Identify expensive patterns and optimize

## Specifications

Detailed architecture specifications for each component are in the [`specs/`](specs/) folder.

---

*Tokenly: Because knowing where your tokens go is the first step to AI cost management.*