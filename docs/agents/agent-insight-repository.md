# Agent Insight Repository

Maiyuri Agentic OS must compound learning. Daily reports are not enough; each useful agent discovery should become a structured insight card that can be searched, reviewed, converted into actions, and used to improve future agents/SOPs.

## Principle

```text
Report → Insight → Owner/action → Outcome → SOP/system improvement → Better next report
```

## Runtime implementation

| Layer | Location |
|---|---|
| SQLite DB | `/home/ram/MaiyuriOS/data/agent_insights.db` |
| Markdown archive | `/home/ram/MaiyuriOS/insights/YYYY-MM-DD.md` |
| Capture CLI | `/home/ram/MaiyuriOS/scripts/agent_insight_repo.py` |
| Hermes wrapper | `~/.hermes/scripts/maiyuri_agent_insight_repo.sh` |
| Feedback Loop Cron | `9779536146fb` |

## Agent write-back rule

Every daily Maiyuri agent should produce at least one of:

1. `no durable insight today` — when nothing meaningful changed, or
2. 1–3 structured insight cards using the repository capture CLI.

Do not store full raw reports, secrets, full customer transcripts, or unvalidated financial claims.

## Insight card fields

```json
{
  "agent": "Sales Process Agent",
  "domain": "sales",
  "severity": "watch",
  "title": "High lead discussion but low closure movement",
  "summary": "Calls generated interest but follow-up completion did not match activity volume.",
  "evidence": "Daily sales report showed 6 AI call summaries across 4 leads; follow-up gap noted.",
  "recommendation": "Convert top 3 hot leads into same-day owner follow-up with status closure.",
  "owner": "Nithya",
  "next_action": "Close top 3 follow-ups before 11 AM and mark outcome",
  "due_date": "2026-08-26",
  "expected_impact": "Improves conversion discipline and reduces lead leakage.",
  "tags": ["sales", "follow-up", "conversion"]
}
```

## CLI

```bash
/home/ram/.hermes/scripts/maiyuri_agent_insight_repo.sh capture --json '<json>'
/home/ram/.hermes/scripts/maiyuri_agent_insight_repo.sh daily
/home/ram/.hermes/scripts/maiyuri_agent_insight_repo.sh search "conversion"
/home/ram/.hermes/scripts/maiyuri_agent_insight_repo.sh stats
```

## Feedback Loop Agent

The nightly Feedback Loop Repository agent reads recent specialist-agent outputs and writes distilled insights to the repository. It sends Ram a private learning-loop summary.

- Job ID: `9779536146fb`
- Schedule: 9:45 PM IST
- Delivery: Telegram/origin only
- Mutation scope: repository write only; no Todoist/Odoo/Supabase writes.
