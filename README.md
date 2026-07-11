# Nutribuddy AI

One search, every delivery app. Users prompt their nutrition goals in natural
language ("high protein low carb", "under 400 cal") and Nutribuddy's AI finds
the exact dishes across delivery platforms (Uber Eats, DoorDash, partner
catalogs), then hands off to the platform to order.

## 🚀 Quick Start

### Backend

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt          # runtime deps
pip install -r requirements-dev.txt      # pytest + httpx (tests)
cp .env.example .env                     # fill in your API keys
python scripts/seed_fixtures.py          # load Uber Eats + DoorDash + BiteRush catalogs
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd frontend
yarn install
cp .env.example .env
yarn start                               # http://localhost:3000
```

## 🏗️ Architecture

```
fixtures / Apify exports ──connectors──▶ normalize (price, currency, platform)
                                            │
                              GPT-4o nutrition estimation (ingest-time only)
                                            │
                          SQLite (source of truth) + Pinecone (vectors)

user query ─▶ /api/search ─▶ embed query ─▶ Pinecone top-50 (platform filter)
           ─▶ local nutrition filters (protein/carb/calorie, no LLM)
           ─▶ SQLite batch fetch ─▶ ranked results + rule-based explanations
```

Search latency stays sub-second because the only network hop at query time is
one query-embedding call — filtering, ranking, and explanations are all local.

## 📁 Project Structure

```
backend/
├── connectors/        # Platform connectors (contract: connectors/base.py)
│   └── fixture_connector.py   # POC data source; live Apify slots in later
├── data/fixtures/     # Checked-in normalized catalogs (ubereats, doordash, biterush)
├── models/            # Pydantic models (Recipe: price=major units + ISO currency)
├── routes/            # API endpoints
├── scripts/           # build_fixtures.py, seed_fixtures.py
├── services/          # search pipeline, SQLite, Pinecone, OpenAI
├── tests/             # pytest suite (no network needed)
└── server.py          # FastAPI app
frontend/
└── src/
    ├── components/    # RecipeCard, UpgradeModal, shadcn ui/
    ├── lib/           # formatPrice, orderLink, searchQuota
    └── pages/         # HomePage
docs/
└── monetization.md    # subscription design note
```

## 🔌 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Liveness + DB count |
| GET | `/api/stats` | — | DB/platform counts + vector store stats |
| POST | `/api/search` | — | AI search; body: `{query, source_platform?, restaurant_name?}` |
| GET | `/api/recipes` | — | List items |
| GET | `/api/recipes/{id}` | — | Get one item |
| POST | `/api/ingest/items` | admin† | Bulk-ingest normalized items (per-source replace) |
| POST | `/api/ingest/url` | admin† | Import an Apify Uber Eats Excel export URL |
| DELETE | `/api/recipes/clear` | admin† | Nuke everything (the only cross-platform wipe) |

† When `ADMIN_API_TOKEN` is set, these require a matching `X-Admin-Token`
header; unset = open for local dev.

### Search example

```bash
curl -X POST http://localhost:8001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "high protein low carb dinner", "source_platform": "ubereats"}'
```

## 💰 Data Contracts

- **Price**: MAJOR currency units (`12.99` = $12.99), rounded to 2dp at the
  ingestion boundary. Connectors normalize; nothing downstream converts.
- **Currency**: ISO 4217 uppercase, stamped explicitly per source — never
  guessed. Unknown currency renders as a bare number in the UI.
- **source_platform**: `ubereats | doordash | biterush | manual`. Ingestion
  replaces per-source: re-pushing one platform's catalog never touches another's.

## 🧪 Tests

```bash
cd backend && ./venv/bin/python -m pytest tests/ -q
```

The suite covers the nutritional filter/ranking logic, calorie-limit parsing,
price normalization, schema migration, per-source replace semantics, the admin
guard, and every checked-in fixture's contract. No network required.

## 📝 Environment Variables

See [backend/.env.example](backend/.env.example) and
[frontend/.env.example](frontend/.env.example) for the full annotated list.
Required: `OPENAI_API_KEY`, `PINECONE_API_KEY`.

## 🗺️ Product Direction

The standalone multi-platform subscription app is being built POC-first from
checked-in fixture data (real scraped Uber Eats catalog + contract-shaped
DoorDash sample) while official Uber Eats / DoorDash developer API applications
are pending. Monetization is a stubbed free-tier paywall — see
[docs/monetization.md](docs/monetization.md).
