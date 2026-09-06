# Agent Mandate API

Convert user intent into signed mandates and verify consequential agent actions
against mandate, policy and approvals.

- [Product and pricing](https://agentmandate-api.com/?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme#pricing)
- [Developer documentation](https://agentmandate-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme)
- [Create a free account](https://agentmandate-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=agent-mandate-github&utm_content=readme)
- [OpenAPI contract](https://agentmandate-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart: verify an agent action without an account

The public demo signs the mandate with a throwaway demo key, evaluates the
action with the production policy engine, and stores nothing. The copied block
generates `FUTURE_EXPIRES_AT` as a UTC timestamp 24 hours ahead, then replaces
the one clearly named `{{futureExpiresAt}}` template value. Postman performs the
same generation automatically before sending the request.

```bash
FUTURE_EXPIRES_AT="$(python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) + timedelta(days=1)).isoformat(timespec="seconds").replace("+00:00", "Z"))')"
MANDATE_DEMO_TEMPLATE='{"mandate":{"principal":"user_8814","agent":"agent_procurement_v3","expiresAt":"{{futureExpiresAt}}","currency":"USD","totalSpendCapMinor":500000,"grants":[{"action":"payments.transfer","resources":["vendor.acme"],"maxAmountMinor":100000,"approvalRequiredAboveMinor":25000}]},"action":{"agent":"agent_procurement_v3","action":"payments.transfer","resource":"vendor.acme","amountMinor":30000,"currency":"USD"}}'
MANDATE_DEMO="${MANDATE_DEMO_TEMPLATE//\{\{futureExpiresAt\}\}/$FUTURE_EXPIRES_AT}"
curl -sS -X POST https://agentmandate-api.com/v1/demo/verify \
  -H 'content-type: application/json' \
  -d "$MANDATE_DEMO"
```

The proposed transfer is within the hard cap but above the approval threshold,
so the useful result is a machine-actionable `requires_approval` decision:

```json
{
  "count": 1,
  "allowed": 0,
  "denied": 0,
  "requiresApproval": 1,
  "receipts": [
    {
      "decision": "requires_approval",
      "violations": [{"code": "approval_required"}],
      "digest": "sha256:example_receipt_digest"
    }
  ],
  "requestId": "req_example"
}
```

That receipt is the first useful result: the caller can allow, deny or route the
action for human approval using the decision and violation codes.

## Create and use a free API key

```bash
curl -sS -X POST https://agentmandate-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","source":{"source":"github","medium":"developer","campaign":"agent-mandate-github","content":"readme"}}'

curl -sS -X POST https://agentmandate-api.com/v1/keys/claim \
  -H 'content-type: application/json' \
  -d '{"token":"PASTE_ONE_TIME_TOKEN_FROM_EMAIL"}'

export KEY='PASTE_API_KEY_FROM_CLAIM_RESPONSE'
```

Issue a real signed mandate, capture the response, and pass that exact mandate
and signature into verification—there are no fabricated mandate IDs or
signatures in this flow.

```bash
FUTURE_EXPIRES_AT="$(python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) + timedelta(days=1)).isoformat(timespec="seconds").replace("+00:00", "Z"))')"
MANDATE_CLAIMS_TEMPLATE='{"principal":"user_8814","agent":"agent_procurement_v3","expiresAt":"{{futureExpiresAt}}","currency":"USD","totalSpendCapMinor":500000,"grants":[{"action":"payments.transfer","resources":["vendor.acme"],"maxAmountMinor":100000,"approvalRequiredAboveMinor":25000}]}'
MANDATE_CLAIMS="${MANDATE_CLAIMS_TEMPLATE//\{\{futureExpiresAt\}\}/$FUTURE_EXPIRES_AT}"
SIGNED_MANDATE="$(curl -sS -X POST https://agentmandate-api.com/v1/mandates \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d "$MANDATE_CLAIMS")"

VERIFY_BODY="$(printf '%s' "$SIGNED_MANDATE" | python3 -c 'import json,sys; s=json.load(sys.stdin); print(json.dumps({"mandate":{"mandate":s["mandate"],"signature":s["signature"]},"action":{"agent":"agent_procurement_v3","action":"payments.transfer","resource":"vendor.acme","amountMinor":30000,"currency":"USD"}}))')"

curl -sS -X POST https://agentmandate-api.com/v1/verify \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d "$VERIFY_BODY"
```

## SDKs

- [Python SDK](./sdk/python/agent_mandate.py) — reads `AGENT_MANDATE_API_KEY`
- [TypeScript SDK](./sdk/typescript/index.ts)

The OpenAPI document is the authoritative operation and schema contract.

## Collection scope

The runnable Postman collection includes the public demo, the no-key checkout
path, key bootstrap, and API-key product operations. It intentionally excludes
the provider-only billing webhook and browser-session subscription, invoice,
and payment routes: those require a signed hub request or the dashboard's
HttpOnly session and CSRF controls, and a bearer API key cannot run them. The
OpenAPI document linked above remains the reference for those operations.

## Authentication and troubleshooting

- `401`: set `KEY` to the value returned once by `/v1/keys/claim`.
- `400 invalid_request`: submit the exact signed object returned by
  `/v1/mandates`; do not edit its claims or signature. A client-side schema tool
  may label the same input problem `422` before send.
- `429`: wait for `Retry-After` when present, then retry with backoff.

Errors use a stable `error.code` and request ID. Share only the request ID with
support, never a key, claim token or signed production mandate.

## Distribution attribution

The key request above uses the stable tuple
`github / developer / agent-mandate-github / readme`. The Postman collection and
SDKs carry their own source metadata. Attribution compares qualified activation
and retained use; it does not claim that this channel already performs.

## License

[MIT](./LICENSE)
