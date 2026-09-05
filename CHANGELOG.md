# Agent Mandate changelog

What changed in the public API — endpoints, request and response schemas,
authentication, error codes, plans, quotas and the base URL. Generated from the
contract itself; edit the contract, never this file.

A release that moved none of those things moved nothing you can observe, so it
gets no entry here.

## 2026-09-04 — 1 request or response change and SDK updates

### Requests and responses

- `POST /v1/keys` request: added `source`, `source.source`, `source.medium`, `source.campaign`, `source.content`.

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

### Documentation

- `POST /v1/keys` description revised.
- Contract version `1.0.0` (was `0.1.0`).

## 2026-09-02 — SDK updates

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

## 2026-09-01 — Reference documentation revised

### Documentation

- `GET /v1/usage` description revised.

## 2026-09-01 — 6 request and response changes, authentication changes and SDK updates

### Requests and responses

- `POST /v1/mandates` now answers `201` on success (was `200`).
- `POST /v1/keys` now answers `202` on success (was `201`).
- `POST /v1/keys/claim` now answers `201` on success (was `200`).
- `POST /v1/keys/{id}/rotate` now answers `201` on success (was `200`).
- `GET /v1/subscription` response: `planChangesGoThrough` accepts `provider_managed`.
- `POST /v1/subscription/cancel` response: added `finalInvoice`.

### Authentication

- `POST /api/billing/webhook` now requires a signed request. Callers without one are rejected.
- `GET /v1/subscription` now requires a signed-in dashboard session. Callers without one are rejected.
- `POST /v1/subscription/plan` now requires a signed-in dashboard session. Callers without one are rejected.
- `POST /v1/subscription/cancel` now requires a signed-in dashboard session. Callers without one are rejected.
- `GET /v1/invoices` now requires a signed-in dashboard session. Callers without one are rejected.
- `GET /v1/payments` now requires a signed-in dashboard session. Callers without one are rejected.

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

### Documentation

- `POST /v1/checkout` description revised.
- `GET /v1/subscription` description revised.
- `POST /v1/subscription/plan` description revised.
- `POST /v1/subscription/cancel` description revised.

## 2026-09-01 — 5 new endpoints and SDK updates

### Endpoints

- Added `GET /v1/subscription` — Your current plan, billing window and available changes (dashboard session required) (no API key required)
- Added `POST /v1/subscription/plan` — Upgrade or downgrade to another plan (dashboard session required) (no API key required)
- Added `POST /v1/subscription/cancel` — Cancel this plan and end metered access (dashboard session required) (no API key required)
- Added `GET /v1/invoices` — Every invoice issued against this account, newest first (dashboard session required) (no API key required)
- Added `GET /v1/payments` — Every payment attempted against this account and how it went (dashboard session required) (no API key required)

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

## 2026-08-31 — 4 new endpoints, 2 request and response changes and new base URL

### Endpoints

- Added `GET /v1/keys` — List your API keys for this API
- Added `POST /v1/keys/claim` — Exchange an emailed claim token for the API key (no API key required)
- Added `POST /v1/keys/{id}/revoke` — Revoke one of your API keys
- Added `POST /v1/keys/{id}/rotate` — Replace one of your API keys with a new secret

### Requests and responses

- `POST /v1/keys` request: added `name`.
- `POST /v1/keys` response: added `status`, `email`, `expiresAt`, `next`, `message`; removed `apiKey`, `accountId`, `product`, `quotaPerPeriod`, `plan`, `warning`, `usage`.

### Base URL

- Base URL is `https://agentmandate-api.com`. A client generated from an earlier copy of this contract points elsewhere and must be regenerated.

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

### Documentation

- `POST /v1/keys` summary and description revised.

## 2026-08-31 — 1 new endpoint

### Endpoints

- Added `GET /v1/usage` — Your consumption and remaining allowance for this period

## 2026-08-31 — Plans published

### Plans and quotas

- Plans published. Billed per verified action.

| Plan | Per month | Included verified actions | Additional | Overage cap |
| --- | --- | --- | --- | --- |
| Developer | $299 | 10,000 | $0.06 each | $600 |
| Growth | $1,499 | 75,000 | $0.04 each | $3,000 |
| Scale | $4,999 | 400,000 | $0.02 each | $10,000 |
| Enterprise | $10,000 | 1,200,000 | $0.01 each | $20,000 |

## 2026-08-31 — SDK updates

### SDKs

- TypeScript client SDK updated.

## 2026-08-30 — SDK updates

### SDKs

- Python client SDK updated.
- TypeScript client SDK updated.

## 2026-08-30 — First published contract, authentication changes and error-code changes

### Endpoints

- First published contract, 11 operations:
  - `GET /health` — Liveness and deployed version (no API key required)
  - `GET /` — Service index — endpoints, auth and error format (no API key required)
  - `POST /v1/mandates` — Issue a signed mandate
  - `POST /v1/verify` — Verify proposed actions against a mandate
  - `POST /v1/mandates/{id}/revoke` — Revoke a mandate
  - `GET /v1/revocations` — List the mandates you have revoked
  - `POST /v1/demo/verify` — Public demo — issue and verify in one call, without a key (no API key required)
  - `GET /v1/violations` — Every violation code the engine can return (no API key required)
  - `POST /v1/checkout` — Start a hosted Square checkout for a paid tier (no API key required)
  - `POST /api/billing/webhook` — Square billing events, forwarded by the shared hub (no API key required)
  - `POST /v1/keys` — Create a free sandbox API key (no API key required)

### Authentication

- Keys are sent as `bearer` authorization, or as the `x-api-key` header.

### Errors

- Errors return a machine-readable `error.code`: `invalid_api_key`, `missing_api_key`, `quota_exceeded`, `rate_limited`, `invalid_request`, `not_found`, `method_not_allowed`, `payload_too_large`, `conflict`, `internal_error`.

### Plans and quotas

- Free sandbox keys allow 500 verified actions per period, no card required.

### SDKs

- Python client SDK published.
- TypeScript client SDK published.

---

Derived from the published API contract, the plan catalog, the free sandbox
allowance and the client SDKs, as each of them changed. Every headline above is
built from the entries beneath it. Dates are the dates the change shipped.
Base-URL entries name only origins the API is actually served on: a loopback or
platform-assigned host is written before the product domain is attached and was
never an address anyone integrated against.
