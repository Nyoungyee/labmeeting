---
description: Low-cost lab meeting — one student (covering all three angles) + citation verification + professor bottom line. No debate rounds, no postdoc triage.
argument-hint: <question> [--save path] [--lang xx] [--context path]
---

Load the `labmeeting` skill (Skill tool, name `labmeeting:labmeeting` when installed as a plugin, `labmeeting` otherwise) and follow it with:

- `mode`: `quick`
- `question`: `$ARGUMENTS` with the flags removed
- flags parsed from `$ARGUMENTS` as the skill's table describes

Do not rewrite the workflow script. Do not answer the question yourself.
