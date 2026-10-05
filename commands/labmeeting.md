---
description: Run a full 5-role lab meeting (professor, postdoc, G1 support, G2 oppose, G3 alternative) on a biology research question. Claims tagged, citations verified, dissent preserved.
argument-hint: <question> [--rounds N] [--type A|B|C|D] [--save path] [--lang xx] [--context path] [--students haiku|sonnet]
---

Load the `labmeeting` skill (Skill tool, name `labmeeting:labmeeting` when installed as a plugin, `labmeeting` otherwise) and follow it with:

- `mode`: `full`
- `question`: `$ARGUMENTS` with the flags removed
- flags parsed from `$ARGUMENTS` as the skill's table describes

Do not rewrite the workflow script. Do not answer the question yourself.
