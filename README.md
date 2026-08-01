# Blocky WebUI

A management web interface for [Blocky](https://0xerr0r.github.io/blocky/) — a fast and lightweight DNS proxy with ad-blocking capabilities. Manage ads profiles, client groups, custom DNS records, and monitor realtime query logs, all from a clean React UI.

---

## Features

| Page | Description |
|------|-------------|
| **Dashboard** | Query stats, block rate, top blocked domains, top clients, timeline chart (1h/24h/7d), group health, system status |
| **Ads Profiles** | Named profiles mapping to Blocky definitions (URL/path/domain/regex/inline), selectable as blocklist or allowlist |
| **Groups** | Client groups mapped to one or more ads profiles (by client IP/range) |
| **Custom DNS** | Manage A, AAAA, CNAME records with validation (CNAME loop detection) |
| **Realtime Logs** | SSE-streamed DNS query log with domain/client/group/action filters and quick-allowlist action |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, TypeScript, Express 4, js-yaml, Zod |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, Recharts, nginx |
| Config | YAML files (`config/config.yaml`, `config/custom.yaml`) |
| Container | Docker + Docker Compose |

---

## Docker (Recommended)

### Architecture

```
┌─── Host network ────────────────────────────┐
│  [blocky]  port 53 (DNS) + 4000 (HTTP API)  │
│     ↑ reads config.generated.yaml           │
│     ↑ restarted by backend on config save   │
└─────────────────────────────────────────────┘
         ↑ host.docker.internal:4000
┌─── Bridge network ──────────────────────────┐
│  [backend]  :4000  shared ./config volume   │
│      ↕ writes custom.yaml + generated yaml  │
│  [frontend] :80    proxies /api + /events   │
└─────────────────────────────────────────────┘
        ↑ port 80 exposed to host
```

Blocky runs with `network_mode: host` so it binds port 53 and sees **real client IPs**. The WebUI backend and frontend run in a normal bridge network and reach Blocky's HTTP API via `host.docker.internal` (mapped automatically by the `extra_hosts: host-gateway` entry).

### Quick start

```bash
# 1. Clone the project
git clone https://github.com/Walofz/blocky-webui
cd blocky-webui

# 2. Generate the initial Blocky config from the sample custom.yaml
cd backend && npm install && npm run generate && cd ..

# 3. (Optional) configure environment
cp .env.example .env   # edit WEBUI_PORT if needed

# 4. Build and run everything
docker compose up -d --build
```

Open **http://localhost** in your browser.

> **First time?** The `npm run generate` step is needed once to create `config/config.generated.yaml` before Blocky starts. After that, the WebUI regenerates it automatically on every save.

### Environment variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `BLOCKY_URL` | `http://host.docker.internal:4000` | Blocky HTTP API — no change needed for this compose setup |
| `WEBUI_PORT` | `80` | Host port to expose the frontend on |
| `CORS_ORIGIN` | `http://localhost` | CORS origin for the backend |
| `WEBUI_AUTH_TOKEN` | *(unset)* | Optional shared API token. When set, backend requires auth and frontend sends the token automatically |

### Services

| Service | Network | Exposed ports |
|---------|---------|---------------|
| `blocky` | host | 53/UDP+TCP (DNS), 4000/TCP (HTTP API) |
| `backend` | bridge (internal) | — |
| `frontend` | bridge | `WEBUI_PORT` → 80 |

### Full save flow

```
UI save
  → POST /api/...
  → validate (Zod + cross-field)
  → write custom.yaml  (atomic)
  → generate config.generated.yaml  (auto, same process)
  → restart the `blocky` container via the Docker socket
  → Blocky starts with the new config
```

> Blocky has **no config-reload HTTP endpoint**, so the backend restarts the
> container through `/var/run/docker.sock` (mounted in `docker-compose.yml`).
> Without the socket, it falls back to `POST /api/lists/refresh` (blocklists
> only — other config changes then require a manual `docker compose restart blocky`).

---

## Prerequisites

- **Node.js 18+** (or later)
- npm 9+ (comes with Node 18)

---

## Setup & Run

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

Backend runs at **http://localhost:4000**.

> In demo mode (no `BLOCKY_URL` set), the backend generates fake log entries every ~1 second so you can explore the UI without a live Blocky instance.

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

Frontend runs at **http://localhost:3000** and proxies `/api` and `/events` to the backend.

### 4. Open the UI

Navigate to **http://localhost:3000** in your browser.

---

## Configuration Files

| File | Purpose |
|------|---------|
| `config/config.yaml` | **Static** Blocky server config. Edit manually; restart Blocky to apply. |
| `config/custom.yaml` | **UI-managed** config. Written atomically by the backend on each save. Do not edit while the WebUI is running. |

### Custom config location

The backend looks for config files relative to its working directory (`../config` by default). Override with the `CONFIG_DIR` environment variable:

```bash
CONFIG_DIR=/etc/blocky npm run dev
```

---

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Backend HTTP port |
| `CONFIG_DIR` | `../config` | Directory containing `config.yaml` / `custom.yaml` |
| `BLOCKY_URL` | *(unset)* | Base URL of live Blocky HTTP API (e.g. `http://192.168.1.1:4000`). When unset, demo mode activates. |
| `BLOCKY_CONTAINER` | `blocky` | Name of the Blocky Docker container to restart when config changes |
| `DOCKER_SOCK` | `/var/run/docker.sock` | Docker socket used to restart Blocky. If unavailable, falls back to `POST /api/lists/refresh`. |
| `LOG_DIR` | `$CONFIG_DIR/logs` | Directory where Blocky writes its CSV query log files (tailed for realtime logs) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `AUTH_TOKEN` | *(unset)* | Optional bearer token required for `/api/*` and `/events/*` when set |

### Authentication (token-based)

Set `WEBUI_AUTH_TOKEN` in the project `.env` file when using Docker Compose. Compose passes it to:
- backend as `AUTH_TOKEN`
- frontend build as `VITE_AUTH_TOKEN`

When enabled:
- API requests must include `Authorization: Bearer <token>` (frontend does this automatically)
- SSE requests to `/events/logs` use `?token=<token>` (frontend does this automatically)

---

## Integrating with a Live Blocky Instance

1. Set `BLOCKY_URL` to your Blocky server's HTTP API address:
   ```bash
   BLOCKY_URL=http://192.168.1.1:4000 npm run dev
   ```

2. After every save the backend restarts the Blocky container (`BLOCKY_CONTAINER`, via the Docker socket) so it picks up `config.generated.yaml`. Without a Docker socket, it calls `POST /api/lists/refresh` instead — then restart Blocky manually to apply group/DNS changes.

3. **Config generation**: On every save the backend converts `custom.yaml` into Blocky's native `blocking.denylists` / `blocking.allowlists`, `blocking.clientGroupsBlock`, and `customDNS` fields and merges them with `config.yaml` into `config.generated.yaml` (`backend/src/generate-blocky-config.ts`, also available as `npm run generate`). Ads profile list entries are passed through as Blocky definitions (for example URL, file path, inline YAML literal content, regex, or domain).

4. **Log ingestion**: When `BLOCKY_URL` is set, the backend tails Blocky's CSV query log files and streams real entries to the UI:
   - Blocky is configured with `queryLog: { type: csv, target: /app/config/logs, flushInterval: 5s }` (see `config/config.yaml`) — it writes one tab-separated file per day (`YYYY-MM-DD_ALL.log`) into the shared `./config/logs` directory, flushing every 5 seconds
   - The backend creates the `logs` directory world-writable, because Blocky's Docker image runs as a non-root user (uid 100) and must be able to create files in it
   - The backend polls the newest file every second, parses appended lines and pushes them to the SSE stream (`backend/src/services/logIngest.ts`)
   - Override the watched directory with the `LOG_DIR` environment variable if your Blocky writes logs elsewhere
   - Without `BLOCKY_URL`, demo mode keeps generating fake entries

---

## Project Structure

```
blocky-webui/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express app entry
│   │   ├── config/
│   │   │   ├── schema.ts         # Zod schemas + cross-field validation
│   │   │   └── loader.ts         # YAML read/write (atomic)
│   │   ├── routes/
│   │   │   ├── adsProfiles.ts    # CRUD for ads profiles
│   │   │   ├── groups.ts         # CRUD for groups
│   │   │   ├── dns.ts            # CRUD for DNS records
│   │   │   ├── logs.ts           # Log query + SSE stream
│   │   │   └── dashboard.ts      # Aggregated dashboard data
│   │   ├── services/
│   │   │   ├── blockyService.ts  # Reload hook + status check
│   │   │   ├── logIngest.ts      # Tails Blocky's CSV query log (real mode)
│   │   │   └── logService.ts     # Ring buffer + SSE broadcaster
│   │   └── middleware/
│   │       ├── auth.ts           # Optional token auth for API + SSE
│   │       └── errorHandler.ts   # Zod + ValidationError handler
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Router
│   │   ├── main.tsx              # Entry
│   │   ├── index.css             # Tailwind + component styles
│   │   ├── api/client.ts         # Axios API client + types
│   │   ├── hooks/useLogStream.ts # SSE EventSource hook
│   │   ├── components/
│   │   │   ├── Layout.tsx        # App shell
│   │   │   └── Sidebar.tsx       # Navigation
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── AdsProfiles.tsx
│   │       ├── Groups.tsx
│   │       ├── CustomDNS.tsx
│   │       └── Logs.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── config/
│   ├── config.yaml               # Static Blocky config
│   └── custom.yaml               # UI-managed config (sample data included)
└── README.md
```

---

## API Reference

### Ads Profiles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/ads-profiles` | List all profiles |
| GET | `/api/ads-profiles/:name` | Get one profile |
| POST | `/api/ads-profiles` | Create profile |
| PUT | `/api/ads-profiles/:name` | Update profile |
| DELETE | `/api/ads-profiles/:name` | Delete profile |

### Groups
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:name` | Update group |
| DELETE | `/api/groups/:name` | Delete group |

### DNS Records
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dns?type=A&domain=x` | List / filter records |
| POST | `/api/dns` | Create record |
| PUT | `/api/dns/:type/:domain` | Update record |
| DELETE | `/api/dns/:type/:domain` | Delete record |

### Logs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/logs` | Recent logs (query params: domain, clientIP, group, action, limit) |
| GET | `/events/logs` | SSE stream (same query params for server-side filtering, plus `token` when auth is enabled) |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Full dashboard payload |

---

## Next Steps

- [ ] ~~Write a converter script (`config/generate-blocky-config.ts`)~~ ✅ `backend/src/generate-blocky-config.ts` — run with `npm run generate`
- [ ] ~~Add real log ingestion~~ ✅ backend tails Blocky's CSV query log (`queryLog.type: csv`) when `BLOCKY_URL` is set
- [x] ~~Add authentication (basic auth or token-based)~~ ✅ token-based auth via `AUTH_TOKEN` / `WEBUI_AUTH_TOKEN`
- [ ] Persist logs to SQLite for historical queries
- [ ] Add export / import of `custom.yaml`
- [ ] Dark mode support
