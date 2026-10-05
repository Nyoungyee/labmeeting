// Runs labmeeting.workflow.mjs with stubbed agent()/parallel() to check control flow,
// demotion logic, and minutes rendering without spending tokens.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'skills', 'labmeeting', 'labmeeting.workflow.mjs'), 'utf8').replace(/^export const meta/m, 'const meta')

function fake(schema, label) {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (schema.enum) return schema.enum[0]
  if (t === 'string') return `${label || 'x'}`
  if (t === 'number') return 0
  if (t === 'boolean') return false
  if (t === 'array') return []
  if (t === 'object') { const o = {}; for (const k of schema.required || []) o[k] = fake(schema.properties[k], k); return o }
  return null
}

// scripted answers keyed by label prefix; everything else falls back to fake(schema)
const calls = []
function makeAgent(script) {
  return async (prompt, opts = {}) => {
    calls.push({ label: opts.label, agentType: opts.agentType, model: opts.model })
    const hit = Object.keys(script).find((k) => (opts.label || '').startsWith(k))
    const base = fake(opts.schema, opts.label)
    return hit ? { ...base, ...script[hit](prompt, opts) } : base
  }
}

async function run(args, script) {
  calls.length = 0
  const logs = []
  const fn = new Function('args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'budget', `return (async () => { ${src} })()`)
  const res = await fn(args, makeAgent(script), async (thunks) => Promise.all(thunks.map((t) => t().catch(() => null))), null, (m) => logs.push(m), () => {}, { total: null })
  return { res, logs }
}

const claim = (claim, tag, pmids = [], dois = []) => ({ claim, tag, pmids, dois, note: 'n' })
const research = (g) => () => ({
  summary: `${g} summary`,
  claims: [claim(`${g} fact`, 'EST', ['11111111']), claim(`${g} fake`, 'EST', ['99999999']), claim(`${g} guess`, 'SPEC'), { claim: 'untagged', tag: 'NOPE', pmids: [], dois: [], note: '' }],
  ideas: [`${g} idea`], searches: [{ db: 'pubmed', query: 'q', hits: 3 }],
  not_found: g === 'G2' ? [{ what: 'replication', queries: ['x AND y'] }] : [],
})
const verify = () => ({
  results: [
    { id: '11111111', kind: 'pmid', exists: true, title: 'T', year: '2020', journal: 'J', matches_claim: true, note: '' },
    { id: '99999999', kind: 'pmid', exists: false, title: '', year: '', journal: '', matches_claim: null, note: 'no record' },
  ],
})

// ---- full mode: 3 rounds, one fake PMID → EST demoted → rerun once ----
{
  const { res, logs } = await run({ question: 'Q?', mode: 'full', rounds: 3, today: '2026-10-05', type: 'B' }, {
    'G1 지지 · 조사': research('G1'), 'G2 반대 · 조사': research('G2'), 'G3 대안 · 조사': research('G3'),
    '포스닥 · 사전 정리': () => ({ agenda: [{ item: 'a1', from: 'G1', why: 'w' }], parked: [{ idea: 'wild', reason: 'no equipment', condition: 'get scope' }] }),
    '교수 · 순서': () => ({ order: [0], opening: 'open' }),
    '검증': verify,
    '교수 · 최종 정리': () => ({ can_say: ['s'], cannot_say: ['c'], confidence: '낮음', agreed_claim_ids: [0, 1, 2], disagreements: [{ issue: 'i', G1: 'a', G2: 'b', G3: 'c', why_split: 'w' }], conditional: [{ condition: 'A', conclusion: 'X' }], no_literature: ['n'], next_steps: [{ task: 't', why: 'w', how: 'h' }] }),
  })
  assert.equal(res.error, undefined, JSON.stringify(res))
  assert.equal(res.rounds_used, 4, 'rerun adds one round after EST demotion')
  assert.equal(res.rerun, true)
  assert.equal(res.stop_reason, 'rounds_exhausted')
  assert.equal(res.ledger.filter((c) => c.claim === 'untagged').length, 0, 'untagged claims excluded')
  const fakeClaims = res.ledger.filter((c) => c.claim.endsWith('fake'))
  assert.ok(fakeClaims.length >= 3 && fakeClaims.every((c) => c.tag === 'SPEC' && c.demoted_from === 'EST'), 'fake PMID → SPEC')
  assert.ok(res.minutes_md.includes('| G1 fact | EST | PMID:11111111 | ✓ |'), 'verified EST in §2')
  assert.ok(!res.minutes_md.includes('| G1 fake |'), 'demoted claim never in §2')
  assert.ok(res.minutes_md.includes('replication — 검색어: x AND y'), 'G2 not_found with queries in §5')
  assert.ok(res.minutes_md.includes('| wild | no equipment | get scope |'), 'parked in §7')
  assert.ok(res.minutes_md.includes('⚠ UNVERIFIED 1건'), 'verification report')
  assert.ok(calls.every((c) => c.agentType && c.agentType.startsWith('labmeeting:')), 'agentType prefix')
  assert.equal(calls.find((c) => c.label.startsWith('교수')).model, 'opus')
  assert.ok(logs.some((l) => l.includes('재실행')))
}

// ---- convergence at round 2 stops early; professor reopen intervention ----
{
  let n = 0
  const { res } = await run({ question: 'Q?', mode: 'full', rounds: 5, type: 'B' }, {
    'G1 지지 · 조사': research('G1'), 'G2 반대 · 조사': research('G2'), 'G3 대안 · 조사': research('G3'),
    '포스닥 · 사전 정리': () => ({ agenda: [{ item: 'a1', from: 'G1', why: 'w' }], parked: [{ idea: 'p0', reason: 'r', condition: 'c' }, { idea: 'p1', reason: 'r', condition: 'c' }] }),
    '교수 · r': () => { n++; return n === 1 ? { intervene: true, interventions: [{ kind: 'reopen', text: 'bring p1', reopen_index: 1 }], converged: true } : { converged: true } },
    '검증': () => ({ results: [{ id: '11111111', kind: 'pmid', exists: true, title: 'T', year: '2020', journal: 'J', matches_claim: true, note: '' }, { id: '99999999', kind: 'pmid', exists: true, title: 'T2', year: '2021', journal: 'J', matches_claim: true, note: '' }] }),
  })
  assert.equal(res.error, undefined)
  assert.equal(res.rounds_used, 2, 'round-1 convergence ignored, round-2 convergence stops')
  assert.equal(res.stop_reason, 'converged')
  assert.equal(res.interventions, 1)
  assert.deepEqual(res.reopened.map((r) => r.index), [1])
  assert.ok(res.minutes_md.includes('p1 (재개방됨, r1)'))
  assert.ok(res.minutes_md.includes('가짜 수렴 의심'), 'empty disagreements → warning row')
}

// ---- quick mode: one student, no triage/debate ----
{
  const { res } = await run({ question: 'Q?', mode: 'quick' }, { 'G1 지지 · 조사': research('G1'), '검증': verify })
  assert.equal(res.error, undefined)
  assert.equal(res.rounds_used, 0)
  assert.equal(res.stop_reason, 'quick')
  assert.ok(res.minutes_md.includes('저비용 모드 (토론 없음'), 'quick stop reason in §8')
  assert.ok(res.minutes_md.includes('저비용 모드 — 포스닥 가지치기 생략'), 'quick parked placeholder')
  assert.ok(!calls.some((c) => c.label.startsWith('포스닥 · 사전')))
  assert.ok(!calls.some((c) => c.label.startsWith('G2')))
}

// ---- resume: parked passed in, no scope phase ----
{
  const { res } = await run({ question: 'Q?', mode: 'resume', rounds: 1, parked: [{ idea: 'old', reason: 'r', condition: 'c' }] }, {
    'G1 지지 · 조사': research('G1'), 'G2 반대 · 조사': research('G2'), 'G3 대안 · 조사': research('G3'), '검증': verify,
  })
  assert.equal(res.error, undefined)
  assert.ok(!calls.some((c) => c.label === '교수 · 범위'))
  assert.ok(res.minutes_md.includes('| old | r | c |'))
}

// ---- missing question ----
{
  const { res } = await run({}, {})
  assert.ok(res.error)
}

console.log('ok — labmeeting workflow mock run passed')
