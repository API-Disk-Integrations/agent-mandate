# Agent Mandate API

Convert user intent into signed mandates and verify consequential agent actions against mandate, policy and approvals.

- [Product and pricing](https://agentmandate-api.com/?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme#pricing)
- [Developer documentation](https://agentmandate-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme)
- [Create a free account](https://agentmandate-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme)
- [OpenAPI contract](https://agentmandate-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart

### 1. Request a free-key verification email

```bash
curl -X POST https://agentmandate-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","source":{"source":"github","medium":"developer","campaign":"agent-mandate-github","content":"readme"}}'
```

The service returns `202 Accepted` and sends a one-time claim link. Follow the
email, or exchange its token with `POST /v1/keys/claim`. The API key is shown
once after verification; store it securely. No card is required for the free
sandbox. Current free allowance: **500 verified actions/month**.

### 2. Make the first product call

```bash
curl -X POST https://agentmandate-api.com/v1/mandates \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"principal":"user_8814","agent":"agent_procurement_v3",
       "expiresAt":"2026-12-31T23:59:59Z","currency":"USD",
       "totalSpendCapMinor":500000,
       "grants":[{"action":"payments.transfer","resources":["vendor.acme"],
                  "maxAmountMinor":100000,"approvalRequiredAboveMinor":25000}]}'
```

## SDKs

The repository includes dependency-light client files that point to the current
contract and canonical product domain:

- [Python SDK](./sdk/python/agent_mandate.py) — reads `AGENT_MANDATE_API_KEY`
- [TypeScript SDK](./sdk/typescript/index.ts)

Copy the file you need into your project. The OpenAPI document remains the
authoritative operation and schema contract.

## Authentication and errors

API operations use `Authorization: Bearer <API_KEY>` (or `x-api-key` where
documented). Dashboard-session operations and signed service webhooks are not
callable with a customer API key. Public demo and health operations require no
credential. Errors use a stable `error.code` plus a request ID for support.

## Distribution attribution

The key request above identifies this README with the stable tuple
`github / developer / agent-mandate-github / readme`. The Postman collection and both
SDKs carry their own source metadata. Attribution is used to compare qualified
activation and retained use; it is not evidence that this channel already
performs.

## License

[MIT](./LICENSE)
