# Pink SaaS

Multi-tenant SaaS platform with a Node.js gateway, independent backend services, MongoDB, and a Vite frontend.

## One-command setup & run (recommended)

After extracting the repository, run **a single command** from the project root:

```bash
npm run setup
```

This does everything for you:

1. Verifies Node.js `22.12.0`+ is installed.
2. Installs all dependencies for the root workspace, `shared`, `gateway`, every service under `services/*`, and `frontend` (and creates `.env` / `frontend/.env` from the examples).
3. Starts MongoDB automatically. If a local MongoDB is not installed, it downloads and runs a managed MongoDB instance (requires internet on first run). To use your own MongoDB instead, set `MONGO_URI` in `.env`.
4. Seeds the first administrator (Super Admin).
5. Starts the API gateway, all eight backend services, and the frontend together.

When it is ready, open <http://localhost:5173>. Press `Ctrl+C` to stop everything.

> Prerequisite: only **Node.js 22.12.0 or newer** must be installed beforehand. MongoDB and all other dependencies are handled by the command above.

## Manual setup

### Requirements

- Node.js `22.12.0` or newer
- npm `10` or newer
- MongoDB `7` or newer, running locally or available through `MONGO_URI`
- Windows, macOS, or Linux

Redis is optional for local development because `QUEUES_ENABLED=false` is the default in `.env.example`.

### First-time setup

From the repository root:

```bash
npm install
```

The root workspace automatically installs dependencies for `shared`, `gateway`, every service under `services/*`, and `frontend`. The `postinstall` setup also creates `.env`, `frontend/.env`, storage folders, and the frontend embed directory when they do not exist. Existing environment files are never overwritten.

Review `.env` and replace development secrets before using the application outside local development. Set `MONGO_URI` to your local or hosted MongoDB database.

## Seed the first administrator

Start MongoDB, then run:

```bash
npm run seed:super-admin
```

This command is safe to run repeatedly. It creates or updates the `PINKTECH` tenant, seeds the permission catalog, creates the `Super Admin` role, and creates or updates the administrator configured by `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in `.env`.

## Run the project

```bash
npm run dev
```

The development command starts the API gateway, all eight backend services, and the frontend together. It stops the other processes if one service fails.

Default local ports:

| Component | Port |
| --- | ---: |
| Frontend | `5173` |
| API gateway | `5001` |
| Auth service | `4001` |
| Platform service | `4002` |
| Organization service | `4003` |
| Forms service | `4004` |
| Workflow service | `4005` |
| KYC service | `4006` |
| Documents service | `4007` |
| Notifications service | `4008` |

Open `http://localhost:5173` in a browser. The frontend uses `VITE_API_BASE_URL=http://localhost:5001/api/v1` by default.

The pre-development check verifies Node.js, `.env`, `MONGO_URI`, and whether `mongod` is available on `PATH`. It does not start MongoDB automatically; use a local MongoDB service or a hosted MongoDB URI.

## Production start

Build the frontend and start the gateway and services with production environment variables:

```bash
npm run build:frontend
npm start
```

Use a process manager or container platform for production restarts, health checks, logs, and secret management. Do not use the development command as a production process manager.

## Quality and release checks

```bash
npm run release:check
```

This runs backend linting, frontend linting, Jest with enforced minimum coverage of 80% statements, lines, and functions plus a 60% branch floor, the frontend production build, and an npm audit that blocks high-severity production advisories.

Other useful commands:

```bash
npm test
npm run lint
npm run lint:frontend
npm run build:frontend
npm run audit:production
npm run test:detect-handles
```

## Environment files

- `.env.example` contains backend, gateway, service, MongoDB, email, and seed settings.
- `frontend/.env.example` contains browser API and frontend integration settings.
- Never commit `.env`, `frontend/.env`, passwords, JWT secrets, SMTP credentials, or cloud credentials.

## Troubleshooting

**`MONGO_URI` or secret validation fails:** run `npm install` to create `.env`, then edit it with a valid MongoDB URI and secrets of at least 16 characters for JWT keys.

**`mongod` is not found:** install MongoDB Community locally, start its service, or use a reachable hosted MongoDB URI. The application services still need network access to that database.

**A port is already in use:** change the corresponding `PORT` in `.env`, the service environment, or the frontend Vite configuration, then update `VITE_API_BASE_URL` if the gateway port changes.

**Windows PowerShell:** run the same npm commands from the repository root. `concurrently` handles process startup consistently across Windows, macOS, and Linux.
