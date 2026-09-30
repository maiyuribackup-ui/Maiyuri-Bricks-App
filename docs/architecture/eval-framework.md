# Maiyuri Eval Framework

Measures AI agent output quality **before** it reaches Ram or the team. Pure Python stdlib — no new tools required.

## Structure

```
MaiyuriOS/evals/
  run_evals.py                 # runner
  financial_accuracy.json      # 10 tests
  lead_resolution_accuracy.json # 10 tests
  daily_report_format.json     # 10 tests
  results/                     # timestamped JSON
  README.md                    # this file
```

## Run

```bash
/home/ram/.hermes/scripts/maiyuri_run_evals.sh          # all suites (summary)
/home/ram/.hermes/scripts/maiyuri_run_evals.sh --json   # JSON for agents/CI
cd /home/ram/MaiyuriOS/evals && python3 run_evals.py --suite financial_accuracy
```

Exit code 0 = all pass, 1 = failures.

## ClickHouse integration

Every run logs `eval.run` events (source=`eval_framework`) for trend tracking. AI Quality Agent (cron `1d153fe02647`) monitors pass-rate regression.

## Scorers

`exact` (with tolerance), `contains`, `not_contains`, `regex`, `length_range`, `truthy`, `gt`, `gte`.
