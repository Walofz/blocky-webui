# Blocky WebUI

A management web interface for [Blocky](https://0xerr0r.github.io/blocky/) — a fast and lightweight DNS proxy with ad-blocking capabilities. Manage ads profiles, client groups, custom DNS records, and monitor realtime query logs, all from a clean React UI.

---

## Features

| Page | Description |
|------|-------------|
| **Dashboard** | Query stats, block rate, top blocked domains, top clients, timeline chart (1h/24h/7d), group health, system status |
| **Ads Profiles** | Named profiles mapping to one or more blocklist URLs |
| **Groups** | Client groups mapped to an ads profile (by client IP/range) |
| **Custom DNS** | Manage A, AAAA, CNAME records with validation (CNAME loop detection) |
| **Realtime Logs** | SSE-streamed DNS query log with domain/client/group/action filters and quick-allowlist action |

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+, TypeScript, Express 4, js-yaml, Zod |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, Recharts |
| Config | YAML files (`config/config.yaml`, `config/custom.yaml`) |

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
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |

---

## Integrating with a Live Blocky Instance

1. Set `BLOCKY_URL` to your Blocky server's HTTP API address:
   ```bash
   BLOCKY_URL=http://192.168.1.1:4000 npm run dev
   ```

2. The backend will call `POST /api/config/reload` on Blocky after every save.

3. **Config generation**: The current WebUI saves `custom.yaml` which is *separate* from the format Blocky reads. To bridge the gap, you need a small script (or a future WebUI feature) that converts `custom.yaml` into Blocky's native `blocking.blackLists`, `blocking.clientGroupsBlock`, and `customDNS.mapping` fields and writes them into `config.yaml` (or a merged file). A reference converter will be added in a follow-up.

4. **Log ingestion**: The log stream currently uses simulated demo data. To receive real Blocky logs:
   - Configure Blocky with `logFile: /var/log/blocky/query.log`
   - Add a log-tail service that reads the file and calls the backend's internal append endpoint, *or*
   - Parse Blocky's structured log format and push entries via a POST to `/api/logs/ingest` (endpoint scaffold is ready to be wired up)

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
│   │   │   └── logService.ts     # Ring buffer + SSE broadcaster
│   │   └── middleware/
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
| GET | `/events/logs` | SSE stream (same query params for server-side filtering) |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Full dashboard payload |

---

## Next Steps

- [ ] Write a converter script (`config/generate-blocky-config.ts`) that merges `custom.yaml` into `config.yaml` in Blocky's native format
- [ ] Add a log ingestion endpoint that receives parsed Blocky log lines
- [ ] Add authentication (basic auth or token-based)
- [ ] Persist logs to SQLite for historical queries
- [ ] Add export / import of `custom.yaml`
- [ ] Dark mode support
