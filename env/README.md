## Frontend Environment Configuration (Vite)

Create a `.env` file in the `Frontend/client` folder (same level as `package.json`), and set:

VITE_BACKEND_URL=https://your-backend-domain.com

Vite exposes variables prefixed with `VITE_` to the browser at build time.

This project reads:
- VITE_BACKEND_URL (base backend origin)
- VITE_API_BASE_URL (optional override, defaults to `${VITE_BACKEND_URL}/api`)
- VITE_DOWNLOAD_BASE_URL (optional override, defaults to `${VITE_BACKEND_URL}/downloads`)

Example values are in `env/.env.example`.
