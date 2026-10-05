export const meta = {
  name: 'labmeeting',
  description: 'Lab-meeting debate: 3 viewpoint-locked students + postdoc + search-less professor; claims tagged, citations verified, dissent preserved',
  phases: [
    { title: 'Scope', detail: 'professor judges whether the question deserves a meeting' },
    { title: 'Research', detail: 'G1/G2/G3 search in parallel from locked viewpoints' },
    { title: 'Triage', detail: 'postdoc splits agenda vs parked; professor sets order' },
    { title: 'Debate', detail: 'students + both postdocs each round; professor only when needed' },
    { title: 'Verify', detail: 'every PMID/DOI checked; failures demoted' },
    { title: 'Synthesis', detail: 'professor bottom line — no winner' },
  ],
}

// ---------- args ----------
const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) || {} } catch { return {} } })() : args || {}
const question = typeof a.question === 'string' ? a.question.trim() : ''
if (!question) return { error: 'args.question is required' }
const mode = ['full', 'quick', 'resume'].includes(a.mode) ? a.mode : 'full'
let maxRounds = Math.max(1, Math.min(8, Number(a.rounds) || 3))
const forcedType = ['A', 'B', 'C', 'D'].includes(a.type) ? a.type : null
const context = typeof a.context === 'string' ? a.context.trim() : ''
const parkedIn = Array.isArray(a.parked) ? a.parked.filter((p) => p && p.idea) : []
const rerunOnFail = a.rerunOnFail !== false
const today = typeof a.today === 'string' ? a.today : ''
const lang = typeof a.lang === 'string' && a.lang ? a.lang.toLowerCase().slice(0, 2) : 'ko'
const LANG_NAMES = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文', de: 'Deutsch', fr: 'français', es: 'español' }
const langName = LANG_NAMES[lang] || a.lang || '한국어'
// agentType prefix: 'labmeeting:' when installed as a plugin, '' when agents/ were copied to ~/.claude/agents
const prefix = typeof a.agentPrefix === 'string' ? a.agentPrefix : 'labmeeting:'
const MODELS = Object.assign({ professor: 'opus', postdoc: 'sonnet', critic: 'sonnet', students: 'sonnet' }, a.models || {})

const ROLES = {
  professor: { type: `${prefix}professor`, model: MODELS.professor },
  postdoc: { type: `${prefix}postdoc`, model: MODELS.postdoc },
  critic: { type: `${prefix}postdoc-critic`, model: MODELS.critic, label: '포스닥 비판' },
  G1: { type: `${prefix}student-support`, model: MODELS.students, label: 'G1 지지' },
  G2: { type: `${prefix}student-oppose`, model: MODELS.students, label: 'G2 반대' },
  G3: { type: `${prefix}student-alternative`, model: MODELS.students, label: 'G3 대안' },
}
const call = (role, prompt, opts) => agent(prompt, { agentType: ROLES[role].type, model: ROLES[role].model, ...opts })

const langLine = `언어: 모든 자유 텍스트는 ${langName}로 작성. 스키마 enum 값(EST/CONTESTED/INFER/SPEC, agree/disagree/partial 등)은 번역하지 말 것. 짧은 문단, 필요하면 "- " 목록.`
const clip = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

// ---------- schemas ----------
const TAGS = ['EST', 'CONTESTED', 'INFER', 'SPEC']
const CLAIM = {
  type: 'object',
  properties: {
    claim: { type: 'string' },
    tag: { type: 'string', enum: TAGS },
    pmids: { type: 'array', items: { type: 'string' } },
    dois: { type: 'array', items: { type: 'string' } },
    note: { type: 'string', description: 'INFER: 추론 단계. CONTESTED: 어느 PMID가 어느 쪽인지. SPEC: "근거 없음".' },
  },
  required: ['claim', 'tag', 'pmids', 'dois', 'note'],
}
const SEARCH = { type: 'object', properties: { db: { type: 'string' }, query: { type: 'string' }, hits: { type: 'number' } }, required: ['db', 'query', 'hits'] }
const NOT_FOUND = { type: 'object', properties: { what: { type: 'string' }, queries: { type: 'array', items: { type: 'string' } } }, required: ['what', 'queries'] }

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    worth_meeting: { type: 'boolean', description: '단순 사실 조회면 false' },
    type: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'A 사실 조회 / B 문헌 종합 / C 기전·인과 추론 / D 가설 생성·실험 설계' },
    scoped_question: { type: 'string', description: '범위를 명확히 한 질문 (원문 유지 가능)' },
    reason: { type: 'string', maxLength: 600 },
  },
  required: ['worth_meeting', 'type', 'scoped_question', 'reason'],
}
const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '전담 관점에서 본 요약, 5문장 이내' },
    claims: { type: 'array', items: CLAIM },
    ideas: { type: 'array', items: { type: 'string' }, description: '실험 아이디어, 가설, 브레인스토밍 (태그 불필요)' },
    searches: { type: 'array', items: SEARCH },
    not_found: { type: 'array', items: NOT_FOUND, description: '찾았으나 없었던 것 + 검색어' },
  },
  required: ['summary', 'claims', 'ideas', 'searches', 'not_found'],
}
const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    agenda: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, from: { type: 'string' }, why: { type: 'string' } }, required: ['item', 'from', 'why'] } },
    parked: { type: 'array', items: { type: 'object', properties: { idea: { type: 'string' }, reason: { type: 'string', description: '한 줄' }, condition: { type: 'string', description: '재검토 조건' } }, required: ['idea', 'reason', 'condition'] } },
  },
  required: ['agenda', 'parked'],
}
const ORDER_SCHEMA = {
  type: 'object',
  properties: {
    order: { type: 'array', items: { type: 'number' }, description: 'agenda 인덱스(0부터) 토론 순서' },
    opening: { type: 'string', maxLength: 700, description: '5문장 이내' },
  },
  required: ['order', 'opening'],
}
const DEBATE_SCHEMA = {
  type: 'object',
  properties: {
    position: { type: 'string', description: '현재 입장 1-3문장' },
    claims: { type: 'array', items: CLAIM },
    responses: {
      type: 'array',
      items: { type: 'object', properties: { to: { type: 'string', enum: ['G1', 'G2', 'G3', 'postdoc', 'professor'] }, agreement: { type: 'string', enum: ['agree', 'disagree', 'partial'] }, note: { type: 'string' } }, required: ['to', 'agreement', 'note'] },
    },
    changed_position: { type: 'boolean' },
    new_searches: { type: 'array', items: SEARCH },
    not_found: { type: 'array', items: NOT_FOUND },
    open_question: { type: 'string', description: '이 라운드 후에도 답이 없는 것 1개' },
  },
  required: ['position', 'claims', 'responses', 'changed_position', 'new_searches', 'not_found', 'open_question'],
}
const FEAS_SCHEMA = {
  type: 'object',
  properties: {
    notes: { type: 'array', items: { type: 'object', properties: { about: { type: 'string' }, constraint: { type: 'string' }, tag: { type: 'string', enum: TAGS }, pmids: { type: 'array', items: { type: 'string' } }, dois: { type: 'array', items: { type: 'string' } } }, required: ['about', 'constraint', 'tag', 'pmids', 'dois'] } },
    experiment_to_split: { type: 'string', description: '현재 갈림길을 구분할 실험이 있으면 설계 요지, 없으면 빈 문자열' },
  },
  required: ['notes', 'experiment_to_split'],
}
const CRITIC_KINDS = ['근거불일치', '논리비약', '교란변수', '방법론', '과잉일반화', '에코']
const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    checked: { type: 'string', description: '이번에 무엇을 점검했는지. nothing_found일 때도 필수.' },
    nothing_found: { type: 'boolean' },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string', description: '공격 대상 주장/논증' },
          claim_id: { type: 'number', description: '해당하는 주장 id, 없으면 -1' },
          kind: { type: 'string', enum: CRITIC_KINDS },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['상', '중', '하'], description: '"상" = 해소 전에는 결론 불가. 남발 금지.' },
        },
        required: ['target', 'claim_id', 'kind', 'problem', 'severity'],
      },
    },
    echo_warning: { type: 'boolean', description: '학위생 반응이 거의 전부 agree/partial이거나 같은 소수 논문만 돌려 인용하는가' },
    echo_note: { type: 'string' },
    unaddressed_high: { type: 'boolean', description: '이전 라운드 "상" 지적이 아직 설득력 있게 답변되지 않았는가. 켜져 있으면 합의 종료가 막힌다.' },
  },
  required: ['checked', 'nothing_found', 'objections', 'echo_warning', 'echo_note', 'unaddressed_high'],
}

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    intervene: { type: 'boolean', description: '기본값 false. 겉돌기/근거 없는 합의/중요 갈림길/보류함 재개방 필요 시에만 true' },
    interventions: {
      type: 'array',
      maxItems: 2,
      items: { type: 'object', properties: { kind: { type: 'string', enum: ['narrow', 'brake', 'crux', 'reopen'] }, text: { type: 'string', maxLength: 700, description: '5문장 이내' }, reopen_index: { type: 'number', description: 'kind=reopen일 때 보류함 인덱스, 아니면 -1' } }, required: ['kind', 'text', 'reopen_index'] },
    },
    stalled: { type: 'boolean', description: '논의가 겉도는가' },
    converged: { type: 'boolean', description: '세 관점이 같은 결론을 지지하는가' },
    evidence_exhausted: { type: 'boolean', description: '추가 검색이 새 정보를 내놓지 않는가' },
    unsupported_consensus: { type: 'array', items: { type: 'string' }, description: '근거 없이 합의처럼 굳어지는 주장' },
  },
  required: ['intervene', 'interventions', 'stalled', 'converged', 'evidence_exhausted', 'unsupported_consensus'],
}
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: ['pmid', 'doi'] },
          exists: { type: ['boolean', 'null'], description: 'null = 네트워크/도구 오류로 확인 불가' },
          title: { type: 'string' },
          year: { type: 'string' },
          journal: { type: 'string' },
          matches_claim: { type: ['boolean', 'null'] },
          note: { type: 'string' },
        },
        required: ['id', 'kind', 'exists', 'title', 'year', 'journal', 'matches_claim', 'note'],
      },
    },
  },
  required: ['results'],
}
const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    can_say: { type: 'array', items: { type: 'string' } },
    cannot_say: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['높음', '중간', '낮음', '결론 불가'] },
    agreed_claim_ids: { type: 'array', items: { type: 'number' }, description: '합의된 주장의 claim id (제공된 목록에서)' },
    disagreements: { type: 'array', items: { type: 'object', properties: { issue: { type: 'string' }, G1: { type: 'string' }, G2: { type: 'string' }, G3: { type: 'string' }, why_split: { type: 'string' } }, required: ['issue', 'G1', 'G2', 'G3', 'why_split'] } },
    conditional: { type: 'array', items: { type: 'object', properties: { condition: { type: 'string' }, conclusion: { type: 'string' } }, required: ['condition', 'conclusion'] } },
    no_literature: { type: 'array', items: { type: 'string' } },
    next_steps: { type: 'array', items: { type: 'object', properties: { task: { type: 'string' }, why: { type: 'string' }, how: { type: 'string' } }, required: ['task', 'why', 'how'] } },
  },
  required: ['can_say', 'cannot_say', 'confidence', 'agreed_claim_ids', 'disagreements', 'conditional', 'no_literature', 'next_steps'],
}

// ---------- state ----------
const research = {} // G1/G2/G3 -> RESEARCH output
const rounds = [] // [{ n, students: {G1,G2,G3}, postdoc, critic, professor }]
let criticTriage = null // critic's attack on the agenda/parked split
let triage = { agenda: [], parked: parkedIn.map((p) => ({ idea: p.idea, reason: p.reason || '', condition: p.condition || '' })) }
let order = null
const reopened = [] // { index, round }
let qtype = forcedType
let stopReason = 'rounds_exhausted'
let interventionsTotal = 0
let criticVetoes = 0

// ---------- claim ledger (every tagged claim, by owner) ----------
const ledger = [] // { id, owner, phase, round, claim, tag, pmids, dois, note, demoted_from, flags: [] }
const normPmid = (s) => String(s || '').replace(/\D/g, '')
const normDoi = (s) => String(s || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase()
function addClaims(owner, phase, round, claims) {
  for (const c of claims || []) {
    if (!c || !c.claim || !TAGS.includes(c.tag)) continue // untagged → excluded (spec §2.1)
    if (owner === 'professor' && (c.tag === 'EST' || c.tag === 'CONTESTED')) continue // professor cannot declare facts
    ledger.push({
      id: ledger.length,
      owner, phase, round,
      claim: c.claim, tag: c.tag,
      pmids: (c.pmids || []).map(normPmid).filter(Boolean),
      dois: (c.dois || []).map(normDoi).filter((d) => d.startsWith('10.')),
      note: c.note || '',
      demoted_from: null, flags: [],
    })
  }
}
const claimsOf = (who) => ledger.filter((c) => c.owner === who)
const cite = (c) => [...c.pmids.map((p) => 'PMID:' + p), ...c.dois.map((d) => 'DOI:' + d)].join(', ') || '—'
function renderClaims(list) {
  return list.map((c) => `  - (#${c.id}) [${c.tag}] ${c.claim} — ${cite(c)}${c.note ? ' (' + clip(c.note, 120) + ')' : ''}`).join('\n')
}

// ---------- transcript rendering ----------
function renderResearch() {
  return ['G1', 'G2', 'G3'].filter((g) => research[g]).map((g) => {
    const r = research[g]
    const lines = [`### ${ROLES[g].label}`, r.summary, renderClaims(claimsOf(g).filter((c) => c.phase === 'research'))]
    if (r.ideas.length) lines.push('  아이디어: ' + r.ideas.join(' | '))
    if (r.not_found.length) lines.push('  찾았으나 없음: ' + r.not_found.map((n) => `${n.what} [${n.queries.join('; ')}]`).join(' | '))
    return lines.join('\n')
  }).join('\n\n')
}
function renderAgenda() {
  const idx = order && order.length ? order : triage.agenda.map((_, i) => i)
  const ag = idx.filter((i) => triage.agenda[i]).map((i, k) => `${k + 1}. ${triage.agenda[i].item} (${triage.agenda[i].from}: ${triage.agenda[i].why})`).join('\n')
  const pk = triage.parked.map((p, i) => `  [${i}] ${p.idea} — 보류 사유: ${p.reason}; 재검토: ${p.condition}${reopened.some((r) => r.index === i) ? ' (재개방됨)' : ''}`).join('\n')
  const ct = criticTriage ? `\n포스닥 비판 (가지치기 검토): ${renderCritic(criticTriage)}` : ''
  return `의제:\n${ag || '(없음)'}\n보류함:\n${pk || '(없음)'}${ct}`
}
function renderCritic(c) {
  if (!c) return ''
  const lines = []
  for (const o of c.objections || []) lines.push(`  [${o.severity}][${o.kind}] ${o.target}${o.claim_id >= 0 ? ` (#${o.claim_id})` : ''} → ${o.problem}`)
  if (c.echo_warning) lines.push(`  ⚠ 에코 수렴 경보: ${c.echo_note}`)
  if (c.unaddressed_high) lines.push(`  ⛔ 이전 "상" 지적 미해소 — 합의 종료 차단 중`)
  if (!lines.length) lines.push(`  지적 없음 (점검: ${clip(c.checked, 160)})`)
  return '\n' + lines.join('\n')
}
function renderRounds() {
  return rounds.map((r) => {
    const lines = [`--- 라운드 ${r.n} ---`]
    for (const g of ['G1', 'G2', 'G3']) {
      const o = r.students[g]
      if (!o) continue
      lines.push(`${ROLES[g].label}: ${o.position}${o.changed_position ? ' (↻ 입장 변경)' : ''}`)
      lines.push(renderClaims(claimsOf(g).filter((c) => c.phase === 'debate' && c.round === r.n)))
      if (o.responses.length) lines.push('  반응: ' + o.responses.map((x) => `${x.to} ${x.agreement}${x.note ? ' (' + clip(x.note, 80) + ')' : ''}`).join('; '))
      if (o.not_found.length) lines.push('  찾았으나 없음: ' + o.not_found.map((n) => `${n.what} [${n.queries.join('; ')}]`).join(' | '))
      if (o.open_question) lines.push('  미해결: ' + o.open_question)
    }
    if (r.postdoc) {
      lines.push('포스닥 (실현 가능성):')
      lines.push(renderClaims(claimsOf('postdoc').filter((c) => c.phase === 'debate' && c.round === r.n)))
      if (r.postdoc.experiment_to_split) lines.push('  갈림길 구분 실험: ' + r.postdoc.experiment_to_split)
    }
    if (r.critic) lines.push('포스닥 비판:' + renderCritic(r.critic))
    if (r.professor && r.professor.intervene) {
      for (const iv of r.professor.interventions) lines.push(`교수 [${iv.kind}]: ${iv.text}`)
    }
    return lines.join('\n')
  }).join('\n\n')
}
function renderTable() {
  const p = [`질문: ${question}`]
  if (context) p.push(`\n제공된 맥락:\n${context}`)
  if (Object.keys(research).length) p.push(`\n## 사전 조사\n${renderResearch()}`)
  p.push(`\n## 의제/보류함\n${renderAgenda()}`)
  if (rounds.length) p.push(`\n## 토론\n${renderRounds()}`)
  return p.join('\n')
}

// ---------- prompts ----------
const TAG_RULE = `주장 태그 규칙: EST(PMID/DOI 필수) / CONTESTED(양쪽 PMID 필수) / INFER(출발점 PMID + 추론 단계) / SPEC(근거 없음 명시). 태그 없는 주장은 회의록에서 제외. PMID/DOI는 전부 검증되며 실패 시 SPEC으로 강등. 지어내지 말 것.`

function scopePrompt() {
  return [langLine, `랩미팅을 열 가치가 있는 질문인지 판단하라. 검색하지 말고 질문 자체만 보고 판단한다.`,
    `- 단순 사실 조회(보존 잔기, 프로토콜 파라미터 등)면 worth_meeting=false, type=A.`,
    `- B 문헌 종합 / C 기전·인과 추론(상충 데이터 해석) / D 가설 생성·실험 설계.`,
    `- scoped_question: 토론 가능하게 범위를 좁힌 질문. 원문이 충분하면 그대로.`,
    `\n질문:\n${question}`, context ? `\n제공된 맥락:\n${context}` : ''].join('\n')
}
function researchPrompt(g, quick) {
  const focus = {
    G1: '주된 가설과 이를 뒷받침하는 1차 문헌(원 데이터가 있는 논문). 기전.',
    G2: '반대 증거, 재현 실패, 음성 결과, 효과가 사라진 조건. 못 찾으면 not_found에 검색어와 함께 "찾았으나 없었다"를 반드시 기록.',
    G3: '같은 데이터를 설명하는 대안 가설, 방법론적 결함, 교란변수, 원 논문의 한계. 조건부 결론의 재료.',
  }[g]
  const p = [langLine, TAG_RULE, `사용 가능한 검색 도구(PubMed MCP 등은 ToolSearch로 로드)로 실제 검색을 수행하고 searches에 검색어를 기록하라.`]
  p.push(`\n전담 관점: ${focus}`)
  if (quick) p.push(`저비용 모드: 지지 증거뿐 아니라 반대 증거와 대안 설명도 함께 간략히 다루되, 각 주장에 어느 관점인지 note에 적어라.`)
  if (mode === 'resume') p.push(`\n이번 미팅은 이전 회의록의 보류함 재개방이다. 아래 보류 아이디어들만을 대상으로 조사하라:\n${triage.parked.map((x, i) => `[${i}] ${x.idea} (보류 사유: ${x.reason})`).join('\n')}`)
  p.push(`\n질문:\n${question}`)
  if (context) p.push(`\n제공된 맥락:\n${context}`)
  p.push(`\n요약, 태그된 주장, 아이디어(브레인스토밍 환영, SPEC 환영), 검색 기록, 못 찾은 것을 구조화해서 반환하라.`)
  return p.join('\n')
}
function triagePrompt() {
  return [langLine, `학위생 세 명의 조사 결과를 받아 의제(agenda)와 보류함(parked)으로 나눠라.`,
    `기준은 주제 적합성이 아니라 "이 랩에서 실제로 검증 가능한가". 삭제 금지, 보류만 가능. 보류 사유 한 줄 + 재검토 조건 필수.`,
    `보류함이 비거나 의제가 비면 과잉 가지치기다. 양쪽 다 채워라. 학위생의 ideas 항목도 전부 어느 한쪽에 배치하라.`,
    mode === 'resume' ? `이번 미팅은 보류함 재개방이다. 기존 보류 항목 중 조사 결과가 있는 것은 의제로 올려라.` : '',
    `\n${renderTable()}`].join('\n')
}
function orderPrompt() {
  return [langLine, `포스닥이 정리한 의제를 받아 토론 순서를 정하고 5문장 이내로 개회 발언을 하라. 검색 금지. 근거를 새로 제시하지 말 것. 모르는 것은 "그건 누가 확인했나?"로 되돌려라.`,
    `\n${renderTable()}`].join('\n')
}
function debatePrompt(g, n, demotions) {
  const p = [langLine, TAG_RULE, `당신은 ${ROLES[g].label}. 전담 관점을 유지하되 입장은 더 나은 근거 쪽으로 바꿀 수 있다 (changed_position).`]
  p.push(`다른 참가자 발언에 대해 반론 전 가장 강한 형태로 요약(steelman)하고 agree/disagree/partial을 표시하라. 필요하면 추가 검색을 하고 new_searches에 기록하라.`)
  if (g === 'G2') p.push(`반대 증거를 계속 가져와라. 없으면 not_found에 검색어와 함께 기록.`)
  if (demotions.length) p.push(`\n⚠ 인용 검증 실패로 강등된 주장:\n${demotions.map((d) => `  - (#${d.id}) ${d.claim} [${d.demoted_from}→${d.tag}] ${d.flags.join(', ')}`).join('\n')}\n이 주장에 의존했다면 입장을 재검토하라.`)
  p.push(`\n${renderTable()}`)
  const last = rounds[rounds.length - 1]
  if (last && last.professor && last.professor.intervene) p.push(`\n교수 개입(직전 라운드):\n${last.professor.interventions.map((iv) => `[${iv.kind}] ${iv.text}`).join('\n')}`)
  if (last && last.postdoc && last.postdoc.experiment_to_split) p.push(`\n포스닥 제안 실험: ${last.postdoc.experiment_to_split}`)
  p.push(`\n라운드 ${n}: 의제 순서대로 입장을 밝히고 태그된 주장을 제시하라.`)
  return p.join('\n')
}
function feasPrompt(n) {
  return [langLine, TAG_RULE, `당신은 포스닥. 이번 라운드 학위생 발언에 대해 실현 가능성만 다뤄라: 비용, 시간, 장비, 대조군 설계, "그 실험은 이 조건에서 안 된다". 검색은 확인 목적만.`,
    `현재 가장 중요한 갈림길(두 가설)을 구분할 실험이 있으면 experiment_to_split에 설계 요지를 적어라.`,
    `\n${renderTable()}`].join('\n')
}
function criticPrompt(scope, n) {
  const p = [langLine, `당신은 두 번째 포스닥, 상시 비판 담당. 새 문헌을 찾아오지 마라 (그건 학위생 일). 이미 테이블 위에 올라온 논증만 공격하라.`,
    `점검 항목: 근거불일치(붙은 PMID가 그 주장을 실제로 지지하는가) / 논리비약(상관→인과, 충분→필요, in vitro→in vivo, 과발현→생리적 역할; INFER 주장의 추론 단계를 한 칸씩) / 교란변수 / 방법론(대조군·표본수·항체·세포주·통계) / 과잉일반화(종·조직·농도·시간 한정 결과의 승격) / 에코(학위생 반응이 거의 전부 agree/partial이거나 같은 소수 논문만 돌려 인용).`,
    `심각도 "상"은 해소 전에는 결론을 낼 수 없다는 뜻이다. 남발하면 당신의 "상"이 무시된다. 트집은 올리지 마라. 사람이 아니라 논증을 공격하라.`,
    `지적이 없으면 nothing_found=true로 두되 checked에 무엇을 점검했는지 반드시 적어라.`]
  if (scope === 'triage') {
    p.push(`\n지금은 토론 전, 포스닥의 의제/보류함 분리를 검토한다. 검증 가능성을 이유로 가치 있는 아이디어가 보류된 것은 아닌지, 반대로 검증 불가능한 것이 의제에 올라온 것은 아닌지 보라. 보류함이나 의제가 비어 있으면 과잉/과소 가지치기다.`)
  } else {
    p.push(`\n라운드 ${n} 종료 시점. 이전 라운드에 당신이 올린 "상" 지적이 설득력 있게 답변되지 않았으면 unaddressed_high=true를 유지하라. 이 플래그가 켜져 있는 동안 합의로 토론이 끝나지 않는다.`)
  }
  p.push(`\n${renderTable()}`)
  return p.join('\n')
}

function checkPrompt(n) {
  return [langLine, `당신은 교수. 검색 금지, 새 근거 제시 금지. 테이블 위 내용만 본다.`,
    `기본값은 개입하지 않음(intervene=false). 다음 경우에만 개입: 논의가 겉돈다(narrow) / 근거 없는 주장이 합의처럼 굳는다(brake, 해당 주장을 unsupported_consensus에) / 중요한 갈림길에서 "그 두 가설을 구분할 실험이 뭔가?"(crux) / 보류함 아이디어를 꺼낼 때(reopen, reopen_index 지정).`,
    `비판 담당 포스닥의 지적을 읽어라. "상" 지적이 답변되지 않았는데 학위생들이 넘어가려 하면 brake를 걸어라. 에코 수렴 경보가 켜졌으면 수렴을 확증으로 읽지 마라.`,
    `개입은 최대 2개, 각 5문장 이내. 당신이 아는 것 같은 사실은 "그건 누가 확인했나?"로 되돌려라.`,
    `converged: 세 관점이 같은 결론을 지지. evidence_exhausted: 이번 라운드 new_searches가 새 정보를 내놓지 않음. stalled: 같은 말 반복.`,
    `\n${renderTable()}`, `\n라운드 ${n} 종료 시점 판단.`].join('\n')
}
function verifyPrompt(batch) {
  return [`아래 인용 각각의 실존 여부와, 제목·연도·저널이 붙어 있는 주장과 맞는지 확인하라. PMID는 PubMed MCP get_article_metadata(ToolSearch로 로드) 또는 WebFetch https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=<PMID>&retmode=json . DOI는 WebFetch https://api.crossref.org/works/<DOI> (404면 https://api.openalex.org/works/doi:<DOI>).`,
    `새 문헌 검색 금지. 네트워크/도구 오류는 exists=null 로 보고(날조 아님). 제목이 주장과 명백히 무관하면 matches_claim=false, 판단 불가면 null.`,
    `\n인용 목록:\n${batch.map((b) => `- ${b.kind.toUpperCase()} ${b.id}\n    주장: ${b.claims.map((c) => clip(c, 160)).join(' / ')}`).join('\n')}`].join('\n')
}
function liveObjections() {
  const last = rounds[rounds.length - 1]
  const out = []
  for (const r of rounds) for (const o of (r.critic ? r.critic.objections : [])) if (o.severity === '상') out.push({ ...o, round: r.n })
  return { high: out, stillOpen: !!(last && last.critic && last.critic.unaddressed_high), echo: !!(last && last.critic && last.critic.echo_warning) }
}
function finalPrompt(verif) {
  const live = ledger.filter((c) => c.owner !== 'professor')
  const lo = liveObjections()
  const criticBlock = lo.high.length || lo.echo
    ? `\n## 비판 담당 포스닥의 "상" 지적\n${lo.high.map((o) => `- (r${o.round}) [${o.kind}] ${o.target} → ${o.problem}`).join('\n') || '(없음)'}${lo.stillOpen ? '\n⛔ 위 지적 중 미해소가 남아 있다.' : ''}${lo.echo ? '\n⚠ 에코 수렴 경보: 학위생들의 합의가 독립적 확증이 아닐 수 있다.' : ''}\n해소되지 않은 "상" 지적에 의존하는 내용은 can_say에 넣지 말고 cannot_say로 보내라. 에코 경보가 켜져 있으면 "세 관점이 동의했다"를 확증으로 쓰지 마라.`
    : ''
  return [langLine, `당신은 교수. 최종 정리. 검색 금지, 새 근거 금지. 승자를 뽑지 마라. 복합적 결론이 정상이다.`,
    `- can_say / cannot_say: 현재 검증된 근거로 말할 수 있는 것과 없는 것.`,
    `- confidence: 높음/중간/낮음/결론 불가. "결론 불가"는 실패가 아니다.`,
    `- agreed_claim_ids: 아래 주장 목록에서 세 관점이 모두 지지하고 검증 통과한 EST/CONTESTED의 id만. SPEC/UNVERIFIED는 절대 포함 금지.`,
    `- disagreements: 남은 이견 전부, 세 관점 각각의 입장과 왜 갈렸는지. 비어 있으면 안 됨(정말 없으면 왜 없는지 issue에 적어라).`,
    `- conditional: "A 조건에서는 X, B 조건에서는 Y". 단일 결론으로 압축 금지.`,
    `- no_literature: 문헌에 답이 없는 것. next_steps: 할 일/왜/누구·무엇으로.`,
    `\n${renderTable()}`,
    criticBlock,
    `\n## 검증 결과\n${verif.report}`,
    `\n## 주장 목록 (id 기준)\n${renderClaims(live)}`].join('\n')
}

// ---------- Phase 0: scope ----------
phase('Scope')
if (mode === 'full' && !forcedType) {
  const s = await call('professor', scopePrompt(), { label: '교수 · 범위', phase: 'Scope', schema: SCOPE_SCHEMA })
  if (s) {
    qtype = s.type
    log(`🎓 교수: 유형 ${s.type}${s.worth_meeting ? '' : ' — 랩미팅 불필요'} · ${clip(s.reason, 100)}`)
  }
}
if (!qtype) qtype = mode === 'quick' ? 'A' : 'B'
const quickPath = mode === 'quick' || qtype === 'A'
if (qtype === 'C') maxRounds = Math.max(maxRounds, 4)

// ---------- Phase 1: research ----------
phase('Research')
const studentSet = quickPath ? ['G1'] : ['G1', 'G2', 'G3']
const outs = await parallel(studentSet.map((g) => () => call(g, researchPrompt(g, quickPath), { label: `${ROLES[g].label} · 조사`, phase: 'Research', schema: RESEARCH_SCHEMA })))
studentSet.forEach((g, i) => {
  if (!outs[i]) return
  research[g] = outs[i]
  addClaims(g, 'research', 0, outs[i].claims)
  log(`📚 ${ROLES[g].label}: 주장 ${outs[i].claims.length}건, 검색 ${outs[i].searches.length}회${outs[i].not_found.length ? `, 못 찾음 ${outs[i].not_found.length}건` : ''}`)
})
if (!Object.keys(research).length) return { error: '학위생 조사 결과 없음 (모든 에이전트 실패)' }

// ---------- Phase 2: triage ----------
if (!quickPath) {
  phase('Triage')
  const t = await call('postdoc', triagePrompt(), { label: '포스닥 · 사전 정리', phase: 'Triage', schema: TRIAGE_SCHEMA })
  if (t) {
    triage = { agenda: t.agenda, parked: [...triage.parked, ...t.parked] }
    log(`🗂️ 포스닥: 의제 ${t.agenda.length}건 / 보류 ${t.parked.length}건${!t.agenda.length || !t.parked.length ? ' ⚠ 과잉 가지치기 의심' : ''}`)
  }
  criticTriage = await call('critic', criticPrompt('triage', 0), { label: '포스닥 비판 · 가지치기', phase: 'Triage', schema: CRITIC_SCHEMA })
  if (criticTriage) log(`🔪 포스닥 비판 (가지치기): 지적 ${criticTriage.objections.length}건${criticTriage.objections.some((o) => o.severity === '상') ? ' (상 포함)' : ''}`)
  const o = await call('professor', orderPrompt(), { label: '교수 · 순서', phase: 'Triage', schema: ORDER_SCHEMA })
  if (o) {
    order = o.order.filter((i) => Number.isInteger(i) && triage.agenda[i])
    log(`🎓 교수 개회: ${clip(o.opening, 120)}`)
  }
}

// ---------- Phase 3: debate ----------
const demotions = [] // filled by verify; injected on rerun
async function runRound(n) {
  phase('Debate')
  const r = { n, students: {}, postdoc: null, critic: null, professor: null }
  const so = await parallel(['G1', 'G2', 'G3'].map((g) => () => call(g, debatePrompt(g, n, demotions), { label: `${ROLES[g].label} · r${n}`, phase: 'Debate', schema: DEBATE_SCHEMA })))
  ;['G1', 'G2', 'G3'].forEach((g, i) => {
    if (!so[i]) return
    r.students[g] = so[i]
    addClaims(g, 'debate', n, so[i].claims)
    log(`🗣️ ${ROLES[g].label} r${n}: ${clip(so[i].position, 100)}${so[i].changed_position ? ' ↻' : ''}`)
  })
  rounds.push(r)
  const f = await call('postdoc', feasPrompt(n), { label: `포스닥 · r${n}`, phase: 'Debate', schema: FEAS_SCHEMA })
  if (f) {
    r.postdoc = f
    addClaims('postdoc', 'debate', n, f.notes.map((x) => ({ claim: `${x.about}: ${x.constraint}`, tag: x.tag, pmids: x.pmids, dois: x.dois, note: '' })))
  }
  const cr = await call('critic', criticPrompt('round', n), { label: `포스닥 비판 · r${n}`, phase: 'Debate', schema: CRITIC_SCHEMA })
  if (cr) {
    r.critic = cr
    const high = cr.objections.filter((o) => o.severity === '상').length
    log(`🔪 포스닥 비판 r${n}: 지적 ${cr.objections.length}건 (상 ${high})${cr.echo_warning ? ' · ⚠ 에코 수렴 경보' : ''}${cr.unaddressed_high ? ' · ⛔ 미해소' : ''}`)
  }
  const c = await call('professor', checkPrompt(n), { label: `교수 · r${n} 점검`, phase: 'Debate', schema: CHECK_SCHEMA })
  if (c) {
    r.professor = c
    if (c.intervene) {
      c.interventions = c.interventions.slice(0, 2)
      interventionsTotal += c.interventions.length
      for (const iv of c.interventions) {
        log(`🎓 교수 [${iv.kind}] r${n}: ${clip(iv.text, 100)}`)
        if (iv.kind === 'reopen' && triage.parked[iv.reopen_index] && !reopened.some((x) => x.index === iv.reopen_index)) {
          reopened.push({ index: iv.reopen_index, round: n })
          triage.agenda.push({ item: triage.parked[iv.reopen_index].idea, from: '보류함 재개방', why: iv.text })
        }
      }
    }
    // deadlock → reopen parked (spec §3.2); type D reopens once by default
    const wantReopen = (c.stalled || (qtype === 'D' && n === 1)) && !reopened.length
    if (wantReopen && triage.parked.length) {
      reopened.push({ index: 0, round: n })
      triage.agenda.push({ item: triage.parked[0].idea, from: '보류함 재개방', why: c.stalled ? '교착' : '유형 D 기본 재개방' })
      log(`📂 보류함 재개방: ${clip(triage.parked[0].idea, 80)}`)
    }
  }
  return c
}

if (quickPath) stopReason = 'quick'
else {
  for (let n = 1; n <= maxRounds; n++) {
    const c = await runRound(n)
    const cr = rounds[rounds.length - 1].critic
    // critic veto: an unanswered high-severity objection (or an echo-convergence alarm) blocks closing by consensus
    const blocked = !!cr && (cr.unaddressed_high || (cr.echo_warning && c && c.converged))
    if (c && c.converged && n >= 2 && blocked) {
      criticVetoes++
      log(`⛔ 비판 포스닥 거부권: 수렴했지만 ${cr.unaddressed_high ? '"상" 지적이 미해소' : '에코 수렴 경보'} — 종료하지 않음`)
      continue
    }
    if (c && c.converged && n >= 2) { stopReason = 'converged'; break }
    if (c && c.converged && n === 1) log('⚠ 1라운드 수렴 — 가짜 수렴 의심, 계속 진행')
    if (c && c.evidence_exhausted && n >= 2 && !blocked) { stopReason = 'evidence_exhausted'; break }
  }
}

// ---------- Phase 4: verify ----------
phase('Verify')
async function verifyPass() {
  const byId = new Map()
  for (const c of ledger) {
    for (const p of c.pmids) { const k = 'pmid:' + p; if (!byId.has(k)) byId.set(k, { id: p, kind: 'pmid', claims: [] }); byId.get(k).claims.push(c.claim) }
    for (const d of c.dois) { const k = 'doi:' + d; if (!byId.has(k)) byId.set(k, { id: d, kind: 'doi', claims: [] }); byId.get(k).claims.push(c.claim) }
  }
  const items = [...byId.values()]
  const batches = []
  for (let i = 0; i < items.length; i += 12) batches.push(items.slice(i, i + 12))
  const outs = await parallel(batches.map((b, i) => () => call('postdoc', verifyPrompt(b), { label: `검증 ${i + 1}/${batches.length}`, phase: 'Verify', schema: VERIFY_SCHEMA, effort: 'low' })))
  const results = new Map()
  outs.filter(Boolean).forEach((o) => o.results.forEach((r) => results.set(`${r.kind}:${r.kind === 'pmid' ? normPmid(r.id) : normDoi(r.id)}`, r)))
  let ok = 0, bad = 0, unchecked = 0
  const badIds = new Set(), uncheckedIds = new Set()
  for (const [k, it] of byId) {
    const r = results.get(k)
    if (!r || r.exists === null) { unchecked++; uncheckedIds.add(k); continue }
    if (r.exists === false || r.matches_claim === false) { bad++; badIds.add(k); continue }
    ok++
  }
  const newDemotions = []
  for (const c of ledger) {
    const keys = [...c.pmids.map((p) => 'pmid:' + p), ...c.dois.map((d) => 'doi:' + d)]
    const flags = []
    if (keys.some((k) => badIds.has(k))) flags.push('⚠ UNVERIFIED')
    if (keys.some((k) => uncheckedIds.has(k))) flags.push('? UNCHECKED')
    const verifiedCount = keys.filter((k) => !badIds.has(k) && !uncheckedIds.has(k)).length
    let to = null
    if (flags.includes('⚠ UNVERIFIED')) to = 'SPEC'
    else if (c.tag === 'EST' && verifiedCount === 0) { to = 'SPEC'; flags.push('근거 없음') }
    else if (c.tag === 'CONTESTED' && verifiedCount < 2) { to = 'INFER'; flags.push('한쪽 근거만') }
    c.flags = flags
    if (to && to !== c.tag && !c.demoted_from) {
      c.demoted_from = c.tag; c.tag = to
      newDemotions.push(c)
    }
  }
  const report = [
    `등장 인용 ${items.length}건 / 검증 성공 ${ok}건 / ⚠ UNVERIFIED ${bad}건 / ? UNCHECKED ${unchecked}건`,
    ...[...byId.keys()].filter((k) => badIds.has(k)).map((k) => { const r = results.get(k); return `  ⚠ ${k}: ${r.exists === false ? '실존하지 않음' : '내용 불일치'}${r.title ? ' — ' + clip(r.title, 80) : ''} ${r.note ? '(' + clip(r.note, 80) + ')' : ''}` }),
    ...(newDemotions.length ? ['강등:', ...newDemotions.map((c) => `  - (#${c.id}) ${clip(c.claim, 100)} [${c.demoted_from}→${c.tag}] ${c.flags.join(', ')}`)] : ['강등 없음']),
  ].join('\n')
  log(`🔎 검증: ${items.length}건 중 성공 ${ok}, 실패 ${bad}, 미확인 ${unchecked}, 강등 ${newDemotions.length}`)
  return { items: items.length, ok, bad, unchecked, newDemotions, report, results: [...results.values()] }
}
let verif = await verifyPass()
demotions.push(...verif.newDemotions)
const needsRerun = rerunOnFail && !quickPath && verif.newDemotions.some((c) => c.demoted_from === 'EST' || c.demoted_from === 'CONTESTED')
let rerun = false
if (needsRerun) {
  rerun = true
  log('↩️ EST/CONTESTED 주장 강등 → 토론 1라운드 재실행')
  await runRound(rounds.length + 1)
  const v2 = await verifyPass()
  demotions.push(...v2.newDemotions)
  verif = { ...v2, report: verif.report + '\n\n재검증:\n' + v2.report }
}

// ---------- Phase 5: synthesis ----------
phase('Synthesis')
const fin = await call('professor', finalPrompt(verif), { label: '교수 · 최종 정리', phase: 'Synthesis', schema: FINAL_SCHEMA })
if (!fin) return { error: '교수 최종 정리 실패', ledger, rounds, triage, verification: verif }

// ---------- minutes (deterministic) ----------
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const agreed = fin.agreed_claim_ids.map((i) => ledger[i]).filter((c) => c && c.owner !== 'professor' && (c.tag === 'EST' || c.tag === 'CONTESTED') && !c.flags.includes('⚠ UNVERIFIED'))
const notFound = []
for (const g of Object.keys(research)) for (const n of research[g].not_found) notFound.push({ who: g, ...n })
for (const r of rounds) for (const g of Object.keys(r.students)) for (const n of r.students[g].not_found) notFound.push({ who: g, ...n })
const critObj = liveObjections()
const critAll = rounds.reduce((s, r) => s + (r.critic ? r.critic.objections.length : 0), 0) + (criticTriage ? criticTriage.objections.length : 0)
const STOP_KO = { converged: '수렴', evidence_exhausted: '증거 소진', rounds_exhausted: '라운드 초과 (실패 아님 — 현재 문헌으로 결론이 나지 않는 열린 질문)', quick: '저비용 모드 (토론 없음 — 학위생 1명 + 검증 + 교수 정리)' }
const minutes = [
  `# 랩미팅 회의록: ${question}`,
  today ? `\n날짜: ${today} · 모드: ${mode} · 유형: ${qtype}` : `\n모드: ${mode} · 유형: ${qtype}`,
  `\n## 1. 교수 정리 (Bottom line)`,
  `- 현재 근거로 말할 수 있는 것:`, ...fin.can_say.map((s) => `  - ${s}`),
  `- 말할 수 없는 것:`, ...fin.cannot_say.map((s) => `  - ${s}`),
  `- 신뢰도: ${fin.confidence}`,
  `\n## 2. 합의된 내용`, `| 주장 | 등급 | 근거 (PMID) | 검증 |`, `|---|---|---|---|`,
  ...(agreed.length ? agreed.map((c) => `| ${esc(c.claim)} | ${c.tag} | ${esc(cite(c))} | ${c.flags.length ? esc(c.flags.join(', ')) : '✓'} |`) : ['| (검증 통과한 합의 주장 없음) | | | |']),
  `\n## 3. 남은 이견`, `| 쟁점 | G1 입장 | G2 입장 | G3 입장 | 왜 갈렸는가 |`, `|---|---|---|---|---|`,
  ...(fin.disagreements.length ? fin.disagreements.map((d) => `| ${esc(d.issue)} | ${esc(d.G1)} | ${esc(d.G2)} | ${esc(d.G3)} | ${esc(d.why_split)} |`) : ['| ⚠ 이견 없음 — 가짜 수렴 의심 (질문이 너무 쉽거나 관점 분리 실패) | | | | |']),
  `\n## 4. 조건부 결론`,
  ...(fin.conditional.length ? fin.conditional.map((c) => `- **${c.condition}** → ${c.conclusion}`) : ['- (조건부 결론 없음 — 단일 결론 압축 여부 점검)']),
  `\n## 5. 미해결 질문`,
  `- 문헌에 답이 없는 것:`, ...fin.no_literature.map((s) => `  - ${s}`),
  `- 찾아봤으나 못 찾은 것 (검색어 포함):`, ...notFound.map((n) => `  - [${n.who}] ${n.what} — 검색어: ${n.queries.join('; ')}`),
  ...(critObj.high.length ? [`- 비판 담당 포스닥이 제기했으나 해소되지 않은 "상" 지적:`, ...critObj.high.map((o) => `  - (r${o.round}) [${o.kind}] ${o.target} — ${o.problem}`)] : []),
  `\n## 6. 다음에 확인할 것`, `| 할 일 | 왜 | 누구/무엇으로 |`, `|---|---|---|`,
  ...fin.next_steps.map((s) => `| ${esc(s.task)} | ${esc(s.why)} | ${esc(s.how)} |`),
  `\n## 7. 보류함 (parked)`, `| 아이디어 | 보류 사유 | 재검토 조건 |`, `|---|---|---|`,
  ...(triage.parked.length
    ? triage.parked.map((p, i) => { const ro = reopened.find((x) => x.index === i); return `| ${esc(p.idea)}${ro ? ` (재개방됨, r${ro.round})` : ''} | ${esc(p.reason)} | ${esc(p.condition)} |` })
    : [`| ${quickPath ? '(저비용 모드 — 포스닥 가지치기 생략)' : '⚠ 보류함 비어 있음 — 포스닥 과잉 가지치기 의심'} | | |`]),
  `\n## 8. 검증 리포트`,
  ...verif.report.split('\n').map((l) => (l.startsWith('  ') ? l : `- ${l}`)),
  `- 종료 사유: ${STOP_KO[stopReason]}${rerun ? ' · 검증 실패로 1라운드 재실행' : ''}`,
  `- 라운드 ${rounds.length}회 · 교수 개입 ${interventionsTotal}회 · 태그된 주장 ${ledger.length}건 (SPEC ${ledger.filter((c) => c.tag === 'SPEC').length}건)`,
  `- 비판 담당 포스닥: 지적 ${critAll}건 (상 ${critObj.high.length}) · 거부권 행사 ${criticVetoes}회${critObj.stillOpen ? ' · ⛔ 미해소 "상" 지적 있음' : ''}${critObj.echo ? ' · ⚠ 에코 수렴 경보 (합의를 독립 확증으로 읽지 말 것)' : ''}`,
].join('\n')

return {
  minutes_md: minutes,
  confidence: fin.confidence,
  stop_reason: stopReason,
  type: qtype, mode, rounds_used: rounds.length, interventions: interventionsTotal, rerun,
  critic: { objections: critAll, high: critObj.high.length, vetoes: criticVetoes, unaddressed_high: critObj.stillOpen, echo_warning: critObj.echo, triage: criticTriage },
  bottom_line: fin,
  verification: { items: verif.items, ok: verif.ok, bad: verif.bad, unchecked: verif.unchecked, demoted: demotions.map((c) => ({ id: c.id, claim: c.claim, from: c.demoted_from, to: c.tag, flags: c.flags })) },
  ledger, triage, reopened, research, rounds, question,
}
