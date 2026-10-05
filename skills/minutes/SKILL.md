---
name: minutes
description: Lab-meeting minutes format (8 sections, no winner, dissent preserved). The workflow script renders `minutes_md` deterministically from structured data; this skill documents the format and the rendering rules so the main loop and reviewers know what every section means.
---

# minutes

회의록은 스크립트가 구조화 데이터에서 **결정적으로** 렌더합니다 (`result.minutes_md`). 에이전트가 자유 작문하지 않으므로 태그 없는 주장이 끼어들 수 없습니다. 메인 루프는 이 문자열을 파일로 쓰기만 합니다.

## 형식

```markdown
# 랩미팅 회의록: <질문>

## 1. 교수 정리 (Bottom line)
- 현재 근거로 말할 수 있는 것:
- 말할 수 없는 것:
- 신뢰도: 높음 / 중간 / 낮음 / 결론 불가

## 2. 합의된 내용
| 주장 | 등급 | 근거 (PMID) | 검증 |

## 3. 남은 이견          ← 생략 금지. 비어 있으면 "없음 — 가짜 수렴 의심" 경고가 들어감
| 쟁점 | G1 입장 | G2 입장 | G3 입장 | 왜 갈렸는가 |

## 4. 조건부 결론
"A 조건에서는 X, B 조건에서는 Y". 단일 결론으로 압축하지 않음.

## 5. 미해결 질문
- 문헌에 답이 없는 것
- 찾아봤으나 못 찾은 것 (검색어 포함)
- 비판 담당 포스닥이 제기했으나 해소되지 않은 "상" 지적

## 6. 다음에 확인할 것
| 할 일 | 왜 | 누구/무엇으로 |

## 7. 보류함 (parked)
| 아이디어 | 보류 사유 | 재검토 조건 |

## 8. 검증 리포트
- 등장 인용 N건 / 검증 성공 M건 / ⚠ UNVERIFIED K건 / ? UNCHECKED J건
- 강등된 주장 목록
- 종료 사유: 수렴 / 증거 소진 / 라운드 초과 (라운드 초과는 실패가 아님)
- 비판 담당 포스닥: 지적 N건 (상 M) · 거부권 행사 K회 · 에코 수렴 경보 여부
- 교수 개입 횟수, 라운드 수
```

## 렌더 규칙

- §2에는 검증 통과한 `EST`/`CONTESTED`만. `SPEC`은 절대 §2에 들어가지 않음.
- §3이 비면 경고 문구를 넣음 (1라운드 만에 전원 동의 = 질문이 쉽거나 관점 분리 실패).
- §8의 에코 수렴 경보가 켜져 있으면 §2의 합의를 독립 확증으로 읽으면 안 된다.
- §7은 포스닥 보류함 전체. 재개방된 항목은 "(재개방됨, r{n})" 표시.
- 파일명: `labmeeting-<slug>-<YYYY-MM-DD>.md`, cwd. `--save <path>`로 변경.
