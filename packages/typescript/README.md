# Agent Mandate API TypeScript SDK

Convert user intent into signed mandates and verify consequential agent actions against mandate, policy and approvals.

This package is the zero-runtime-dependency TypeScript/JavaScript client from
the audited public integration repository. It supports ESM and CommonJS on
Node.js 18 or newer. Import and construction perform no network request.

## Install

```sh
npm install agent-mandate
```

## Authenticated client

```ts
import { AgentMandate } from 'agent-mandate'

const client = new AgentMandate({
  apiKey: process.env.AGENT_MANDATE_API_KEY,
})
```

Never place an API key in browser code, source control, logs, or examples.
Requesting a sandbox key is an email-verification and claim flow; it does not
return a key in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://agentmandate-api.com/?utm_source=npm&utm_medium=package&utm_campaign=agent-mandate&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/agent-mandate)
- [Issues](https://github.com/API-Disk-Integrations/agent-mandate/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
