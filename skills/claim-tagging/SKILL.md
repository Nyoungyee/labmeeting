---
name: claim-tagging
description: Claim-tag rules for lab-meeting debates — every substantive claim carries exactly one of EST / CONTESTED / INFER / SPEC with the evidence that tag requires. Load when writing or judging lab-meeting speech, or when rendering minutes.
---

# claim-tagging

토론 연극(debate theater)을 막는 장치. 다섯 에이전트가 그럴듯한 대화를 주고받지만 아무도 자료를 찾지 않은 채 서로의 추측을 강화하는 것이 가장 흔한 실패입니다.

## 태그

| 태그 | 의미 | 필수 근거 |
|---|---|---|
| `EST` | 확립된 사실 | PMID 또는 DOI 1건 이상 |
| `CONTESTED` | 논쟁 중 | 양쪽 PMID 각 1건 이상 |
| `INFER` | 기존 근거로부터의 추론 | 출발점 PMID + 추론 단계를 문장으로 |
| `SPEC` | 근거 없는 추측 | "근거 없음" 명시 |

## 규칙

1. 태그 없는 주장은 회의록에서 **자동 제외**됩니다 (스크립트가 걸러냄).
2. `SPEC`은 금지가 아니라 환영. 브레인스토밍에 필요합니다. 단, **결론의 근거가 될 수 없습니다.**
3. 교수는 자료조사를 하지 않으므로 `INFER`, `SPEC`, 또는 다른 사람이 제시한 PMID 인용만 가능합니다. 교수의 `EST` 신규 선언은 무효.
4. 인용 검증 실패(`UNVERIFIED`) 시 해당 주장은 `SPEC`으로 **강등**됩니다. `EST`에 PMID가 없으면 역시 `SPEC`.
5. `CONTESTED`인데 한쪽 PMID만 있으면 `INFER`로 강등.

## 구조화 출력에서의 형태

```json
{ "claim": "ESCRT-III는 뉴런 엑소좀 분비에 필요하다", "tag": "EST", "pmids": ["12345678"], "dois": [], "note": "KO 마우스 1차 데이터" }
```

- `pmids`: 숫자 문자열. `dois`: `10.`으로 시작.
- `note`: INFER면 추론 단계, CONTESTED면 어느 PMID가 어느 쪽인지, SPEC이면 "근거 없음".
