import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { AgentMandate as EsmClient } from '../dist/index.js'

const require = createRequire(import.meta.url)
const { AgentMandate: CjsClient } = require('../dist/index.cjs')
let calls = 0
const fakeFetch = async (url, init) => {
  calls += 1
  assert.equal(url, 'https://mock.invalid/health')
  assert.equal(init.method, 'GET')
  return { ok: true, status: 200, text: async () => '{"ok":true,"product":"fixture","version":"1.0.0"}' }
}
const esm = new EsmClient({ apiKey: 'nonsecret-sentinel', baseUrl: 'https://mock.invalid', fetch: fakeFetch })
const cjs = new CjsClient({ apiKey: 'nonsecret-sentinel', baseUrl: 'https://mock.invalid', fetch: () => { throw new Error('unexpected construction-time network') } })
assert.ok(esm)
assert.ok(cjs)
assert.equal(calls, 0)
await esm.health()
assert.equal(calls, 1)
console.log('npm smoke: PASS')
