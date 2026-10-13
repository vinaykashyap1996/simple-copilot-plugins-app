---
name: issue-summarizer
description: Summarizes GitHub issues into concise action-oriented briefs.
---

# Issue Summarizer Skill

## Purpose
Summarize one or more issues into:
- Problem statement
- Current status
- Risks/blockers
- Next actions

## Inputs
- Issue title/body
- Optional comments
- Optional labels/milestone

## Output format
1. **Summary** (2-4 bullets)
2. **Blockers**
3. **Suggested next steps** (numbered)
4. **Open questions**

## Guardrails
- Do not invent missing facts.
- Mark uncertainty explicitly.
- Prefer concise, actionable language.
