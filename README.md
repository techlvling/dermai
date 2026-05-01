# tinkskin

AI-powered skin analysis. Upload photos of your face, get a science-backed routine with evidence-rated ingredients.

Live: [tinkskin.com](https://tinkskin.com)

---

## Quick Start

**Prerequisites:** Node.js 18+, an [OpenRouter](https://openrouter.ai/keys) API key (free tier works), a [Supabase](https://supabase.com) project (free tier, for auth + sync).

```bash
git clone https://github.com/techlvling/dermai.git
cd dermai/backend
npm install
cp .env.example .env          # fill in OPENROUTER_API_KEY + Supabase vars
npm start                     # http://localhost:3000
```

Open `http://localhost:3000` — the frontend is served by the same Express server.

See **[Supabase Setup](#supabase-setup)** below to enable Google sign-in.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Get free at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `SUPABASE_URL` | Yes (auth) | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes (auth) | Public anon key — safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (auth) | Secret service key — server only, never in frontend |
| `PORT` | No | Defaults to `3000` |

---

## Project Structure

```
dermai/
├── backend/
│   ├── server.js              # Express server — single entry point
│   ├── lib/
│   │   └── supabase.js        # Supabase admin client (server-only)
│   ├── middleware/
│   │   └── auth.js            # JWT verification middleware
│   ├── routes/
│   │   ├── scans.js           # GET/POST/DELETE /api/scans
│   │   ├── favorites.js       # GET/POST/DELETE /api/favorites
│   │   ├── routine.js         # GET/POST /api/routine
│   │   └── reactions.js       # GET/POST/DELETE /api/reactions
│   ├── data/
│   │   ├── ingredients.json   # Ingredient encyclopedia (~50 entries)
│   │   ├── products.json      # Product catalog
│   │   ├── concerns.json      # Evidence rationale per skin concern
│   │   └── conflicts.json     # Ingredient conflict rules
│   └── package.json
├── frontend/
│   ├── index.html             # Landing page
│   ├── analyze.html           # Upload + analysis flow
│   ├── recommendations.html   # Routine + gamification
│   ├── ingredients.html       # Ingredient encyclopedia
│   ├── shopping.html          # Saved products list
│   ├── history.html           # Past scan history
│   ├── login-callback.html    # OAuth redirect target
│   ├── css/
│   └── js/
│       ├── auth.js            # Supabase Auth wrapper (window.Auth)
│       ├── migration.js       # Auto-migrates localStorage to server on first login
│       └── storage.js         # Auth-aware storage (localStorage + server dual-write)
├── supabase/
│   └── migrations/
│       └── 0001_initial.sql   # Tables, RLS policies, profile trigger
├── DESIGN.md                  # Design system (Space Mono, brutalist tokens)
└── vercel.json                # Vercel deployment config
```

---

## Development

```bash
cd backend
npm run dev     # nodemon — auto-restarts on file changes
```

---

## API Endpoints

**Public (no auth required)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status |
| GET | `/api/health-ai` | AI connection test |
| POST | `/api/analyze` | Skin analysis (field: `images`, up to 3 files) |
| GET | `/api/ingredients` | Ingredient encyclopedia |
| GET | `/api/concerns` | Concern evidence database |
| GET | `/api/conflicts` | Ingredient conflict rules |
| GET | `/api/products` | Product catalog |

**Authenticated (Bearer JWT required)**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scans` | List scan history (newest first, limit 50) |
| POST | `/api/scans` | Save a scan result |
| DELETE | `/api/scans/:id` | Delete a scan |
| GET | `/api/favorites` | List saved product IDs |
| POST | `/api/favorites` | Add a favorite (`{ product_id }`) |
| DELETE | `/api/favorites/:productId` | Remove a favorite |
| GET | `/api/routine` | Last 90 days of routine logs |
| POST | `/api/routine` | Upsert a routine log (`{ log_date, am_done, pm_done }`) |
| GET | `/api/reactions` | List product reactions |
| POST | `/api/reactions` | Add/update a reaction (`{ product_id, severity, notes }`) |
| DELETE | `/api/reactions/:productId` | Remove a reaction |

### Example: analyze request

```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "images=@front.jpg" \
  -F "images=@left.jpg" \
  -F "images=@right.jpg"
```

Response:
```json
{
  "overallHealth": 72,
  "skinType": "Combination",
  "concerns": [
    { "name": "Acne", "severity": 65, "description": "Active breakouts on forehead." }
  ]
}
```

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set all four env vars in Vercel → Project → Settings → Environment Variables (Production + Preview):

```
OPENROUTER_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Also add your Vercel preview and production URLs to the Google OAuth client's Authorized Redirect URIs (see [Supabase Setup](#supabase-setup)).

---

## Supabase Setup

Phase 1 adds Google sign-in and cross-device sync via Supabase (free tier).

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New project → free tier is fine.

### 2. Enable Google OAuth

In the Supabase dashboard: **Authentication → Providers → Google → Enable**.

You'll need a Google Cloud Console OAuth client (one-time, ~5 min):
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → **Create OAuth Client ID** (Web application).
2. Add these **Authorized Redirect URIs**:
   - `http://localhost:3000/login-callback.html`
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - `https://<your-vercel-domain>.vercel.app/login-callback.html`
3. Paste the **Client ID** and **Client Secret** into the Supabase Google provider settings.

### 3. Run the database migration

In the Supabase dashboard → **SQL Editor**, paste and run `supabase/migrations/0001_initial.sql`.

Or with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push
```

### 4. Add environment variables

Copy `backend/.env.example` to `backend/.env` and fill in the three Supabase values from **Settings → API** in your Supabase project dashboard.

### 5. Update `frontend/js/auth.js`

Replace the two placeholder values at the top of the file:

```js
const SUPABASE_URL     = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

with your actual project URL and anon key. The anon key is safe to expose in frontend code. The service role key must stay server-side only.

> **Note:** Supabase free projects auto-pause after 7 days of inactivity. Resume from the dashboard (Paused Projects → Resume).

---

## Tech Stack

- **Backend:** Node.js, Express 5, OpenRouter (vision AI — Qwen 2.5 VL → Llama 3.2 Vision → GPT-4o mini fallback chain)
- **Auth:** Supabase Auth (Google OAuth), JWT verification middleware
- **Database:** Supabase Postgres with Row Level Security (scans, favorites, routine, reactions)
- **Frontend:** Vanilla JS, no framework, no bundler
- **Storage:** Hybrid — Supabase Postgres for structured data, `localStorage` + IndexedDB for offline/photos
- **Design:** Space Mono, minimal brutalist — see `DESIGN.md`
