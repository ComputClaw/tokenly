# Component Specification: Admin Interface

## Overview

The Admin Interface is a modern web application that provides administrators with complete control over the Tokenly system. It offers client approval workflows, system monitoring, configuration management, usage analytics, and troubleshooting tools through an intuitive, responsive interface.

**Design Philosophy:**
- **User-centric design** - Optimized for administrative workflows
- **Real-time updates** - Live status and WebSocket notifications
- **Mobile responsive** - Works on desktop, tablet, and mobile
- **Progressive enhancement** - Core functionality without JavaScript

---

## Responsibilities

### Primary Functions
1. **Client Approval Workflow** - Review and approve/reject new clients
2. **System Monitoring** - Real-time status dashboard and health metrics
3. **Configuration Management** - Modify system settings and client overrides
4. **Usage Analytics** - Token usage trends, cost analysis, reporting
5. **User Management** - User accounts, API keys, permissions (future)

### Secondary Functions
6. **Audit Trail Viewing** - Browse administrative action history
7. **Troubleshooting Tools** - Client diagnostics and error investigation
8. **Data Export** - Download usage reports and system data
9. **Bulk Operations** - Mass client approval, configuration changes
10. **Alert Management** - System notifications and threshold monitoring

---

## Architecture

### Application Type
Single-page application (SPA) with client-side routing, built using any modern frontend framework.

### Recommended Technology Characteristics
- **Lightweight bundles** - Fast initial load
- **Reactive state management** - Stores or equivalent for UI state
- **Utility-first CSS** - Tailwind CSS or similar for rapid styling
- **Charts/Analytics** - Chart.js, D3.js, or equivalent visualization library
- **Authentication** - JWT tokens with httpOnly cookies

### Application Structure
```
web/admin/
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   ├── clients/
│   │   ├── config/
│   │   ├── analytics/
│   │   ├── audit/
│   │   └── common/
│   ├── pages/
│   ├── stores/          # Reactive state management
│   ├── services/        # API client, auth, WebSocket
│   ├── utils/
│   └── types/
├── public/
└── dist/                # Build output
```

---

## User Interface Design

### Navigation Structure

#### Primary Navigation
```
Dashboard           - System overview and health status
├── Clients         - Client management and approval
│   ├── Pending     - New clients awaiting approval
│   ├── Active      - Approved and running clients
│   ├── Inactive    - Stopped or problematic clients
│   └── Rejected    - Blocked clients
├── Analytics       - Usage analysis and reporting
│   ├── Overview    - High-level metrics and trends
│   ├── Cost        - Token usage costs and budgeting
│   ├── Models      - Per-model usage breakdown
│   └── Reports     - Scheduled and custom reports
├── Configuration   - System settings management
│   ├── Defaults    - System-wide default settings
│   ├── Clients     - Per-client configuration overrides
│   └── Advanced    - Rate limits, storage, etc.
├── Audit           - Administrative action history
├── Users           - User management
│   ├── Active      - Current users and permissions
│   ├── Add User    - Create new accounts
│   └── Roles       - Permission management
└── Settings        - User preferences, API keys, etc.
```

---

## Page Specifications

### 1. Dashboard Page

#### Key Metrics Cards
```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Total Clients │ │ Pending Approval│ │  Active Today   │ │ System Health   │
│       156       │ │        3        │ │       142       │ │      OK         │
│    (+5 today)   │ │   (Need action) │ │  (last 24h)     │ │   All systems   │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### Recent Activity Feed
- **Client registrations** - New clients requesting approval
- **System events** - Configuration changes, errors, alerts
- **Usage milestones** - High token usage, cost thresholds
- **Admin actions** - Recent administrative operations

#### System Status Overview
```
Server Core:        Healthy      (Uptime: 15d 4h 32m)
Admin Storage:      Connected    (PostgreSQL 16.1)
Token Storage:      Connected    (InfluxDB 2.7)
Ingestion Rate:     1,245/hour   (Normal)
Error Rate:         0.3%         (Acceptable)
```

#### Quick Actions
- **Approve pending clients** - One-click approval for trusted hosts
- **View critical alerts** - Jump to issues requiring attention
- **Export daily report** - Download yesterday's usage summary

---

### 2. Client Management Pages

#### 2.1 Clients Overview
```
┌─ Client Status ──────────────────────────────────────────────────┐
│ Filters: [All Status v] [Last 7 Days v] [Search hostname...]    │
├──────────────────────────────────────────────────────────────────┤
│ Hostname         │ Status     │ Last Seen │ Worker   │ Files Today│
│ web-server-01    │ Active     │ 2m ago    │ Running  │ 15         │
│ laptop-dev       │ Active     │ 5m ago    │ Running  │ 3          │
│ cloud-vm-prod    │ Offline    │ 2h ago    │ Stopped  │ 0          │
│ new-client-vm    │ Pending    │ 1h ago    │ Pending  │ 0          │
│ blocked-host     │ Rejected   │ 3d ago    │ N/A      │ 0          │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Real-time status** - WebSocket updates for live data
- **Bulk operations** - Select multiple clients for batch approval
- **Filtering & search** - Find clients by status, hostname, date range
- **Export capability** - Download client list as CSV/JSON

#### 2.2 Client Details Modal/Page
```
┌─ Client: web-server-01 ──────────────────────────────────────────┐
│ Status: Active (Approved by user on 2026-02-08)            │
│                                                                  │
│ System Information:                                              │
│   OS: Linux (Ubuntu 24.04)                                       │
│   Architecture: x86_64                                           │
│   Launcher: v1.0.0                                               │
│   Worker: v1.0.1                                                 │
│                                                                  │
│ Statistics (Last 30 Days):                                       │
│   Total Uploads: 456                                             │
│   Total Records: 125,847                                         │
│   Last Upload: 2026-02-09T08:45:00Z                              │
│   Directories Monitored: 5                                       │
│                                                                  │
│ Recent Activity:                                                 │
│   2026-02-09 08:45 - Uploaded usage.jsonl (1,205 records)        │
│   2026-02-09 07:45 - Heartbeat received                          │
│   2026-02-09 06:45 - Worker updated to v1.0.1                    │
│                                                                  │
│ Actions: [Suspend Client] [Reset Stats] [View Logs] [Configure]  │
└──────────────────────────────────────────────────────────────────┘
```

#### 2.3 Client Approval Workflow
```
┌─ Pending Approval: new-client-vm ───────────────────────────────┐
│ Requesting approval: 2026-02-09T08:30:00Z (29 minutes ago)      │
│                                                                  │
│ Client Information:                                              │
│   Hostname: new-client-vm                                        │
│   IP Address: 192.168.1.100                                      │
│   System: Linux (Ubuntu 24.04 LTS)                               │
│   Versions: Launcher v1.0.0, Worker v1.0.1                       │
│                                                                  │
│ Risk Assessment:                                                 │
│   [OK] Known internal IP range                                   │
│   [OK] Standard Ubuntu LTS platform                              │
│   [OK] Latest client versions                                    │
│   [WARN] New hostname (not seen before)                          │
│                                                                  │
│ Notes: [Optional approval notes...]                              │
│                                                                  │
│ Actions: [Approve] [Reject] [Skip for now]                       │
└──────────────────────────────────────────────────────────────────┘
```

---

### 3. Analytics Pages

#### 3.1 Usage Overview
```
┌─ Token Usage Overview ───────────────────────────────────────────┐
│ Time Range: [Last 30 Days v]                    Total: $1,247.83 │
│                                                                  │
│     Usage Trend (Last 30 Days)                                   │
│ $50 ┌─────────────────────────────────────────────────────────┐  │
│     │                                                    **   │  │
│ $40 │                                           **    ***     │  │
│     │                                    **  **               │  │
│ $30 │                          **    ***                      │  │
│     │                 **    ***                               │  │
│ $20 │        **    ***                                        │  │
│     │   *****                                                 │  │
│ $10 │***                                                      │  │
│  $0 └─────────────────────────────────────────────────────────┘  │
│     Jan 10    Jan 17    Jan 24    Jan 31    Feb 7    Feb 14      │
└──────────────────────────────────────────────────────────────────┘

┌─ Top Services ───┐ ┌─ Top Models ────┐ ┌─ Top Clients ───────┐
│ OpenAI    $687   │ │ GPT-4     $456  │ │ web-server-01 $412  │
│ Anthropic $324   │ │ Claude-3  $298  │ │ cloud-vm-prod $298  │
│ Azure AI  $187   │ │ GPT-3.5   $178  │ │ laptop-dev    $156  │
│ Google    $49    │ │ Claude-2  $98   │ │ analytics-vm  $89   │
└──────────────────┘ └─────────────────┘ └─────────────────────┘
```

#### 3.2 Cost Analysis
- **Budget tracking** - Set monthly budgets with alerts
- **Cost breakdown** - By service, model, client, date
- **Trend analysis** - Growth rates, seasonality patterns
- **Forecasting** - Predict future costs based on trends

#### 3.3 Custom Reports
- **Report builder** - Drag-and-drop interface for custom analysis
- **Scheduled reports** - Daily/weekly/monthly automated reports
- **Export options** - CSV, PDF, JSON formats
- **Sharing** - Email reports to stakeholders

---

### 4. Configuration Management

#### 4.1 System Configuration (Sent to All Clients via Heartbeat)
```
┌─ Client Defaults ────────────────────────────────────────────────┐
│ All settings below are sent to clients via heartbeat response    │
│                                                                  │
│ Scanning Behavior:                                               │
│   Scan Enabled:           True                                   │
│   Scan Interval:          60 minutes                             │
│   Max File Age:           24 hours                               │
│   Max File Size:          10 MB                                  │
│   Worker Timeout:         30 seconds                             │
│   Max Concurrent Uploads: 3 files                                │
│                                                                  │
│ File Discovery:                                                  │
│   Linux Paths:            /var/log, /opt/*/logs, /home/*/logs    │
│   Windows Paths:          %APPDATA%/logs, %PROGRAMDATA%/logs     │
│   File Patterns:          *.jsonl, *token*.log, *usage*.log      │
│   Exclude Patterns:       *temp*, *cache*, *backup*              │
│                                                                  │
│ Communication:                                                   │
│   Heartbeat Interval:     60 minutes                             │
│   Retry Failed Uploads:   True (5min delay)                      │
│   Log Level:              Info                                   │
│                                                                  │
│ Updates:                                                         │
│   Auto-update Enabled:    True                                   │
│   Update Check Interval:  24 hours                               │
│                                                                  │
│ Server Settings:                                                 │
│   Auto-approve Clients:   False                                  │
│   Rate Limit (files/hr):  100                                    │
│   Max Clients:            1000                                   │
│                                                                  │
│ [Save Changes] [Reset to Defaults] [Push to All Clients]         │
└──────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Live updates** - Changes applied to all clients on next heartbeat
- **No client restarts** - Configuration updates seamlessly
- **Centralized control** - Manage thousands of clients from one interface

#### 4.2 Client-Specific Overrides (Delivered via Heartbeat)
```
┌─ Client Configuration Overrides ────────────────────────────────┐
│ Custom settings sent to specific clients via heartbeat           │
│ Search: [web-server...] [Add Override +]                         │
│                                                                  │
│ web-server-01: (Last heartbeat: 2m ago)                          │
│   Scan Interval: 30 minutes (Default: 60) <- More frequent      │
│   Max File Size: 50 MB (Default: 10) <- Larger logs             │
│   Log Level: Debug (Default: Info) <- Troubleshooting            │
│                                                                  │
│ analytics-vm: (Last heartbeat: 5m ago)                           │
│   Scan Enabled: False (Default: True) <- Maintenance mode        │
│   Custom Paths: ["/data/analytics/logs"] <- Special location     │
│                                                                  │
│ dev-laptop: (Last heartbeat: 1h ago)                             │
│   Heartbeat Interval: 10 minutes (Default: 60) <- Dev testing   │
│                                                                  │
│ [Edit Override] [Remove Override] [Test Delivery]                │
└──────────────────────────────────────────────────────────────────┘
```

**Configuration Delivery:**
- **Real-time updates** - Changes sent on next client heartbeat
- **Status visibility** - See when each client received updates
- **Override preview** - View exact config each client receives
- **Rollback capability** - Remove overrides to restore defaults

---

### 5. User Management

#### 5.1 Users Overview
```
┌─ Users ────────────────────────────────────────────────────┐
│ [Add User +] [Bulk Actions v]                                    │
├──────────────────────────────────────────────────────────────────┤
│ Username      │ Role         │ Last Login │ Status   │ Actions   │
│ user          │ SuperAdmin   │ 5m ago     │ Active   │ [Edit]    │
│ bob_admin     │ ClientManager│ 2h ago     │ Active   │ [Edit]    │
│ jane_readonly │ Viewer       │ 1d ago     │ Active   │ [Edit]    │
│ old_admin     │ SuperAdmin   │ 30d ago    │ Disabled │ [Enable]  │
└──────────────────────────────────────────────────────────────────┘
```

**User Roles & Permissions:**
```
SuperAdmin:
  Client Management: Approve, reject, delete, configure
  Configuration: Read, write, delete all settings
  User Management: Create, edit, delete users
  Audit Access: View all administrative actions
  System Control: Restart services, manage updates

ClientManager:
  Client Management: Approve, reject, configure
  Configuration: Read client settings, write overrides
  User Management: View users only
  Audit Access: View client-related actions

Viewer:
  Client Management: View only
  Configuration: Read only
  Analytics: Full access to usage reports
  Audit Access: View own actions
```

#### 5.2 Add/Edit User Modal
```
┌─ Create User ──────────────────────────────────────────────┐
│                                                                  │
│ Username: [bob_admin________________] (must be unique)           │
│ Password: [************************] (min 12 chars, complex)     │
│ Confirm:  [************************]                             │
│                                                                  │
│ Role: [ClientManager v]                                          │
│                                                                  │
│ Permissions (based on role):                                     │
│  [x] Approve/reject clients                                     │
│  [x] Configure client settings                                  │
│  [ ] Create users                                                │
│  [ ] Modify system configuration                                 │
│                                                                  │
│ [Cancel] [Create User]                                           │
└──────────────────────────────────────────────────────────────────┘
```

#### 5.3 Password Reset & Security
```
┌─ Security Settings ──────────────────────────────────────────────┐
│                                                                  │
│ Current Password: [***********************] (required)           │
│ New Password:     [***********************] (min 12 chars)       │
│ Confirm Password: [***********************]                      │
│                                                                  │
│ Password Strength: ========-- Strong                             │
│                                                                  │
│ Active Sessions:                                                 │
│   Current Session (Chrome on Windows) - expires in 14m           │
│   Mobile Session (Safari on iPhone) - expires in 2h              │
│   Old Session (Firefox on Linux) - expires in 5d                 │
│                                                                  │
│ [Revoke Other Sessions] [Change Password]                        │
└──────────────────────────────────────────────────────────────────┘
```

---

### 6. Audit Trail

#### Audit Log Viewer
```
┌─ Audit Trail ────────────────────────────────────────────────────┐
│ Filters: [All Actions v] [All Users v] [Last 7 Days v]          │
│                                                                  │
│ Timestamp           │ User        │ Action         │ Resource    │
│ 2026-02-09 09:45:23 │ user        │ Client Approve │ web-srv-01  │
│ 2026-02-09 09:30:15 │ user        │ Config Set     │ scan_interval│
│ 2026-02-09 08:15:47 │ user        │ Client Reject  │ suspicious-vm│
│ 2026-02-08 16:20:11 │ admin_bob   │ Admin Login    │ system      │
│                                                                  │
│ [View Details] [Export Log] [Download CSV]                       │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Detailed action logs** - Complete history of administrative changes
- **User attribution** - Track which admin performed each action
- **Filtering & search** - Find specific actions or time periods
- **Compliance reporting** - Generate audit reports for security reviews

---

## Technical Implementation

### API Integration

#### Authentication Behavior

The admin interface authenticates using JWT tokens with httpOnly refresh cookies:

1. **Login flow:**
   a. Send `POST /api/auth/login` with username and password (include credentials for cookie handling)
   b. On success, receive access token in response body and refresh token as httpOnly cookie
   c. Store access token in memory only (not localStorage — XSS protection)
   d. Update application auth state with user info and permissions

2. **Token refresh flow:**
   a. Send `POST /api/auth/refresh` with credentials (sends httpOnly cookie automatically)
   b. Receive new access token in response
   c. Update in-memory token

3. **Authenticated requests:**
   a. Include `Authorization: Bearer {access_token}` header on all API requests
   b. If a request returns 401 (unauthorized), attempt token refresh
   c. If refresh succeeds, retry the original request with the new token
   d. If refresh fails, redirect to login page

4. **Logout:**
   a. Clear in-memory access token
   b. Send `POST /api/auth/logout` with credentials to clear server-side refresh token
   c. Reset application auth state

#### API Client Behavior

The API client service wraps all server communication:

| API Operation | Method | Endpoint | Description |
|---------------|--------|----------|-------------|
| Get clients | POST | `/admin/clients` | List clients with filter criteria |
| Approve client | PUT | `/admin/clients/{id}/approve` | Approve a pending client (with optional notes) |
| Reject client | PUT | `/admin/clients/{id}/reject` | Reject a pending client |
| Get system status | GET | `/admin/status` | Current system health and metrics |
| Get config | GET | `/admin/config/{key}` | Read a configuration value |
| Set config | PUT | `/admin/config/{key}` | Update a configuration value |
| Get users | GET | `/admin/users` | List all users |
| Create user | POST | `/admin/users` | Create a new account |
| Update user status | PUT | `/admin/users/{username}/{enable\|disable}` | Enable or disable a user |
| Change password | PUT | `/admin/users/{username}/password` | Change user password (requires current password) |

**Error handling behavior:**
- 401 responses trigger automatic token refresh and retry
- Other error responses are propagated to the calling component for display
- Network errors show a connection-lost indicator with retry option

#### Real-time Updates (WebSocket)

The application maintains a WebSocket connection for live updates:

**Event Types:**

| Event | Payload | UI Action |
|-------|---------|-----------|
| `client_status_change` | Client info with new status | Update client list row, show notification |
| `new_client_registration` | New client info | Show notification badge, add to pending list |
| `system_alert` | Alert type, severity, message | Show toast notification, update dashboard |
| `config_change` | Changed config key and value | Refresh config display if on config page |

**Connection behavior:**
- Auto-reconnect with exponential backoff on disconnect
- Authenticate WebSocket connection using access token
- Batch UI updates to avoid excessive re-renders (throttle to ~1 update/second)

### State Management

The application maintains several state stores:

| Store | Contents | Update Triggers |
|-------|----------|-----------------|
| **Auth** | Current user, authentication status, permissions | Login, logout, token refresh |
| **Clients** | Client list, current filter, loading state, error state | API fetch, WebSocket events, filter changes |
| **Config** | Configuration items, loading state, unsaved changes flag | API fetch, user edits, save actions |
| **Users** | User list, loading state, error state | API fetch, create/update/delete actions |
| **UI** | Sidebar open/closed, notifications list, current page | User navigation, WebSocket events |

**Derived state examples:**
- Pending client count (derived from clients store, filtered by status)
- Active user count (derived from users store, filtered by enabled status)
- Has unsaved changes (derived from config store)

### Component Architecture

#### Component Hierarchy
```
App
├── Router
├── Layout
│   ├── Sidebar Navigation
│   ├── Header (user menu, notifications)
│   └── Main Content Area
│       ├── Dashboard
│       ├── ClientManagement
│       │   ├── ClientList
│       │   ├── ClientDetails
│       │   └── ApprovalQueue
│       ├── Analytics
│       │   ├── UsageOverview
│       │   ├── CostAnalysis
│       │   └── CustomReports
│       ├── Configuration
│       │   ├── SystemConfig
│       │   └── ClientOverrides
│       └── AuditTrail
├── Modals (client details, confirmation dialogs)
└── Notifications (toast messages, alerts)
```

---

## User Experience Features

### 1. Real-time Notifications

#### Notification Types
- **New client registrations** - Immediate notification with approval action
- **System alerts** - Critical errors, storage issues, high resource usage
- **Configuration changes** - Confirmation when settings are updated
- **Client status changes** - When clients go offline or encounter errors

#### Notification UI
```
┌─ Notifications ──────────────────────────────────────────────────┐
│ [!] New client "analytics-vm" is requesting approval    [2m ago] │
│ [!] Client "web-server-01" has been offline for 1 hour  [5m ago] │
│ [ok] Configuration updated: scan_interval = 30 min     [10m ago] │
│ [i] Daily usage report is ready for download            [1h ago] │
└──────────────────────────────────────────────────────────────────┘
```

### 2. Keyboard Shortcuts

#### Global Shortcuts
- **Ctrl+/** - Show help overlay with all shortcuts
- **Ctrl+K** - Quick command palette (search clients, navigate)
- **G D** - Go to Dashboard
- **G C** - Go to Clients page
- **G A** - Go to Analytics page

#### Context-specific Shortcuts
- **A** - Approve selected client (on approval page)
- **R** - Reject selected client (on approval page)
- **S** - Save configuration changes
- **Esc** - Close modals/overlays

### 3. Responsive Design

#### Breakpoints
- **Mobile** (320px-768px) - Essential functions, simplified navigation
- **Tablet** (768px-1024px) - Collapsible sidebar, touch-optimized
- **Desktop** (1024px+) - Full interface, keyboard shortcuts

#### Mobile Optimizations
- **Touch-friendly** - Larger buttons, gesture support
- **Simplified navigation** - Bottom tab bar instead of sidebar
- **Priority content** - Show most critical information first
- **Offline support** - Cache data for basic functionality

### 4. Accessibility

#### WCAG 2.1 AA Compliance
- **Keyboard navigation** - Full interface usable without mouse
- **Screen reader support** - Proper ARIA labels and roles
- **Color contrast** - 4.5:1 minimum contrast ratio
- **Focus indicators** - Clear visual focus indicators

#### Accessibility Features
- **High contrast mode** - Alternative color scheme option
- **Font size scaling** - Respect user's browser font size preferences
- **Reduced motion** - Honor prefers-reduced-motion setting
- **Alt text** - Descriptive alt text for all images and charts

---

## Security Considerations

### Authentication & Authorization

#### Admin Authentication (JWT + Admin Storage Backend)
- **User storage** - Users stored in admin storage plugin (same as client registry)
- **Password hashing** - bcrypt/scrypt with secure salt and work factor
- **JWT tokens** - Stateless authentication with role/permission claims
- **HttpOnly refresh cookies** - Secure token storage (XSS protection)
- **Automatic token refresh** - Seamless session extension
- **Role-based permissions** - Granular access control (approve, configure, audit)
- **Account management** - Create, disable, reset password via admin interface

#### API Security
- **CSRF protection** - Protect against cross-site request forgery
- **Content Security Policy** - Prevent XSS attacks
- **Secure headers** - HSTS, X-Frame-Options, etc.

### Data Protection

#### Client Data
- **Data minimization** - Only display necessary client information
- **Access logging** - Track which admins view sensitive data
- **Data retention** - Configurable retention policies for audit logs
- **Export controls** - Restrict data export capabilities by role

---

## Performance Optimization

### Frontend Performance

#### Bundle Optimization
- **Code splitting** - Load only necessary code for each page
- **Tree shaking** - Remove unused code from bundles
- **Lazy loading** - Load components and data on demand
- **Service worker** - Cache static assets and API responses

#### Runtime Performance
- **Virtual scrolling** - Efficient rendering of large client lists
- **Debounced search** - Reduce API calls during user input
- **Memoization** - Cache expensive computations and renders
- **WebSocket efficiency** - Batch updates and throttle UI updates

### API Efficiency
- **Pagination** - Load client data in pages, not all at once
- **Filtering on server** - Push filters to server to reduce data transfer
- **Response compression** - Use gzip/brotli compression
- **Caching strategies** - Cache static configuration and reference data

---

## Testing Strategy

### Frontend Testing

#### Unit Tests

| Test Scenario | Description | Validation |
|---------------|-------------|------------|
| Approval button click | Click approve on a pending client card | onApprove callback called with correct client ID |
| Client hostname display | Render a client card with known data | Hostname text visible in component |
| Loading state | Trigger data load | Loading indicator visible during fetch, hidden after |
| Error state | Simulate API error | Error message displayed to user |
| Permission gating | Render action button with insufficient role | Button disabled or hidden |
| Filter application | Apply status filter on client list | Only matching clients displayed |

#### Store/State Tests

| Test Scenario | Description | Validation |
|---------------|-------------|------------|
| Auth login | Call login with valid credentials | Auth state updated: isAuthenticated=true, user set |
| Auth logout | Call logout | Auth state reset, access token cleared |
| Client loading state | Trigger loadClients | loading=true during fetch, false after |
| Client error handling | Trigger loadClients with API failure | error set, loading=false, items unchanged |
| Config unsaved changes | Modify a config value | hasChanges=true |
| User list refresh | Create a user, then check list | New user appears in users list |

#### Integration / End-to-End Tests

| Test Scenario | Description | Validation |
|---------------|-------------|------------|
| Client approval workflow | Navigate to pending, approve a client | Client moves to active list, success message shown |
| Login and navigation | Log in, navigate to each main page | All pages render without errors |
| Configuration change | Modify a setting, save | Setting persisted, confirmation shown |
| User creation | Create a new user | User appears in users list with correct role |
| Audit trail | Perform an action, check audit page | Action appears in audit log |

### API Integration Testing
- **Mock API responses** - Test UI behavior with various API responses
- **Error scenarios** - Test error handling and recovery
- **Loading states** - Ensure proper loading indicators
- **Real-time updates** - Test WebSocket message handling

---

## Deployment

### Build Process

1. Install dependencies
2. Run production build (generates optimized static assets in `dist/` directory)
3. Output is a set of static files (HTML, JS, CSS) ready for any static hosting

### Environment Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_BASE_URL` | No | `http://localhost:7071/api` | Backend API endpoint |
| `WEBSOCKET_URL` | No | `ws://localhost:7071/ws` | WebSocket endpoint for real-time updates |
| `AUTH_PROVIDER` | No | `local` | Authentication provider (`local`, `oauth2`, `saml`) |
| `ANALYTICS_ENABLED` | No | `false` | Enable frontend analytics tracking |
| `FEATURE_FLAGS` | No | `{}` | JSON object of feature flag overrides |

### Deployment Options

#### Static Hosting (Recommended)
- **CDN deployment** - Azure CDN, Cloudflare, AWS CloudFront
- **Version management** - Blue-green deployments with rollback capability
- **Cache invalidation** - Automatic cache busting for new releases
- **API proxying** - Route `/api/*` to the backend service

#### Container Deployment (Optional)
- **Static file server** (e.g., nginx) serving the built assets
- **Environment isolation** - Separate dev/staging/prod environments
- **Custom domains** - HTTPS with managed certificates

---

## Future Enhancements

### Advanced Features
- **Dashboard customization** - Drag-and-drop widget arrangement
- **Advanced analytics** - Machine learning insights, anomaly detection
- **Integration APIs** - Webhooks for external system integration
- **Mobile app** - Native mobile app for critical functions

### Scalability Improvements
- **Micro-frontend architecture** - Split into independently deployable modules
- **Progressive Web App** - Offline capability and app-like experience
- **Multi-tenancy** - Support multiple organizations in single deployment
- **Internationalization** - Multi-language support for global deployments

---

This specification provides a comprehensive foundation for building a modern, user-friendly admin interface that makes managing the Tokenly system intuitive and efficient for administrators.
