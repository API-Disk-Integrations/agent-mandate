/**
 * Agent Mandate API client.
 *
 * Zero dependencies — uses the platform `fetch`, so it runs in Node 18+, Deno,
 * Bun and Cloudflare Workers without a bundler argument.
 *
 * NOT the browser: these endpoints need an API key and deliberately do not
 * support CORS. A key in front-end JavaScript is a published key.
 *
 * ```ts
 * const client = new AgentMandate()                 // reads AGENT_MANDATE_API_KEY
 * const client = new AgentMandate({ apiKey: 'sp_live_…' })
 * ```
 *
 * Start free-key verification, then claim the token delivered by email:
 * ```
 * curl -X POST https://agentmandate-api.com/v1/keys \
 *   -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"typescript"}}'
 * ```
 */

export const DEFAULT_BASE_URL = 'https://agentmandate-api.com'

/** `requires_approval` is returned only when approval is the ONLY thing missing. */
export type Decision = 'allow' | 'deny' | 'requires_approval'

/** Branch on these, never on the human-readable `detail`. */
export type ViolationCode =
  | 'signature_invalid' | 'mandate_expired' | 'mandate_not_yet_valid' | 'mandate_revoked'
  | 'agent_mismatch' | 'action_not_granted' | 'resource_not_granted'
  | 'amount_exceeds_action_cap' | 'amount_exceeds_total_cap' | 'count_exceeds_cap'
  | 'currency_mismatch' | 'approval_required' | 'approval_token_invalid'

export interface ActionGrant {
  /** Dotted name. A single trailing `.*` matches ONE further segment, not a prefix. */
  action: string
  /** Omit to place no resource constraint. An empty array is rejected, not treated as "none". */
  resources?: string[]
  /** Integer minor units (cents). */
  maxAmountMinor?: number
  /** Above this, the decision is `requires_approval` unless a valid token is supplied. */
  approvalRequiredAboveMinor?: number
  maxCount?: number
}

export interface MandateClaims {
  id: string
  principal: string
  agent: string
  notBefore: string
  expiresAt: string
  grants: ActionGrant[]
  totalSpendCapMinor?: number
  currency?: string
  metadata?: Record<string, string>
}

/** Claims plus a detached signature. Keep the pair together. */
export interface SignedMandate {
  mandate: MandateClaims
  signature: string
}

export interface ProposedAction {
  /** Supply it. A mandate is a bearer document; this is what stops a leaked one being replayed. */
  agent?: string
  action: string
  resource?: string
  /** Integer minor units. Requires `currency`. */
  amountMinor?: number
  currency?: string
  /** You track completed spend — the service is deliberately stateless about it. */
  priorSpendMinor?: number
  priorCount?: number
  approvalToken?: string
  /** Supply it to make a decision reproducible. */
  at?: string
}

export interface Violation {
  code: ViolationCode
  detail: string
  grantIndex?: number
}

export interface VerificationReceipt {
  decision: Decision
  mandateId: string
  agent: string
  principal: string
  action: string
  matchedGrant: ActionGrant | null
  matchedGrantIndex: number | null
  /** EVERY reason, not just the first. */
  violations: Violation[]
  remainingSpendMinor: number | null
  evaluatedAt: string
  /** SHA-256 over the decision inputs. Pins an audit entry to this evaluation. */
  digest: string
}

export interface VerifyResponse {
  count: number
  allowed: number
  denied: number
  requiresApproval: number
  receipts: VerificationReceipt[]
  requestId: string
}

export type ApiErrorCode =
  | 'invalid_api_key' | 'missing_api_key' | 'quota_exceeded' | 'rate_limited'
  | 'invalid_request' | 'not_found' | 'method_not_allowed' | 'payload_too_large'
  | 'conflict' | 'internal_error'

/**
 * Thrown for any non-2xx response.
 *
 * NOT thrown for a denied action — a denial is a successful verification with
 * `decision === 'deny'`. Confusing the two is how a deny-by-default system ends
 * up failing open on an exception path.
 */
export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: those are
  // unsupported by strip-only TypeScript runtimes (Node --experimental-strip-types),
  // and an SDK should run without a build step.
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly requestId?: string
  readonly details?: unknown

  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, requestId?: string, details?: unknown) {
    super(`[${status} ${code}] ${message}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export interface ClientOptions {
  apiKey?: string
  baseUrl?: string
  /** Milliseconds. Default 30000. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Optional acquisition metadata. Invalid values are ignored by the service. */
export interface KeySource {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

export interface IssueMandateInput {
  principal: string
  agent: string
  expiresAt: string
  grants: ActionGrant[]
  notBefore?: string
  currency?: string
  totalSpendCapMinor?: number
  metadata?: Record<string, string>
}

export class AgentMandate {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions = {}) {
    const key = options.apiKey ?? (globalThis as any).process?.env?.AGENT_MANDATE_API_KEY
    if (!key) {
      throw new Error(
        'No API key. Pass { apiKey } or set AGENT_MANDATE_API_KEY. ' +
          'Request a free key verification email: POST ' + (options.baseUrl ?? DEFAULT_BASE_URL) + '/v1/keys',
      )
    }
    this.apiKey = key
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : {}
      if (!res.ok) {
        const e = json?.error ?? {}
        throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? text.slice(0, 200), e.requestId, e.details)
      }
      return json
    } finally {
      clearTimeout(timer)
    }
  }

  /** Liveness and deployed version. Does not require a key. */
  async health(): Promise<{ ok: boolean; product: string; version: string }> {
    return this.request('GET', '/health', undefined, false)
  }

  /**
   * Issue a signed mandate. Free — issuance is not the billable unit.
   * All monetary values are INTEGER minor units (cents).
   */
  async issueMandate(input: IssueMandateInput): Promise<SignedMandate> {
    return this.request('POST', '/v1/mandates', input)
  }

  /**
   * Verify one action, or up to 500, against a mandate.
   * Billed one unit per action. A denial is a normal successful response.
   */
  async verify(mandate: SignedMandate, action: ProposedAction | ProposedAction[]): Promise<VerifyResponse> {
    return this.request('POST', '/v1/verify', Array.isArray(action) ? { mandate, actions: action } : { mandate, action })
  }

  /**
   * Revoke a mandate. Idempotent and never billable. Effective within about ten
   * seconds — for an instant boundary, use a short `expiresAt` instead.
   */
  async revoke(mandateId: string, reason?: string): Promise<{ mandateId: string; revoked: boolean; effectiveWithinSeconds: number }> {
    return this.request('POST', `/v1/mandates/${encodeURIComponent(mandateId)}/revoke`, reason ? { reason } : {})
  }

  /** The revocation list your verifications actually consult. */
  async revocations(): Promise<{ count: number; mandateIds: string[] }> {
    return this.request('GET', '/v1/revocations')
  }

  /** The real engine with no key: at most 10 actions. Nothing stored or metered. */
  async demoVerify(mandate: Omit<MandateClaims, 'id'>, action: ProposedAction | ProposedAction[]): Promise<VerifyResponse> {
    return this.request('POST', '/v1/demo/verify', Array.isArray(action) ? { mandate, actions: action } : { mandate, action }, false)
  }

  /** Request a free sandbox key; this emails a claim token. Claiming returns the key once. */
  static async createKey(email: string, opts: { baseUrl?: string; name?: string; source?: KeySource } = {}): Promise<any> {
    const res = await fetch((opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '') + '/v1/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        ...(opts.name ? { name: opts.name } : {}),
        source: opts.source ?? { source: 'sdk', medium: 'typescript' },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'failed', json?.error?.requestId)
    return json
  }
}

export default AgentMandate

// ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
// Everything between these markers is written from openapi.json. Change the
// service, regenerate the contract, then re-run `npm run gen:sdk`.

/** The contract this SDK was generated from. */
export const API_TITLE = "Agent Mandate API"
export const API_VERSION = "1.0.0"
/** The origin the published contract names. `DEFAULT_BASE_URL` resolves to this unless overridden. */
export const API_BASE_URL = "https://agentmandate-api.com"

/**
 * Every `error.code` the contract publishes.
 *
 * The runtime companion to the `ApiErrorCode` union: a union is erased at
 * compile time, so a caller wanting to test an unknown string against the
 * documented set had nothing to test it with.
 */
export const ERROR_CODES = ["invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error"] as const

/** One published operation, exactly as the contract describes it. */
export interface OperationDescriptor {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string
  /** True when the operation requires an API key. False does NOT mean public — see `authKind`. */
  readonly auth: boolean
  /**
   * The credential the operation actually takes.
   *
   * `api_key` — the bearer token this client sends.
   * `session` — the dashboard session cookie, plus `x-csrf-token` on writes.
   *             An API key is REFUSED: these endpoints change what you are
   *             billed and read your payment history, and a key that lives
   *             in CI must not reach them. Call them from the signed-in
   *             dashboard, not from this SDK.
   * `signature` — machine-to-machine; not callable by API consumers.
   * `public` — no credential at all.
   */
  readonly authKind: 'api_key' | 'session' | 'signature' | 'public'
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly requiredBodyFields: readonly string[]
  readonly successStatus: number | null
  /** Property names of the documented 2xx body. A field absent here is a field the service does not promise. */
  readonly responseFields: readonly string[]
}

/**
 * The published surface, generated. Ships with the client so an integration
 * can assert against the contract instead of against a changelog.
 */
export const OPERATIONS: readonly OperationDescriptor[] = [
  {
    operationId: "get/",
    method: "GET",
    path: "/",
    summary: "Service index — endpoints, auth and error format",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postApiBillingWebhook",
    method: "POST",
    path: "/api/billing/webhook",
    summary: "Square billing events, forwarded by the shared hub",
    auth: false,
    authKind: "signature",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    summary: "Liveness and deployed version",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postV1Checkout",
    method: "POST",
    path: "/v1/checkout",
    summary: "Start a hosted Square checkout for a paid tier",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["tier"],
    successStatus: 200,
    responseFields: ["checkoutUrl", "tier", "sku", "requestId"],
  },
  {
    operationId: "postV1DemoVerify",
    method: "POST",
    path: "/v1/demo/verify",
    summary: "Public demo — issue and verify in one call, without a key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["mandate"],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getV1Invoices",
    method: "GET",
    path: "/v1/invoices",
    summary: "Every invoice issued against this account, newest first (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "invoices", "requestId"],
  },
  {
    operationId: "getV1Keys",
    method: "GET",
    path: "/v1/keys",
    summary: "List your API keys for this API",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "accountId", "keys", "requestId"],
  },
  {
    operationId: "postV1Keys",
    method: "POST",
    path: "/v1/keys",
    summary: "Request a free sandbox API key (sends a verification email)",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["email"],
    successStatus: 202,
    responseFields: ["status", "email", "expiresAt", "next", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRevoke",
    method: "POST",
    path: "/v1/keys/{id}/revoke",
    summary: "Revoke one of your API keys",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["id", "status", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRotate",
    method: "POST",
    path: "/v1/keys/{id}/rotate",
    summary: "Replace one of your API keys with a new secret",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"],
  },
  {
    operationId: "postV1KeysClaim",
    method: "POST",
    path: "/v1/keys/claim",
    summary: "Exchange an emailed claim token for the API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["token"],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"],
  },
  {
    operationId: "postV1Mandates",
    method: "POST",
    path: "/v1/mandates",
    summary: "Issue a signed mandate",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["principal", "agent", "expiresAt", "grants"],
    successStatus: 201,
    responseFields: ["mandate", "signature"],
  },
  {
    operationId: "postV1MandatesIdRevoke",
    method: "POST",
    path: "/v1/mandates/{id}/revoke",
    summary: "Revoke a mandate",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["mandateId", "revoked", "effectiveWithinSeconds"],
  },
  {
    operationId: "getV1Payments",
    method: "GET",
    path: "/v1/payments",
    summary: "Every payment attempted against this account and how it went (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "payments", "requestId"],
  },
  {
    operationId: "getV1Revocations",
    method: "GET",
    path: "/v1/revocations",
    summary: "List the mandates you have revoked",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["count", "mandateIds"],
  },
  {
    operationId: "getV1Subscription",
    method: "GET",
    path: "/v1/subscription",
    summary: "Your current plan, billing window and available changes (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"],
  },
  {
    operationId: "postV1SubscriptionCancel",
    method: "POST",
    path: "/v1/subscription/cancel",
    summary: "Cancel this plan and end metered access (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"],
  },
  {
    operationId: "postV1SubscriptionPlan",
    method: "POST",
    path: "/v1/subscription/plan",
    summary: "Upgrade or downgrade to another plan (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["planId"],
    successStatus: 200,
    responseFields: ["changed", "direction", "from", "to", "entitlement", "billing", "requestId"],
  },
  {
    operationId: "getV1Usage",
    method: "GET",
    path: "/v1/usage",
    summary: "Your consumption and remaining allowance for this period",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"],
  },
  {
    operationId: "postV1Verify",
    method: "POST",
    path: "/v1/verify",
    summary: "Verify proposed actions against a mandate",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["mandate"],
    successStatus: 200,
    responseFields: ["count", "receipts"],
  },
  {
    operationId: "getV1Violations",
    method: "GET",
    path: "/v1/violations",
    summary: "Every violation code the engine can return",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
]
// ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
