# Pink Form

Schema-driven custom form system for client websites, designed as a Google Forms-like alternative with MongoDB as primary storage.

## Features

- Dynamic form rendering from `Module` schema
- Server-side submission validation and normalization
- MongoDB persistence for modules, submissions, and audit logs
- Basic anti-spam protections (honeypot + rate limiting)
- Admin MVP UI to create/edit form schemas
- Seed endpoint/script for first client production form

## Setup

1. Install dependencies:
   - `npm install`
   - `cd frontend && npm install`
2. Configure env:
   - Copy `.env.example` to `.env`
   - Set `MONGODB_URI`
3. Run backend API:
   - `npm run dev`
4. Run React frontend (in another terminal):
   - `npm run frontend:dev`

Server starts at `http://localhost:4000`.
Frontend dev server starts at `http://localhost:5173`.

## Routes

- `GET /admin/forms` -> Admin schema editor
- `GET /forms/:moduleId` -> Public form page
- `POST /api/modules` -> Create form module
- `PUT /api/modules/:id` -> Update form module
- `GET /api/modules/:id` -> Fetch form module
- `GET /api/modules` -> List form modules
- `POST /api/submissions` -> Submit form data
- `POST /api/seed/client-form` -> Seed first client form

## Quick Start (First Client Form)

1. Start backend + frontend dev servers.
2. Open `http://localhost:5173/admin/forms`
3. Click **Seed First Client Form**
4. Copy and open the displayed public form URL.

## Production Build

1. Build frontend:
   - `npm run build`
2. Start backend:
   - `npm start`

Express serves `frontend/dist` automatically in production mode.

## Data Model

- `Module`: stores form schema (`fields`, `settings`)
- `Submission`: stores normalized payload and metadata
- `AuditLog`: stores submission events
