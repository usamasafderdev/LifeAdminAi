# LifeAdmin AI deployment requirements

## Frontend

- `VITE_API_BASE_URL`: public backend API URL ending in `/api`.
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth web client ID.

Build with `npm run build` and serve `dist/` through an HTTPS-capable static host.

## Backend

- `PORT`: API listen port.
- `NODE_ENV`: use `production` when deployed.
- `MONGODB_URI`: reachable persistent MongoDB deployment.
- `JWT_SECRET`: long, randomly generated secret.
- `JWT_EXPIRES_IN`: token lifetime, for example `7d`.
- `CLIENT_URL`: exact frontend origin allowed by CORS.
- `GOOGLE_CLIENT_ID`: same authorized Google web client used by the frontend.
- `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`: AI provider configuration. Missing AI credentials do not prevent non-AI API startup, but analysis remains unavailable.
- Optional `AI_DOCUMENT_*` and `AI_MAX_*` values tune bounded long-document processing; safe defaults are shown in `server/.env.example`.

The `server/uploads` directory must be persistent, private, writable by the API process, and backed up with the database. It must not be served as a public static directory. In multi-instance deployment, replace local upload storage with an equivalent private shared object store before scaling horizontally.

Configure the deployed frontend origin in Google OAuth Authorized JavaScript origins. Use HTTPS for both frontend and API and restrict MongoDB network access to the backend.
