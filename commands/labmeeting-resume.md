---
description: Reopen the parked ideas from a previous lab-meeting minutes file and debate them (students re-research only the parked items).
argument-hint: <path-to-minutes.md> [--rounds N] [--save path] [--lang xx]
---

1. Read the minutes file given as the first argument of `$ARGUMENTS`.
2. Extract:
   - the question from the H1 (`# 랩미팅 회의록: <question>`)
   - every row of section `## 7. 보류함 (parked)` as `{ idea, reason, condition }`
   - section `## 3. 남은 이견` verbatim as `context`
3. If the parked table is empty, say so and stop — nothing to resume.
4. Load the `labmeeting` skill (Skill tool, name `labmeeting:labmeeting` when installed as a plugin, `labmeeting` otherwise) and follow it with:
   - `mode`: `resume`
   - `question`: the extracted question
   - `parked`: the extracted rows
   - `context`: the extracted dissent section
   - remaining flags parsed from `$ARGUMENTS`

Do not rewrite the workflow script. Do not answer the question yourself.
