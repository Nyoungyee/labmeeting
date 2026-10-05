---
name: labmeeting
description: Run a lab-meeting debate on a biology research question — professor (no search), two postdocs (feasibility + standing critic), and three viewpoint-locked students (support / oppose / alternative). Use ONLY when invoked explicitly via /labmeeting, /labmeeting-quick, /labmeeting-resume, or phrases like "랩미팅 열어줘", "hold a lab meeting about…". Not for ordinary questions (cost ≈ 10–20 agents).
---

# labmeeting

6인 랩미팅 구조로 생물학 연구 질문을 분해·토론·검토한다. "정답 여부" 대신 기계적으로 확인 가능한 대리 지표를 쓴다: 근거 충실성(PMID/DOI 검증), 반증 내성(G2), 관점 간 불일치(갈림 자체가 신호), 주장 유형 분리(`EST/CONTESTED/INFER/SPEC`).

**"모르겠다"는 실패가 아니라 유효한 출력이다.** 승자를 뽑지 않는다.

Workflow 도구로 실행된다. 이 스킬 호출이 opt-in이다.

## 1. 요청 파싱

| 변수 | 출처 | 기본값 |
|---|---|---|
| `question` | 플래그를 뺀 본문 | 필수 |
| `mode` | 호출한 명령어: `full` / `quick` / `resume` | `full` |
| `rounds` | `--rounds N` (최대 라운드) | 3 (유형 C는 자동 4) |
| `type` | `--type A\|B\|C\|D` 강제. 없으면 교수가 Phase 0에서 판정 | 자동 |
| `lang` | `--lang xx` 또는 사용자 메시지 언어 | `ko` |
| `context` | `--context <path>` → 메인 루프가 파일을 읽어 문자열로 전달 (resume이면 이전 회의록 §3) | 없음 |
| `parked` | resume 전용: 이전 회의록 §7 행 `[{idea, reason, condition}]` | `[]` |
| `models` | `--students haiku` → `{ students: 'haiku' }` | `{professor:'opus', postdoc:'sonnet', critic:'sonnet', students:'sonnet'}` |
| `savePath` | `--save [path]` | `labmeeting-<slug>-<today>.md` (cwd) |
| `today` | 오늘 날짜 `YYYY-MM-DD` (스크립트 안에서 Date 사용 불가) | 메인 루프가 채움 |
| `agentPrefix` | 플러그인 설치면 `labmeeting:`, `agents/*.md`를 `~/.claude/agents`에 복사했으면 `''` | `labmeeting:` |

`question`이 없으면 묻고 실행하지 않는다.

## 2. 실행

```
Workflow({
  scriptPath: "<이 SKILL.md의 base directory>/labmeeting.workflow.mjs",
  args: { question, mode, rounds, type, lang, context, parked, models, today, agentPrefix }
})
```

스크립트를 다시 쓰지 말 것. 경로는 스킬 로드 시 표시되는 `Base directory for this skill:` 줄에서 가져온다.

파이프라인: Phase 0 교수 범위 판단 → Phase 1 G1/G2/G3 병렬 조사 → Phase 2 포스닥 의제/보류 + 비판 포스닥 가지치기 검토 + 교수 순서 → Phase 3 토론 (라운드마다 학위생 3 병렬 → 포스닥 실현성 → 비판 포스닥 → 교수 점검, 개입은 필요 시만 최대 2회) → Phase 4 인용 검증 (실패 시 SPEC 강등, EST/CONTESTED가 강등되면 1라운드 재실행) → Phase 5 교수 최종 정리 → 회의록 렌더.

종료: 수렴(2라운드 이상) / 증거 소진 / 라운드 초과. 라운드 초과는 실패가 아니다.

**비판 포스닥 거부권**: 해소되지 않은 "상" 지적이 있거나 에코 수렴 경보가 켜져 있으면 수렴해도 토론이 끝나지 않는다 (`result.critic.vetoes`).

`quick` 또는 유형 A: 학위생 1명(G1이 세 관점 겸임) → 검증 → 교수 정리. 토론 없음, 비판 포스닥 없음.

## 3. 결과 처리

1. `result.error`면 그대로 보여주고 결과를 지어내지 않는다.
2. `result.minutes_md`를 **Write 도구**로 `savePath`에 저장한다 (UTF-8). 내용을 고치지 않는다.
3. 사용자에게 보고: 신뢰도(`result.confidence`), 종료 사유(`result.stop_reason`), 검증 요약(`result.verification`), 남은 이견 개수, 회의록 경로. 회의록 전체를 채팅에 붙이지 않는다.
4. 다음 경고가 해당되면 명시한다 (§7 체크리스트):
   - `verification.items`가 작고 주장 수가 많다 → 토론 연극
   - G2의 `not_found`가 비어 있고 반대 주장도 없다 → 합의 붕괴
   - `interventions`가 라운드 수 × 2에 가깝다 → 교수 과잉 개입
   - `triage.parked` 또는 `triage.agenda`가 비어 있다 → 과잉 가지치기
   - `critic.objections`가 0이거나 `critic.high`가 라운드마다 있다 → 비판 포스닥이 놀고 있거나 심각도를 남발 중
   - `critic.echo_warning` → 합의를 독립 확증으로 읽지 말 것
   - 회의록 §3이 경고 문구다 → 가짜 수렴
   - §4가 비어 있다 → 단일 결론 압축

## 4. 도구 권한

| 에이전트 | 검색 | 근거 |
|---|---|---|
| professor | 없음 (`tools: Read`) | agents/professor.md |
| postdoc | 검증 목적만 (프롬프트 제약) | agents/postdoc.md |
| postdoc-critic | 검증 목적만. 신규 문헌 탐색 금지 | agents/postdoc-critic.md |
| student ×3 | 전체 (PubMed/bioRxiv/ClinicalTrials/ChEMBL MCP + 웹) | ToolSearch로 로드 |

MCP 커넥터(PubMed 등)는 세션에 연결돼 있어야 한다. 없으면 학위생이 WebFetch로 E-utilities를 직접 친다.
