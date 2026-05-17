# UpSpring Operations Dashboard (React + FastAPI + Supabase Postgres)

The app now uses a dedicated Python FastAPI backend for all business logic and data access.

## Architecture

- Frontend: React/Vite (`Frontend/src/`)
- Backend: FastAPI (`Backend/app/`)
- Database: Supabase Postgres (existing schema/migration)
- Harvest sync: handled by FastAPI (`POST /api/v1/sync/harvest`)

## Environment Variables

### Frontend (`Frontend/.env.local`)

```bash
VITE_API_BASE_URL=http://localhost:8000
```

### Backend (`Backend/.env`)

```bash
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/postgres
APP_CORS_ORIGINS=http://localhost:8080

HARVEST_TOKEN=<harvest_personal_access_token>
HARVEST_ACCOUNT_ID=<harvest_account_id>
HARVEST_USER_AGENT_EMAIL=<email_for_user_agent_header>
```

## API Endpoints

- `GET /api/v1/health`
- `GET /api/v1/overview`
- `GET /api/v1/departments/{department_id}`
- `GET /api/v1/clients`
- `GET /api/v1/clients/{client_number}`
- `GET /api/v1/employees`
- `PUT /api/v1/employees/cost-rates`
- `GET /api/v1/settings/harvest`
- `PUT /api/v1/settings/project-mapping`
- `PUT /api/v1/settings/financial-overrides`
- `POST /api/v1/sync/harvest`

## Run Locally

```bash
# frontend
cd Frontend
npm run dev

# backend
cd ../Backend
python -m uvicorn app.main:app --reload --port 8000
```

## Notes

- Harvest integration remains GET-only.
- Existing Supabase migration remains at `Backend/supabase/migrations/202605080001_harvest_bootstrap.sql`.
- Old TypeScript transform and Edge Function sync code paths were removed in favor of FastAPI services.
