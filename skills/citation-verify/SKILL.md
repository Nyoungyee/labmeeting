---
name: citation-verify
description: How the lab-meeting verification pass checks every PMID/DOI that appeared in the debate — existence via PubMed MCP / CrossRef, then title-year-journal vs the claim. Load when acting as the verifier agent or when interpreting the verification report.
---

# citation-verify

Phase 4. 회의록 작성 전에 토론에 등장한 **모든** PMID/DOI를 검증합니다.

## 절차 (검증 에이전트)

입력: `[{ id, kind: "pmid"|"doi", claims: ["..."] }]`

각 항목에 대해:

1. **실존 확인**
   - PMID: PubMed MCP `get_article_metadata`(또는 `lookup_article_by_citation`)로 조회. MCP가 없으면 WebFetch로
     `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=<PMID>&retmode=json`
   - DOI: WebFetch `https://api.crossref.org/works/<DOI>` (404면 `https://api.openalex.org/works/doi:<DOI>`)
2. **내용 대조**: 돌아온 제목·연도·저널이 그 인용에 붙은 주장(들)과 맞는가.
   - 제목이 주장과 명백히 무관하면 `matches_claim: false`
   - 판단 불가(초록 없음 등)면 `null`
3. **네트워크/도구 오류**는 날조가 아닙니다. `exists: null`, `note: "network error"`로 보고합니다.

출력: `{ results: [{ id, kind, exists: true|false|null, title, year, journal, matches_claim: true|false|null, note }] }`

## 판정 (스크립트가 결정적으로 수행)

| 상황 | 처리 |
|---|---|
| `exists === false` | `⚠ UNVERIFIED`, 그 인용에 의존하는 주장 전부 `SPEC` 강등 |
| `matches_claim === false` | `⚠ UNVERIFIED`, 동일 강등 |
| `exists === null` (오류) | `? UNCHECKED`, 강등 없음, 리포트에 표시 |
| `EST`인데 인용 0건 | `SPEC` 강등 |
| `CONTESTED`인데 인용 1건 이하 | `INFER` 강등 |

강등이 `EST`/`CONTESTED` 주장을 건드렸고 재실행 허용이면 토론을 1라운드 더 돌립니다 (강등 목록을 모든 참가자에게 주입).

## 검증 에이전트는 포스닥

포스닥 에이전트 정의가 "검증 목적 외 검색 금지"를 담고 있으므로 이 패스에 적합합니다. 새 문헌을 찾아오지 않습니다.
