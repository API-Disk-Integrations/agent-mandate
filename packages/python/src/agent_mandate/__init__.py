"""
Agent Mandate API client.

Zero dependencies beyond the standard library — no requests, no httpx — so it
drops into any environment without a dependency negotiation.

    from agent_mandate import AgentMandate

    client = AgentMandate()            # reads AGENT_MANDATE_API_KEY
    client = AgentMandate("sp_live_…") # or pass it explicitly

Start free-key verification, then claim the token delivered by email:

    curl -X POST https://agentmandate-api.com/v1/keys \
      -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"python"}}'
"""

from __future__ import annotations

import json as _json
import os
import urllib.error
import urllib.request

__all__ = ["AgentMandate", "ApiError", "DECISIONS", "VIOLATION_CODES", "API_TITLE", "API_VERSION", "API_BASE_URL", "ERROR_CODES", "OPERATIONS"]

DEFAULT_BASE_URL = "https://agentmandate-api.com"

#: The three decisions. `requires_approval` is returned only when approval is
#: the ONLY thing missing — never alongside a real denial.
DECISIONS = ("allow", "deny", "requires_approval")

#: Branch on these, never on the human-readable ``detail``.
VIOLATION_CODES = (
    "signature_invalid", "mandate_expired", "mandate_not_yet_valid", "mandate_revoked",
    "agent_mismatch", "action_not_granted", "resource_not_granted",
    "amount_exceeds_action_cap", "amount_exceeds_total_cap", "count_exceeds_cap",
    "currency_mismatch", "approval_required", "approval_token_invalid",
)


class ApiError(Exception):
    """
    Raised for any non-2xx response.

    NOT raised for a denied action — a denial is a successful verification with
    ``decision == "deny"``. Confusing the two is how a deny-by-default system
    ends up failing open on an exception path.
    """

    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, details=None):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details


class AgentMandate:
    def __init__(self, api_key: str | None = None, *, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0):
        key = api_key or os.environ.get("AGENT_MANDATE_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass one to AgentMandate(...) or set AGENT_MANDATE_API_KEY. "
                'Request a free key verification email: POST {}/v1/keys with {{"email": "you@example.com"}}'.format(base_url)
            )
        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, method: str, path: str, *, body=None, auth: bool = True) -> dict:
        data = _json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if auth:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = _json.loads(raw).get("error", {})
            except Exception:
                err = {}
            raise ApiError(
                e.code, err.get("code", "unknown"), err.get("message", raw[:200]),
                err.get("requestId"), err.get("details"),
            ) from None

    # -- API ---------------------------------------------------------------
    def health(self) -> dict:
        """Liveness and deployed version. Does not require a key."""
        return self._request("GET", "/health", auth=False)

    def issue_mandate(
        self,
        *,
        principal: str,
        agent: str,
        expires_at: str,
        grants: list[dict],
        not_before: str | None = None,
        currency: str | None = None,
        total_spend_cap_minor: int | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict:
        """
        Issue a signed mandate. Free — issuance is not the billable unit.

        Returns ``{"mandate": {...}, "signature": "v1:..."}``. Keep both
        together: the signature is detached, and verification needs the pair.
        All monetary values are INTEGER minor units (cents).
        """
        body: dict = {"principal": principal, "agent": agent, "expiresAt": expires_at, "grants": grants}
        if not_before is not None:
            body["notBefore"] = not_before
        if currency is not None:
            body["currency"] = currency
        if total_spend_cap_minor is not None:
            body["totalSpendCapMinor"] = total_spend_cap_minor
        if metadata is not None:
            body["metadata"] = metadata
        return self._request("POST", "/v1/mandates", body=body)

    def verify(self, signed_mandate: dict, action_or_actions) -> dict:
        """
        Verify one action, or a list of up to 500, against a mandate.

        Billed one unit per action verified. A denial is a normal successful
        response — check ``receipts[i]["decision"]``, do not rely on an
        exception.
        """
        body: dict = {"mandate": signed_mandate}
        if isinstance(action_or_actions, list):
            body["actions"] = action_or_actions
        else:
            body["action"] = action_or_actions
        return self._request("POST", "/v1/verify", body=body)

    def revoke(self, mandate_id: str, reason: str | None = None) -> dict:
        """
        Revoke a mandate. Idempotent and never billable.

        Takes effect within about ten seconds — verifications read a briefly
        cached revocation list so they never block on a database. For an
        instant boundary, issue mandates with a short ``expires_at`` instead.
        """
        return self._request("POST", f"/v1/mandates/{mandate_id}/revoke", body={"reason": reason} if reason else {})

    def revocations(self) -> dict:
        """The revocation list your verifications actually consult."""
        return self._request("GET", "/v1/revocations")

    def demo_verify(self, mandate: dict, action_or_actions) -> dict:
        """
        The real engine with no key: signs the mandate with a throwaway demo key
        and verifies against it. At most 10 actions. Nothing stored or metered.
        """
        body: dict = {"mandate": mandate}
        if isinstance(action_or_actions, list):
            body["actions"] = action_or_actions
        else:
            body["action"] = action_or_actions
        return self._request("POST", "/v1/demo/verify", body=body, auth=False)

    @staticmethod
    def create_key(
        email: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        name: str | None = None,
        source: dict[str, str] | None = None,
    ) -> dict:
        """Request a free sandbox key; this emails a claim token. Claiming returns the key once."""
        payload: dict = {
            "email": email,
            "source": source if source is not None else {"source": "sdk", "medium": "python"},
        }
        if name:
            payload["name"] = name
        req = urllib.request.Request(
            base_url.rstrip("/") + "/v1/keys", data=_json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as res:
            return _json.loads(res.read().decode())

# ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
# Everything between these markers is written from openapi.json. Change the
# service, regenerate the contract, then re-run `npm run gen:sdk`.

#: The contract this SDK was generated from.
API_TITLE = "Agent Mandate API"
API_VERSION = "1.0.0"
#: The origin the published contract names.
API_BASE_URL = "https://agentmandate-api.com"

#: Every ``error.code`` the contract publishes. Branch on these, never on the message.
ERROR_CODES = ("invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error")

#: The published surface, generated. Ships with the client so an integration
#: can assert against the contract instead of against a changelog.
OPERATIONS = (
    {
        "operation_id": "get/",
        "method": "GET",
        "path": "/",
        "summary": "Service index — endpoints, auth and error format",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postApiBillingWebhook",
        "method": "POST",
        "path": "/api/billing/webhook",
        "summary": "Square billing events, forwarded by the shared hub",
        "auth": False,
        "auth_kind": "signature",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getHealth",
        "method": "GET",
        "path": "/health",
        "summary": "Liveness and deployed version",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postV1Checkout",
        "method": "POST",
        "path": "/v1/checkout",
        "summary": "Start a hosted Square checkout for a paid tier",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("tier",),
        "success_status": 200,
        "response_fields": ("checkoutUrl", "tier", "sku", "requestId"),
    },
    {
        "operation_id": "postV1DemoVerify",
        "method": "POST",
        "path": "/v1/demo/verify",
        "summary": "Public demo — issue and verify in one call, without a key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("mandate",),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getV1Invoices",
        "method": "GET",
        "path": "/v1/invoices",
        "summary": "Every invoice issued against this account, newest first (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "invoices", "requestId"),
    },
    {
        "operation_id": "getV1Keys",
        "method": "GET",
        "path": "/v1/keys",
        "summary": "List your API keys for this API",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "accountId", "keys", "requestId"),
    },
    {
        "operation_id": "postV1Keys",
        "method": "POST",
        "path": "/v1/keys",
        "summary": "Request a free sandbox API key (sends a verification email)",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("email",),
        "success_status": 202,
        "response_fields": ("status", "email", "expiresAt", "next", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRevoke",
        "method": "POST",
        "path": "/v1/keys/{id}/revoke",
        "summary": "Revoke one of your API keys",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("id", "status", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRotate",
        "method": "POST",
        "path": "/v1/keys/{id}/rotate",
        "summary": "Replace one of your API keys with a new secret",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"),
    },
    {
        "operation_id": "postV1KeysClaim",
        "method": "POST",
        "path": "/v1/keys/claim",
        "summary": "Exchange an emailed claim token for the API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("token",),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"),
    },
    {
        "operation_id": "postV1Mandates",
        "method": "POST",
        "path": "/v1/mandates",
        "summary": "Issue a signed mandate",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("principal", "agent", "expiresAt", "grants"),
        "success_status": 201,
        "response_fields": ("mandate", "signature"),
    },
    {
        "operation_id": "postV1MandatesIdRevoke",
        "method": "POST",
        "path": "/v1/mandates/{id}/revoke",
        "summary": "Revoke a mandate",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("mandateId", "revoked", "effectiveWithinSeconds"),
    },
    {
        "operation_id": "getV1Payments",
        "method": "GET",
        "path": "/v1/payments",
        "summary": "Every payment attempted against this account and how it went (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "payments", "requestId"),
    },
    {
        "operation_id": "getV1Revocations",
        "method": "GET",
        "path": "/v1/revocations",
        "summary": "List the mandates you have revoked",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("count", "mandateIds"),
    },
    {
        "operation_id": "getV1Subscription",
        "method": "GET",
        "path": "/v1/subscription",
        "summary": "Your current plan, billing window and available changes (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionCancel",
        "method": "POST",
        "path": "/v1/subscription/cancel",
        "summary": "Cancel this plan and end metered access (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionPlan",
        "method": "POST",
        "path": "/v1/subscription/plan",
        "summary": "Upgrade or downgrade to another plan (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("planId",),
        "success_status": 200,
        "response_fields": ("changed", "direction", "from", "to", "entitlement", "billing", "requestId"),
    },
    {
        "operation_id": "getV1Usage",
        "method": "GET",
        "path": "/v1/usage",
        "summary": "Your consumption and remaining allowance for this period",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"),
    },
    {
        "operation_id": "postV1Verify",
        "method": "POST",
        "path": "/v1/verify",
        "summary": "Verify proposed actions against a mandate",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("mandate",),
        "success_status": 200,
        "response_fields": ("count", "receipts"),
    },
    {
        "operation_id": "getV1Violations",
        "method": "GET",
        "path": "/v1/violations",
        "summary": "Every violation code the engine can return",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
)
# ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
