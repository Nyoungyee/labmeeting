# labmeeting

생물학 연구 질문을 6인 랩미팅 구조로 분해·토론·검토하는 Claude Code 플러그인.

교수(Opus, **검색 금지**) + 포스닥 2인(실현 가능성 / **상시 비판**) + 학위생 3인(지지 / 반대 / 대안, 병렬). 모든 주장은 `[EST]/[CONTESTED]/[INFER]/[SPEC]` 태그 필수, 모든 PMID/DOI 검증, 승자 없음, 이견 보존.

비판 포스닥은 가설이 아니라 **논증과 회의 과정**을 공격한다: 인용이 그 주장을 실제로 지지하는지, 상관이 인과로 바뀌지 않았는지, 학위생 셋이 같은 논문만 돌려 인용하며 메아리로 수렴하고 있지 않은지. 해소되지 않은 "상" 지적이 있으면 합의로 토론이 끝나지 않는다.

[dyubero/conclave](https://github.com/dyubero/conclave)를 포크했다 (MIT). Workflow 루프 골격과 구조화 스키마 패턴을 가져오고, 모델 정체성 위장·인지 스타일·비준 투표·HTML 뷰어는 뺐다.

## 설치

```text
/plugin marketplace add Nyoungyee/labmeeting
/plugin install labmeeting@labmeeting-marketplace
```

PubMed MCP 커넥터를 세션에 연결해 두면 학위생이 쓴다 (bioRxiv / ChEMBL / ClinicalTrials도 연결 가능).

## 사용

```text
/labmeeting <질문>                         # 전체 파이프라인
/labmeeting <질문> --rounds 4 --type C     # 기전·인과 추론
/labmeeting-quick <질문>                   # 학위생 1명 + 검증 + 교수
/labmeeting-resume labmeeting-xxx.md       # 보류함 재개방 후 재토론
```

플래그: `--rounds N` · `--type A|B|C|D` · `--lang xx` · `--context <path>` · `--students haiku` · `--save <path>`

## 구조

```text
agents/        professor · postdoc · postdoc-critic · student-support · student-oppose · student-alternative
commands/      labmeeting · labmeeting-quick · labmeeting-resume
skills/        labmeeting (SKILL.md + labmeeting.workflow.mjs) · claim-tagging · citation-verify · minutes
eval/          questions.md (먼저 채울 것) · baseline/
docs/superpowers/specs/   설계 명세
test/          mock-run.mjs — 에이전트를 스텁으로 바꿔 제어 흐름과 회의록 렌더를 검사
```

## 먼저 할 일

`eval/questions.md`에 본인 분야 질문 20~30개와 "좋은 답의 조건"을 적고, 단일 에이전트 베이스라인과 비교하라. multi-agent debate가 단일 에이전트 self-consistency를 꾸준히 이긴다는 증거는 약하다 (Smit et al. 2024, Zhang et al. 2025). 이 플러그인의 가치는 정답률이 아니라 근거 태그 + 반증 강제 + 이견 보존에 있다.

## 테스트

```bash
node test/mock-run.mjs
```
