/**
 * The site's route table — the one place a public URL is declared.
 *
 * Three consumers read this file and nothing else:
 *   • serve.ts   decides, per request, whether a path is a page, a redirect,
 *                a proxied API call, or a 404.
 *   • build.mjs  emits sitemap.xml and robots.txt from PAGES, and injects the
 *                canonical / og: / JSON-LD head block into each built page.
 *   • the tests  assert that what is routed and what is advertised agree.
 *
 * That is the point: a sitemap hand-maintained beside a router drifts within a
 * week, and the failure is silent — you advertise a URL that 404s, or serve one
 * Google never hears about. Here, adding a page is ONE entry in PAGES and it is
 * simultaneously routed, redirected from its .html form, listed in the sitemap
 * (or Disallowed), and given a canonical tag.
 */

export interface Page {
  /** Canonical, extensionless URL. Always the form we advertise. */
  readonly path: string
  /** File under public/ that answers it. Empty when the page is proxied. */
  readonly file: string
  /**
   * True when the API service renders this page, not this one.
   *
   * The account pages are session-aware: they read a cookie, look up a session
   * and render per-customer data, so they live with the code that owns
   * sessions. They are still declared here because robots.txt is derived from
   * this table, and a page we do not serve still needs to be kept out of the
   * index.
   */
  readonly proxied: boolean
  /**
   * false ⇒ kept out of sitemap.xml, Disallowed in robots.txt, and served with
   * `x-robots-tag: noindex`. Account surfaces are never indexable: a logged-out
   * crawler would index an empty shell, and the URL itself leaks the surface.
   */
  readonly index: boolean
  /** sitemap.xml <priority>. Ignored when index is false. */
  readonly priority: number
  /** sitemap.xml <changefreq>. Ignored when index is false. */
  readonly changefreq: 'daily' | 'weekly' | 'monthly'
}

export interface Redirect {
  readonly from: string
  readonly to: string
  /**
   * 301 for a URL shape that is gone for good (the .html forms). 302 for an
   * alias that may become a real page later — a cached 301 is close to
   * un-revokable in a browser, so it is the wrong default for a path we may
   * want back.
   */
  readonly permanent: boolean
}

/** A path handed to the API service rather than answered from public/. */
export interface ProxyRule {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
}

/**
 * Every page the site advertises.
 *
 * Entries whose file does not exist yet are deliberate: /dashboard, /login and
 * /signup are being built by another agent, and /changelog is generated from
 * the repo's CHANGELOG.md by tooling that does not target site/ yet. Declaring
 * them now means the day those files land in public/ they are served, listed
 * and robots-scoped with no change here. Until then they fall through to the
 * 404 handler, and build.mjs omits them from the sitemap (it only lists pages
 * whose file it actually copied) so we never advertise a URL that 404s.
 */
export const PAGES: readonly Page[] = [
  { path: '/', file: 'index.html', proxied: false, index: true, priority: 1.0, changefreq: 'weekly' },
  { path: '/docs', file: 'docs.html', proxied: false, index: true, priority: 0.9, changefreq: 'weekly' },
  { path: '/use-cases/ai-agent-action-authorization-api', file: 'use-case-ai-agent-action-authorization-api.html', proxied: false, index: true, priority: 0.8, changefreq: 'monthly' },
  { path: '/changelog', file: 'changelog.html', proxied: false, index: true, priority: 0.5, changefreq: 'weekly' },
  // `service-status.html`, not `status.html`, and the name is load-bearing.
  // build.mjs writes a generated dist/public/status.html AFTER it copies
  // public/, so a page committed under that name would be silently overwritten
  // on every build and never ship. Pointing the route at a differently-named
  // file is what lets /status be a page we actually author; the REDIRECTS entry
  // below collapses the generated leftover into this one URL so the two can
  // never both be reachable.
  { path: '/status', file: 'service-status.html', proxied: false, index: true, priority: 0.3, changefreq: 'daily' },
  // Required on every page that takes a payment. Indexable and low priority:
  // people look for them deliberately, and search engines treat an unreachable
  // privacy policy on a commerce site as a quality signal against the domain.
  { path: '/privacy', file: 'privacy.html', proxied: false, index: true, priority: 0.3, changefreq: 'monthly' },
  { path: '/terms', file: 'terms.html', proxied: false, index: true, priority: 0.3, changefreq: 'monthly' },
  { path: '/dashboard', file: '', proxied: true, index: false, priority: 0, changefreq: 'daily' },
  { path: '/login', file: '', proxied: true, index: false, priority: 0, changefreq: 'monthly' },
  { path: '/signup', file: '', proxied: true, index: false, priority: 0, changefreq: 'monthly' },
]

/**
 * Aliases for sections that live inside a page rather than on their own.
 *
 * /pricing and /quickstart are required entry points, but the copy for both is
 * a section of an existing document. Serving that document at two URLs would
 * split its ranking against itself, so the alias redirects instead of
 * duplicating — and stays a 302 because either may graduate to a real page.
 */
export const REDIRECTS: readonly Redirect[] = [
  { from: '/pricing', to: '/#pricing', permanent: false },
  { from: '/quickstart', to: '/docs#start', permanent: false },
  { from: '/playground', to: '/docs#playground', permanent: false },
  // The one redirect here that is NOT an alias for a section. build.mjs
  // generates dist/public/status.html unconditionally; since /status is now
  // answered by service-status.html, that file would otherwise sit in the
  // build output as a second, uncanonicalised copy of the same page reachable
  // at /status.html. 301 collapses it, exactly as the .html forms are
  // collapsed — the URL shape is gone for good.
  { from: '/status.html', to: '/status', permanent: true },
]

/**
 * Paths served by the API service instead of this one.
 *
 * `/v1/` is the contract that is already deployed and public; it is matched
 * verbatim and forwarded verbatim, because a customer's committed integration
 * is not something to renumber for tidiness.
 *
 * `/api/` is here because the API genuinely owns paths under it — most
 * importantly `/api/billing/webhook`. It is forwarded verbatim for the same
 * reason: rewriting `/api/x` to `/x` would break that webhook, and a webhook
 * whose signature covers its URL cannot survive a rewrite at all.
 *
 * `/health`, `/openapi` and `/openapi.json` are exact matches so they cannot
 * shadow a future page. Note what proxying /openapi.json buys: the API builds
 * `servers[0].url` from the forwarded Host, so the spec served on the apex
 * names the apex, with nothing to keep in sync.
 *
 * `/` is deliberately absent. The API answers `/` with a JSON service index;
 * on this domain `/` is the landing page.
 */
export const PROXY_ROUTES: readonly ProxyRule[] = [
  { kind: 'exact', path: '/health' },
  { kind: 'exact', path: '/openapi' },
  { kind: 'exact', path: '/openapi.json' },
  { kind: 'prefix', path: '/v1/' },
  { kind: 'prefix', path: '/api/' },
  // The authenticated account surface. It is mounted in front of the JSON API
  // on the API service, because it owns sessions — so on this domain it has to
  // be proxied rather than served from public/. Doing it this way is also what
  // keeps the session cookie working: the browser only ever sees this origin,
  // so the dashboard's own fetches are first-party and no CORS relaxation is
  // needed anywhere.
  ...PAGES.filter((p) => p.proxied).map((p) => ({ kind: 'exact', path: p.path }) as const),
  { kind: 'prefix', path: '/dashboard/api/' },
  { kind: 'prefix', path: '/auth/' },
  { kind: 'prefix', path: '/account/' },
]


/**
 * This service's own liveness, separate from /health.
 *
 * /health on the public domain must answer for the API — that is the thing a
 * customer is asking about — which means it goes red when the API goes red.
 * A platform healthcheck pointed at it would then take the marketing site down
 * every time the API blinked, so the healthcheck gets its own path that depends
 * on nothing downstream.
 */
export const SITE_LIVENESS_PATH = '/_health'

/**
 * Prefixes robots.txt must exclude that are not pages.
 *
 * Kept beside the router rather than in the build script so that a path can
 * only be added in one place. Crawling any of these costs budget and returns
 * 401s; /auth/ in particular must never be followed, since those URLs are
 * single-use magic links.
 */
export const CRAWLER_DISALLOW_PREFIXES = ['/v1/', '/api/', '/auth/', '/account/', '/dashboard/api/', SITE_LIVENESS_PATH]

/** Files served without ever consulting the page table. */
export const STATIC_ALLOW = ['/sitemap.xml', '/robots.txt', '/favicon.ico']

/**
 * ACME lives below this prefix. Railway terminates TLS at its edge and answers
 * challenges there, so we should never see one — but if issuance is ever moved
 * in-container, a www→apex redirect sitting in front of it would break renewal
 * silently and the certificate would simply expire one day. Cheap to exempt.
 */
export const WELL_KNOWN_PREFIX = '/.well-known/'

const stripQuery = (url: string): string => {
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  const cut = [q, h].filter((i) => i >= 0)
  return cut.length === 0 ? url : url.slice(0, Math.min(...cut))
}

/** Path portion of a request URL, query and fragment removed. */
export const pathOf = (url: string | undefined): string => stripQuery(url ?? '/') || '/'

/**
 * Matched against the RAW path, never a decoded one.
 *
 * The upstream sees exactly the bytes the client sent, so there is no window
 * where the proxy decides on one string and forwards another — which is the
 * classic way a path-based access rule is walked past.
 */
export function matchProxy(rawPath: string): ProxyRule | null {
  for (const rule of PROXY_ROUTES) {
    if (rule.kind === 'exact' ? rawPath === rule.path : rawPath.startsWith(rule.path)) return rule
  }
  return null
}

export function matchPage(rawPath: string): Page | null {
  return PAGES.find((p) => p.path === rawPath) ?? null
}

export function matchRedirect(rawPath: string): Redirect | null {
  return REDIRECTS.find((r) => r.from === rawPath) ?? null
}

/**
 * `/docs.html` ⇒ `/docs`, `/index.html` ⇒ `/`.
 *
 * Derived from PAGES rather than listed, so a new page's .html form redirects
 * the day it is added and cannot be forgotten. The already-published HTML links
 * to /docs.html, so this has to keep working — but it answers 301, which
 * collapses the two URLs into one identity rather than serving both forever.
 */
export function htmlAliasTarget(rawPath: string): string | null {
  if (!rawPath.endsWith('.html')) return null
  const page = PAGES.find((p) => p.file !== '' && `/${p.file}` === rawPath)
  return page ? page.path : null
}

/** Apex form of a `www.` host, or null when the host is already canonical. */
export function apexOf(host: string): string | null {
  const name = host.split(':')[0] ?? ''
  if (!name.toLowerCase().startsWith('www.')) return null
  const rest = name.slice(4)
  // "www.com" would strip to "com" — refuse anything that is not still a
  // hostname with a label and a TLD, so a malformed Host cannot send a client
  // to a domain we do not own.
  return rest.includes('.') && !rest.startsWith('.') ? rest : null
}
