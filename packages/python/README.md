# Agent Mandate API Python SDK

Convert user intent into signed mandates and verify consequential agent actions against mandate, policy and approvals.

This package is the standard-library-only Python client from the audited public
integration repository. It supports Python 3.10 or newer. Import and
construction perform no network request.

## Install

```sh
python -m pip install agent-mandate
```

## Authenticated client

```python
import os
from agent_mandate import AgentMandate

client = AgentMandate(os.environ["AGENT_MANDATE_API_KEY"])
```

Never place an API key in source control, logs, or examples. Requesting a
sandbox key is an email-verification and claim flow; it does not return a key
in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://agentmandate-api.com/?utm_source=pypi&utm_medium=project&utm_campaign=agent-mandate&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/agent-mandate)
- [Issues](https://github.com/API-Disk-Integrations/agent-mandate/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
