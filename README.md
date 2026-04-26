# DermAI

AI-powered skin analysis. Upload photos of your face, get a science-backed routine with evidence-rated ingredients.

Live: [dermai-livid.vercel.app](https://dermai-livid.vercel.app)

---

## Quick Start

**Prerequisites:** Node.js 18+, an [OpenRouter](https://openrouter.ai/keys) API key (free tier works).

```bash
git clone https://github.com/techlvling/dermai.git
cd dermai/backend
npm install
cp .env.example .env          # then fill in your OPENROUTER_API_KEY
npm start                     # http://localhost:3000
```

Open `http://localhost:3000` — the frontend is served by the same Express server.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | Get free at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `PORT` | No | Defaults to `3000` |

---

## Project Structure

```
dermai/
├── backend/
│   ├── server.js          # Express server — single entry point
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
│   ├── css/
│   └── js/
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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status |
| GET | `/api/health-ai` | AI connection test |
| POST | `/api/analyze` | Skin analysis (field: `images`, up to 3 files) |
| GET | `/api/ingredients` | Ingredient encyclopedia |
| GET | `/api/concerns` | Concern evidence database |
| GET | `/api/conflicts` | Ingredient conflict rules |
| GET | `/api/products` | Product catalog |

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

Set `OPENROUTER_API_KEY` in the Vercel dashboard under Project → Settings → Environment Variables.

---

## Tech Stack

- **Backend:** Node.js, Express 5, OpenRouter (vision AI — Qwen 2.5 VL → Llama 3.2 Vision → GPT-4o mini fallback chain)
- **Frontend:** Vanilla JS, no framework, no bundler
- **Storage:** `localStorage` + IndexedDB (no database, no auth)
- **Design:** Space Mono, minimal brutalist — see `DESIGN.md`
