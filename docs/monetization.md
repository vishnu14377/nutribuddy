# Monetization Design Note

Status: **design only** — the shipped paywall is a client-side UX stub. No payment
code exists, and none should be written until the build triggers below fire.

## Tiers (hypothesis)

| Tier | Price | Includes | Enforcement |
|------|-------|----------|-------------|
| Free | $0 | 5 AI meal searches / day (`REACT_APP_FREE_SEARCHES_PER_DAY`) | Client-side stub today; server-side later |
| Plus | $4.99/mo (hypothesis) | Unlimited searches · direct order links to Uber Eats & DoorDash | Not built |

The $4.99 price point is a hypothesis to test in stakeholder demos, not a
commitment. No live pricing is published while the Uber Eats / DoorDash official
API applications are pending — the "one-tap ordering" Plus benefit depends on
their outcome.

## Where real gating goes

The real gate is a FastAPI dependency (e.g. `require_entitlement`) added to
`POST /api/search` inside `create_recipe_router` — a localized change thanks to
the DI factory pattern in [recipe_routes.py](../backend/routes/recipe_routes.py).
Nothing else in the pipeline changes.

## Build trigger

Start real auth + Stripe Checkout only when **both** hold:

1. Multi-platform ingestion works beyond fixtures (live Apify or official API data).
2. Anonymous usage shows retention: **≥20% of ≥100 weekly users return within 7
   days** (team can revise the number, but pick one before building).

## Prerequisites checklist before charging anyone

- [ ] Identity layer (auth provider or email magic links)
- [ ] Server-side quota enforcement on `/api/search`
- [ ] Secured ingest lifecycle — replace the `ADMIN_API_TOKEN` stopgap with real auth
- [ ] Stripe Checkout + webhook endpoint (subscription lifecycle)
- [ ] Security review (mandatory for payment code)

## Honesty constraints on the current stub

The client-side quota in [searchQuota.js](../frontend/src/lib/searchQuota.js) is
throwaway: per-browser, trivially bypassed (`?paywall=off`, incognito, cleared
storage), and fails open on storage errors. Its "Notify me" clicks are UX-story
signal for demos only — **never** report them as willingness-to-pay or
conversion evidence.
