#!/usr/bin/env python3
"""
Superfone <-> Maiyuri app call-recording reconciliation.

Matches every recorded Superfone call to a row in call_recordings, so that
"the pipeline is broken" becomes a measured number with a named cause.

Usage:
  python3 reconcile.py --superfone export.xlsx \
                       --recordings call_recordings.csv \
                       [--leads leads.csv] \
                       [--out ./reconciliation-output]

See ../references/METHOD.md for the matching method and known data quirks.
"""

import argparse
import json
import os
import re
import sys
from datetime import timedelta

try:
    import pandas as pd
except ImportError:
    sys.exit("pandas is required:  pip install pandas openpyxl")

# Superfone's export timestamps and the epoch embedded in recording filenames
# do NOT share a timezone, and the difference has changed before. Never
# hardcode it — search this range each run and report what was found.
OFFSET_SEARCH_HOURS = (0.0, 15.0)
OFFSET_STEP_HOURS = 0.25
MATCH_TOLERANCE = timedelta(minutes=3)

CAPTURED, LOST = "#1D6FA8", "#C2410C"          # validated light-mode pair
CAPTURED_DARK, LOST_DARK = "#4E97CF", "#DE7040"  # validated dark-mode pair


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def normalize_phone(value):
    """Last 10 digits. Handles +91, 0-prefix, spaces, and +974 style numbers."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) > 10:
        digits = digits[-10:]
    return digits if len(digits) == 10 else None


def pick_column(df, *candidates, required=True, label=""):
    """Find a column by case-insensitive name, tolerating export renames."""
    lookup = {c.lower().strip(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lookup:
            return lookup[cand.lower()]
    if required:
        sys.exit(
            f"Could not find the {label or candidates[0]} column.\n"
            f"  Looked for: {', '.join(candidates)}\n"
            f"  File has:   {', '.join(map(str, df.columns))}"
        )
    return None


def load_superfone(path):
    df = pd.read_excel(path) if path.lower().endswith((".xlsx", ".xls")) \
        else pd.read_csv(path)

    col_phone = pick_column(df, "Customer Phone", "Phone", "Customer Number",
                            label="customer phone")
    col_start = pick_column(df, "Start Time", "Call Time", "Date",
                            label="call start time")
    col_rec = pick_column(df, "Recording", "Recording Link", required=False)
    col_staff = pick_column(df, "Staff", "Agent", "User", required=False)
    col_cust = pick_column(df, "Customer", "Name", required=False)
    col_status = pick_column(df, "Call Status", "Status", required=False)
    col_dur = pick_column(df, "Duration", "Talk Time", required=False)

    out = pd.DataFrame({
        "phone_raw": df[col_phone],
        "phone": df[col_phone].apply(normalize_phone),
        "customer": df[col_cust] if col_cust else "",
        "staff": df[col_staff].fillna("(unassigned)") if col_staff else "(unknown)",
        "status": df[col_status] if col_status else "",
        "duration": df[col_dur] if col_dur else "",
    })

    # Superfone exports dd/mm/yy hh:mm AM/PM; fall back to pandas inference.
    start = pd.to_datetime(df[col_start], format="%d/%m/%y %I:%M %p",
                           errors="coerce")
    if start.isna().mean() > 0.2:
        start = pd.to_datetime(df[col_start], errors="coerce", dayfirst=True)
    out["start"] = start
    out = out.dropna(subset=["start"])

    # A recording exists when the export carries a link (rendered as "Link").
    if col_rec is not None:
        has_rec = df.loc[out.index, col_rec].astype(str).str.strip()
        out["has_recording"] = has_rec.str.lower().isin(["link", "yes", "true"]) \
            | has_rec.str.startswith("http")
    else:
        out["has_recording"] = out["status"].astype(str).str.lower().eq("answered")

    return out.reset_index(drop=True)


def load_recordings(path):
    df = pd.read_csv(path)
    col_phone = pick_column(df, "phone_number", "phone", label="phone_number")
    col_created = pick_column(df, "created_at", label="created_at")
    col_file = pick_column(df, "original_filename", "filename", required=False)

    out = pd.DataFrame({
        "id": df[pick_column(df, "id", required=False)] if "id" in
        {c.lower() for c in df.columns} else range(len(df)),
        "phone": df[col_phone].apply(normalize_phone),
        "created_at": pd.to_datetime(df[col_created], errors="coerce", utc=True),
        "filename": df[col_file] if col_file else "",
        "status": df[pick_column(df, "processing_status", required=False)]
        if "processing_status" in {c.lower() for c in df.columns} else "",
        "lead_id": df[pick_column(df, "lead_id", required=False)]
        if "lead_id" in {c.lower() for c in df.columns} else None,
    })

    # The 13-digit epoch in the filename is the ACTUAL call time — far more
    # reliable for matching than created_at, which carries forwarding delay.
    epoch = out["filename"].astype(str).str.extract(r"_(\d{13})\.wav", expand=False)
    out["call_utc"] = pd.to_datetime(pd.to_numeric(epoch, errors="coerce"),
                                     unit="ms", errors="coerce")
    return out


def load_leads(path):
    df = pd.read_csv(path, low_memory=False)
    col = pick_column(df, "contact", "phone", "phone_number", label="lead phone")
    return set(df[col].apply(normalize_phone).dropna())


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------

def detect_offset(recordings, sf_recorded):
    """
    Grid-search the constant offset between filename-epoch (UTC) and the
    Superfone export clock. Returns (offset_hours, rows_matched, total).
    """
    usable = recordings.dropna(subset=["call_utc", "phone"])
    if usable.empty:
        return None, 0, 0

    by_phone = {}
    for phone, grp in sf_recorded.dropna(subset=["phone"]).groupby("phone"):
        by_phone[phone] = grp["start"].tolist()

    best = (None, -1)
    steps = int((OFFSET_SEARCH_HOURS[1] - OFFSET_SEARCH_HOURS[0]) / OFFSET_STEP_HOURS)
    for i in range(steps + 1):
        off = OFFSET_SEARCH_HOURS[0] + i * OFFSET_STEP_HOURS
        delta = timedelta(hours=off)
        hits = 0
        for _, row in usable.iterrows():
            shifted = row["call_utc"] + delta
            for start in by_phone.get(row["phone"], ()):
                if abs(shifted - start) <= MATCH_TOLERANCE:
                    hits += 1
                    break
        if hits > best[1]:
            best = (off, hits)
    return best[0], best[1], len(usable)


def match(sf_recorded, recordings, offset_hours, phone_only=False):
    """
    Flag each recorded Superfone call as ingested or not.

    Normal mode matches on phone + call time, so repeat calls from the same
    customer are resolved individually. `phone_only` is the degraded fallback
    used when no filename epochs are readable: it can only tell whether the
    customer appears at all, so it UNDERSTATES loss — never ship those numbers
    without saying so.
    """
    sf_recorded = sf_recorded.copy()

    if phone_only:
        seen = set(recordings["phone"].dropna())
        sf_recorded["ingested"] = sf_recorded["phone"].isin(seen)
        return sf_recorded

    rec = recordings.dropna(subset=["call_utc", "phone"]).copy()
    rec["call_local"] = rec["call_utc"] + timedelta(hours=offset_hours or 0)

    index = {}
    for _, row in rec.iterrows():
        index.setdefault(row["phone"], []).append(row["call_local"])

    ingested = []
    for _, row in sf_recorded.iterrows():
        found = False
        for call_local in index.get(row["phone"], ()):
            if abs(call_local - row["start"]) <= MATCH_TOLERANCE:
                found = True
                break
        ingested.append(found)
    sf_recorded["ingested"] = ingested
    return sf_recorded


def duration_seconds(value):
    try:
        parts = [int(p) for p in str(value).split(":")]
    except (ValueError, AttributeError):
        return 0
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return 0


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def render_html(s, days, staff, no_lead_top, longest_lost, missing_rows):
    day_json = json.dumps(days)
    missing_json = json.dumps(missing_rows)
    staff_json = json.dumps(sorted({r["staff"] for r in staff}))
    peak = max([d["t"] for d in days], default=1)

    degraded_banner = ""
    if s.get("degraded"):
        degraded_banner = (
            '<div class="warnbar"><strong>Approximate figures.</strong> The recording '
            'filenames carried no call timestamps, so calls were matched by phone number '
            'only — repeat calls from the same customer cannot be told apart and real '
            'loss is <em>higher</em> than shown.</div>')

    staff_rows = "".join(
        f'<div class="srow"><div class="sname">{esc(r["staff"])}</div>'
        f'<div class="strack"><div class="sfill" style="width:{r["pct"]}%"></div></div>'
        f'<div class="sfig">{r["ingested"]} / {r["recorded"]} &middot; {r["pct"]}%</div></div>'
        for r in staff)

    no_lead_rows = "".join(
        f'<tr><td>{esc(r["customer"])}</td><td class="n">{r["calls"]}</td></tr>'
        for r in no_lead_top) or '<tr><td colspan="2">None — every caller has a lead.</td></tr>'

    lost_rows = "".join(
        f'<tr><td>{esc(r["customer"])} &middot; {esc(r["when"])}</td>'
        f'<td class="n">{esc(r["duration"])}</td></tr>'
        for r in longest_lost) or '<tr><td colspan="2">Nothing lost.</td></tr>'

    lead_block = ""
    if s.get("customers_without_lead") is not None:
        lead_block = f"""
  <div class="card">
    <div class="big" style="color:var(--lost)">{s['customers_without_lead']}</div>
    <h3>Customers who exist nowhere in the app</h3>
    <p>They called, spoke to the team, and were never created as leads —
       no follow-up, no scoring, no reminder. {s['calls_without_lead']} calls in total.</p>
    <table><tr><th>Caller</th><th style="text-align:right">Calls</th></tr>{no_lead_rows}</table>
  </div>"""

    return f"""<title>Call Pipeline Reconciliation — {esc(s['window'])}</title>
<style>
  :root{{
    --surface:#FCFCFB;--raised:#FFF;--ink:#14171A;--ink-2:#41474D;--muted:#6E7379;
    --rule:#E4E5E1;--rule-strong:#CFD1CC;--captured:{CAPTURED};--lost:{LOST};
    --captured-wash:{CAPTURED}1A;--lost-wash:{LOST}14;
    --shadow:0 1px 2px rgba(20,23,26,.05),0 8px 24px -12px rgba(20,23,26,.14);
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
    --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  }}
  @media(prefers-color-scheme:dark){{:root{{
    --surface:#1A1A19;--raised:#212220;--ink:#ECEDEA;--ink-2:#B9BCB7;--muted:#8A8E88;
    --rule:#32332F;--rule-strong:#43443F;--captured:{CAPTURED_DARK};--lost:{LOST_DARK};
    --captured-wash:{CAPTURED_DARK}1F;--lost-wash:{LOST_DARK}18;
    --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px -12px rgba(0,0,0,.6);}}}}
  :root[data-theme="light"]{{
    --surface:#FCFCFB;--raised:#FFF;--ink:#14171A;--ink-2:#41474D;--muted:#6E7379;
    --rule:#E4E5E1;--rule-strong:#CFD1CC;--captured:{CAPTURED};--lost:{LOST};
    --captured-wash:{CAPTURED}1A;--lost-wash:{LOST}14;}}
  :root[data-theme="dark"]{{
    --surface:#1A1A19;--raised:#212220;--ink:#ECEDEA;--ink-2:#B9BCB7;--muted:#8A8E88;
    --rule:#32332F;--rule-strong:#43443F;--captured:{CAPTURED_DARK};--lost:{LOST_DARK};
    --captured-wash:{CAPTURED_DARK}1F;--lost-wash:{LOST_DARK}18;}}
  *{{box-sizing:border-box}}
  body{{background:var(--surface);color:var(--ink);font-family:var(--sans);margin:0;
       line-height:1.55;-webkit-font-smoothing:antialiased}}
  .wrap{{max-width:960px;margin:0 auto;padding:40px 24px 96px}}
  @media(max-width:640px){{.wrap{{padding:28px 16px 72px}}}}
  .eyebrow{{font-family:var(--mono);font-size:11px;letter-spacing:.13em;text-transform:uppercase;
           color:var(--muted);margin:0}}
  h1{{font-size:clamp(27px,4.5vw,38px);line-height:1.13;letter-spacing:-.025em;font-weight:800;
     margin:10px 0 0;text-wrap:balance}}
  h2{{font-size:19px;letter-spacing:-.012em;font-weight:700;margin:0}}
  h3{{font-size:15px;font-weight:650;margin:0}}
  p{{margin:0;color:var(--ink-2)}}
  .lede{{font-size:16px;max-width:66ch;margin-top:14px}}
  .num{{font-variant-numeric:tabular-nums;font-family:var(--mono)}}
  header{{border-bottom:1px solid var(--rule);padding-bottom:26px}}
  .prov{{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:18px;font-family:var(--mono);
        font-size:11.5px;color:var(--muted)}}
  .prov b{{color:var(--ink-2);font-weight:500}}
  section{{margin-top:52px;display:flex;flex-direction:column;gap:18px}}
  .shead{{display:flex;flex-direction:column;gap:5px}}
  .verdict{{display:grid;grid-template-columns:minmax(0,auto) 1fr;gap:32px;align-items:center;
           background:var(--raised);border:1px solid var(--rule);border-left:3px solid var(--lost);
           border-radius:3px;padding:26px 28px;box-shadow:var(--shadow);margin-top:34px}}
  @media(max-width:640px){{.verdict{{grid-template-columns:1fr;gap:18px;padding:22px 20px}}}}
  .bignum{{font-family:var(--mono);font-size:clamp(54px,10vw,74px);line-height:.86;font-weight:700;
          letter-spacing:-.04em;color:var(--lost);font-variant-numeric:tabular-nums}}
  .bignum sup{{font-size:.36em;font-weight:600;vertical-align:top;top:.5em;position:relative}}
  .bigcap{{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
          color:var(--muted);margin-top:12px}}
  .funnel{{display:flex;flex-direction:column;gap:2px}}
  .frow{{display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:center;padding:7px 0}}
  @media(max-width:640px){{.frow{{grid-template-columns:100px 1fr;gap:11px}}}}
  .flabel{{font-size:13px;color:var(--ink-2);text-align:right;line-height:1.3}}
  .ftrack{{position:relative;height:34px;display:flex;align-items:center}}
  .fbar{{height:26px;border-radius:0 4px 4px 0;display:flex;align-items:center;padding-left:11px;
        font-family:var(--mono);font-size:13px;font-weight:600;color:#fff;min-width:52px;
        font-variant-numeric:tabular-nums}}
  .fnote{{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-left:11px;
         white-space:nowrap}}
  .chart{{background:var(--raised);border:1px solid var(--rule);border-radius:3px;
         padding:22px 20px 16px;box-shadow:var(--shadow);overflow-x:auto}}
  .legend{{display:flex;gap:18px;align-items:center;margin-bottom:18px;font-size:12.5px;
          color:var(--ink-2)}}
  .legend i{{width:11px;height:11px;border-radius:2px;display:inline-block;margin-right:7px;
            vertical-align:-1px}}
  .plot{{display:flex;align-items:flex-end;gap:3px;height:190px;min-width:620px;
        border-bottom:1px solid var(--rule-strong)}}
  .col{{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:2px;
       position:relative}}
  .seg{{width:100%;transition:filter .12s}}
  .seg.miss{{background:var(--lost);border-radius:4px 4px 0 0}}
  .seg.cap{{background:var(--captured)}}
  .col:hover .seg{{filter:brightness(1.12)}}
  .col:focus-visible{{outline:2px solid var(--ink);outline-offset:2px}}
  .xaxis{{display:flex;gap:3px;min-width:620px;margin-top:7px}}
  .xlab{{flex:1;text-align:center;font-family:var(--mono);font-size:9.5px;color:var(--muted)}}
  .tip{{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface);
       font-family:var(--mono);font-size:11.5px;padding:7px 10px;border-radius:3px;opacity:0;
       transition:opacity .1s;z-index:50;white-space:nowrap;line-height:1.5}}
  .staff{{display:flex;flex-direction:column;gap:3px}}
  .srow{{display:grid;grid-template-columns:150px 1fr 92px;gap:14px;align-items:center;
        padding:9px 0;border-bottom:1px solid var(--rule)}}
  @media(max-width:640px){{.srow{{grid-template-columns:92px 1fr 74px;gap:10px}}}}
  .srow:last-child{{border-bottom:none}}
  .sname{{font-size:13.5px;font-weight:600}}
  .strack{{height:22px;background:var(--lost-wash);border-radius:3px;overflow:hidden;display:flex}}
  .sfill{{background:var(--captured);border-radius:3px 0 0 3px;min-width:2px}}
  .sfig{{font-family:var(--mono);font-size:12.5px;text-align:right;color:var(--ink-2);
        font-variant-numeric:tabular-nums}}
  .impact{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
  @media(max-width:720px){{.impact{{grid-template-columns:1fr}}}}
  .card{{background:var(--raised);border:1px solid var(--rule);border-radius:3px;padding:20px;
        display:flex;flex-direction:column;gap:12px}}
  .card p{{font-size:13px}}
  .card .big{{font-family:var(--mono);font-size:34px;font-weight:700;letter-spacing:-.03em;
             line-height:1;font-variant-numeric:tabular-nums}}
  table{{width:100%;border-collapse:collapse;font-size:12.5px}}
  th{{text-align:left;font-family:var(--mono);font-size:10px;letter-spacing:.1em;
     text-transform:uppercase;color:var(--muted);font-weight:500;padding:0 0 7px;
     border-bottom:1px solid var(--rule)}}
  td{{padding:7px 0;border-bottom:1px solid var(--rule);color:var(--ink-2)}}
  tr:last-child td{{border-bottom:none}}
  td.n{{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}}
  .warnbar{{background:var(--lost-wash);border:1px solid var(--lost);border-radius:3px;
           padding:13px 16px;margin-top:22px;font-size:13.5px;color:var(--ink-2)}}
  .warnbar strong{{color:var(--lost)}}
  /* explorer */
  .tools{{display:flex;flex-wrap:wrap;gap:9px;align-items:center}}
  .search{{flex:1;min-width:190px;font-family:var(--sans);font-size:13.5px;padding:9px 12px;
          border:1px solid var(--rule-strong);border-radius:3px;background:var(--raised);
          color:var(--ink)}}
  .search:focus{{outline:2px solid var(--captured);outline-offset:-1px;border-color:transparent}}
  .chip{{font-family:var(--mono);font-size:11px;letter-spacing:.04em;padding:8px 12px;
        border:1px solid var(--rule-strong);border-radius:3px;background:var(--raised);
        color:var(--ink-2);cursor:pointer;transition:background .12s,color .12s}}
  .chip:hover{{border-color:var(--muted)}}
  .chip[aria-pressed="true"]{{background:var(--ink);color:var(--surface);border-color:var(--ink)}}
  .chip:focus-visible{{outline:2px solid var(--captured);outline-offset:2px}}
  .tblwrap{{background:var(--raised);border:1px solid var(--rule);border-radius:3px;
           max-height:440px;overflow:auto}}
  .tblwrap table{{font-size:12.5px}}
  .tblwrap th{{position:sticky;top:0;background:var(--raised);padding:11px 14px 9px;z-index:1;
              cursor:pointer;user-select:none;white-space:nowrap}}
  .tblwrap th:hover{{color:var(--ink)}}
  .tblwrap th[aria-sort]{{color:var(--ink)}}
  .tblwrap td{{padding:9px 14px}}
  .tblwrap tr:hover td{{background:var(--captured-wash)}}
  .count{{font-family:var(--mono);font-size:11.5px;color:var(--muted)}}
  .nolead{{font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;
          background:var(--lost-wash);color:var(--lost);padding:2px 5px;border-radius:2px}}
  footer{{margin-top:64px;padding-top:22px;border-top:1px solid var(--rule);font-family:var(--mono);
         font-size:11px;color:var(--muted);line-height:1.7}}
  @media(prefers-reduced-motion:reduce){{*{{transition:none!important}}}}
</style>
<div class="wrap">
<header>
  <p class="eyebrow">Maiyuri Bricks &middot; Call Pipeline Reconciliation</p>
  <h1>{s['loss_pct']}% of recorded customer calls never reached the app</h1>
  <p class="lede">Call-by-call comparison of the Superfone log against
     <span class="num">call_recordings</span> for {esc(s['window'])}. Matched on customer number and
     call time, so a recording forwarded late still counts as captured.</p>
  <div class="prov">
    <span>Superfone <b>{s['total_calls']} calls &middot; {s['recorded']} recorded</b></span>
    <span>App <b>{s['app_rows']} rows</b></span>
    <span>Clock offset <b>+{s['offset_hours']}h (auto-detected)</b></span>
    <span>Resolved <b>{s['offset_matched']} of {s['offset_total']} app rows</b></span>
  </div>
  {degraded_banner}
</header>

<div class="verdict">
  <div><div class="bignum">{s['loss_pct']}<sup>%</sup></div>
       <div class="bigcap">Recordings lost</div></div>
  <div style="display:flex;flex-direction:column;gap:10px">
    <h2>{s['recorded'] - s['ingested']} of {s['recorded']} recordings are missing</h2>
    <p style="font-size:14.5px">{esc(s['verdict'])}</p>
  </div>
</div>

<section>
  <div class="shead"><h2>Where the calls fall out</h2></div>
  <div class="funnel">
    <div class="frow"><div class="flabel">Calls handled</div>
      <div class="ftrack"><div class="fbar" style="background:var(--captured);width:100%">{s['total_calls']}</div></div></div>
    <div class="frow"><div class="flabel">Answered &amp; recorded</div>
      <div class="ftrack"><div class="fbar" style="background:var(--captured);width:{s['recorded']/max(s['total_calls'],1)*100:.1f}%">{s['recorded']}</div>
      <div class="fnote">{s['total_calls'] - s['recorded']} missed, cancelled or unanswered</div></div></div>
    <div class="frow"><div class="flabel">Reached the app</div>
      <div class="ftrack"><div class="fbar" style="background:var(--lost);width:{s['ingested']/max(s['total_calls'],1)*100:.1f}%">{s['ingested']}</div>
      <div class="fnote">{s['recorded'] - s['ingested']} recordings lost in transit</div></div></div>
    <div class="frow"><div class="flabel">Fully processed</div>
      <div class="ftrack"><div class="fbar" style="background:var(--lost);width:{s['completed']/max(s['total_calls'],1)*100:.1f}%">{s['completed']}</div>
      <div class="fnote">{s['failed']} failed, {s['pending']} pending</div></div></div>
  </div>
</section>

<section>
  <div class="shead"><h2>Every day in the window</h2>
    <p style="font-size:14px">Recorded calls per day, split by whether the recording reached the app.
       Hover a column for detail.</p></div>
  <div class="chart">
    <div class="legend"><span><i style="background:var(--captured)"></i>Reached the app</span>
      <span><i style="background:var(--lost)"></i>Lost</span></div>
    <div class="plot" id="plot"></div><div class="xaxis" id="xaxis"></div>
  </div>
</section>

<section>
  <div class="shead"><h2>Capture rate by staff member</h2>
    <p style="font-size:14px">Same phone system, same group, same period. Wide variance points at
       setup or training, not intent — check auto-forward settings first.</p></div>
  <div class="staff">{staff_rows}</div>
</section>

<section>
  <div class="shead"><h2>What the business lost</h2></div>
  <div class="impact">{lead_block}
    <div class="card">
      <div class="big" style="color:var(--lost)">{s['hours_lost']}<span style="font-size:.5em;font-weight:600"> hrs</span></div>
      <h3>Customer conversation never analysed</h3>
      <p>Of {s['hours_total']} hours recorded, {s['talk_loss_pct']}% never reached transcription —
         no summary, no objection tracking, no coaching signal, no follow-up task.</p>
      <table><tr><th>Longest lost calls</th><th style="text-align:right">Duration</th></tr>{lost_rows}</table>
    </div>
  </div>
</section>

<section>
  <div class="shead"><h2>Pipeline health once ingested</h2></div>
  <div class="impact">
    <div class="card"><div class="big" style="color:var(--captured)">{s['linked_pct']}%</div>
      <h3>Recordings linked to a lead</h3>
      <p>{s['app_rows'] - s['orphans']} of {s['app_rows']} arrived rows were attached to a lead.
         {'Zero orphans — when a recording arrives, attribution works.' if s['orphans'] == 0
          else str(s['orphans']) + ' orphan rows need investigation.'}</p></div>
    <div class="card"><div class="big" style="color:var(--captured)">{s['processed_pct']}%</div>
      <h3>Processing succeeds</h3>
      <p>{s['completed']} of {s['app_rows']} completed transcription and analysis.
         {s['failed']} failed, {s['pending']} still pending.</p></div>
  </div>
</section>

<section>
  <div class="shead"><h2>Every missing call</h2>
    <p style="font-size:14px">All {s['recorded'] - s['ingested']} recordings that never reached the app.
       Search by customer or number, filter by staff, sort any column.</p></div>
  <div class="tools">
    <input class="search" id="q" type="search" placeholder="Search customer or phone number…"
           aria-label="Search missing calls">
    <span id="chips" style="display:flex;gap:8px;flex-wrap:wrap"></span>
  </div>
  <div class="count" id="count"></div>
  <div class="tblwrap">
    <table id="tbl">
      <thead><tr>
        <th data-k="when" scope="col">Date</th>
        <th data-k="customer" scope="col">Customer</th>
        <th data-k="phone" scope="col">Number</th>
        <th data-k="staff" scope="col">Staff</th>
        <th data-k="secs" scope="col" style="text-align:right">Duration</th>
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
</section>

<footer>
  Method — Superfone rows carrying a recording matched to <span class="num">call_recordings</span> on
  last-10-digit customer number and call time within 3 minutes. Call time recovered from the epoch
  embedded in each recording filename; the {s['offset_hours']}-hour offset against the Superfone export
  clock was auto-detected and verified on {s['offset_matched']} of {s['offset_total']} app rows before matching.<br>
  Generated by the superfone-reconciliation skill.
</footer>
</div>
<div class="tip" id="tip" role="status" aria-live="polite"></div>
<script>
const DAYS={day_json}, PEAK={peak};
const plot=document.getElementById('plot'),xaxis=document.getElementById('xaxis'),
      tip=document.getElementById('tip');
DAYS.forEach(function(x){{
  const miss=x.t-x.c, col=document.createElement('div');
  col.className='col'; col.tabIndex=0;
  col.setAttribute('aria-label',x.label+': '+x.t+' recorded, '+x.c+' reached the app, '+miss+' lost');
  if(miss>0){{const e=document.createElement('div');e.className='seg miss';
    e.style.height=(miss/PEAK*100)+'%';col.appendChild(e);}}
  if(x.c>0){{const e=document.createElement('div');e.className='seg cap';
    e.style.height=(x.c/PEAK*100)+'%';if(miss===0)e.style.borderRadius='4px 4px 0 0';
    col.appendChild(e);}}
  const show=function(){{
    const r=col.getBoundingClientRect(), pct=Math.round(x.c/x.t*100);
    tip.innerHTML=x.label+' &middot; '+x.t+' recorded<br>'+x.c+' in app &middot; '+miss+' lost &middot; '+pct+'% captured';
    tip.style.opacity='1';
    const w=tip.offsetWidth;
    tip.style.left=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2))+'px';
    tip.style.top=(r.top-tip.offsetHeight-9)+'px';}};
  const hide=function(){{tip.style.opacity='0';}};
  col.addEventListener('mouseenter',show); col.addEventListener('focus',show);
  col.addEventListener('mouseleave',hide); col.addEventListener('blur',hide);
  plot.appendChild(col);
  const l=document.createElement('div');l.className='xlab';l.textContent=x.tick;
  xaxis.appendChild(l);
}});

/* ---- missing-call explorer ---- */
const ROWS={missing_json}, STAFF={staff_json};
const q=document.getElementById('q'), tbody=document.getElementById('tbody'),
      chips=document.getElementById('chips'), count=document.getElementById('count');
let active=new Set(), sortKey='when', sortDir=1;

STAFF.forEach(function(name){{
  const b=document.createElement('button');
  b.className='chip'; b.type='button'; b.textContent=name;
  b.setAttribute('aria-pressed','false');
  b.addEventListener('click',function(){{
    if(active.has(name)){{active.delete(name); b.setAttribute('aria-pressed','false');}}
    else {{active.add(name); b.setAttribute('aria-pressed','true');}}
    draw();
  }});
  chips.appendChild(b);
}});

function fmt(sec){{
  const m=Math.floor(sec/60), s=sec%60;
  return m+':'+String(s).padStart(2,'0');
}}

function draw(){{
  const term=q.value.trim().toLowerCase();
  let rows=ROWS.filter(function(r){{
    if(active.size && !active.has(r.staff)) return false;
    if(!term) return true;
    return (r.customer||'').toLowerCase().indexOf(term)>-1 ||
           String(r.phone||'').indexOf(term)>-1;
  }});
  rows.sort(function(a,b){{
    const x=a[sortKey], y=b[sortKey];
    if(typeof x==='number') return (x-y)*sortDir;
    return String(x).localeCompare(String(y))*sortDir;
  }});
  tbody.innerHTML=rows.map(function(r){{
    return '<tr><td>'+r.when+'</td><td>'+(r.customer||'&mdash;')+
      (r.no_lead?' <span class="nolead">no lead</span>':'')+
      '</td><td class="num">'+r.phone+'</td><td>'+r.staff+
      '</td><td class="n">'+fmt(r.secs)+'</td></tr>';
  }}).join('') || '<tr><td colspan="5" style="padding:22px;text-align:center">No calls match.</td></tr>';
  const mins=Math.round(rows.reduce(function(t,r){{return t+r.secs;}},0)/60);
  count.textContent=rows.length+' of '+ROWS.length+' missing calls · '+mins+' minutes of conversation';
}}

q.addEventListener('input',draw);
document.querySelectorAll('#tbl th').forEach(function(th){{
  th.addEventListener('click',function(){{
    const k=th.dataset.k;
    sortDir = (k===sortKey) ? -sortDir : 1;
    sortKey=k;
    document.querySelectorAll('#tbl th').forEach(function(o){{o.removeAttribute('aria-sort');}});
    th.setAttribute('aria-sort', sortDir===1?'ascending':'descending');
    draw();
  }});
}});
draw();
</script>
"""


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--superfone", required=True, help="Superfone export (.xlsx/.csv)")
    ap.add_argument("--recordings", required=True, help="call_recordings export (.csv)")
    ap.add_argument("--leads", help="leads export (.csv) — optional")
    ap.add_argument("--out", default="./reconciliation-output")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    sf = load_superfone(args.superfone)
    rec = load_recordings(args.recordings)
    lead_phones = load_leads(args.leads) if args.leads else None

    sf_rec = sf[sf["has_recording"]].copy()
    if sf_rec.empty:
        sys.exit("No recorded calls found in the Superfone export — check the Recording column.")

    offset, off_hits, off_total = detect_offset(rec, sf_rec)
    degraded = offset is None or off_hits == 0
    if degraded:
        print("!! Could not align the two clocks — no filename epochs matched any call.\n"
              "   Falling back to phone-only matching: repeat calls cannot be resolved,\n"
              "   so LOSS IS UNDERSTATED. Do not report these numbers as exact.\n"
              "   See references/METHOD.md § when offset detection fails.", file=sys.stderr)
        offset = 0.0

    sf_rec = match(sf_rec, rec, offset, phone_only=degraded)

    # ---- aggregate ----
    sf_rec["date"] = sf_rec["start"].dt.date
    sf_rec["secs"] = sf_rec["duration"].apply(duration_seconds)
    missing = sf_rec[~sf_rec["ingested"]]

    recorded, ingested = len(sf_rec), int(sf_rec["ingested"].sum())
    status = rec["status"].astype(str)
    completed = int((status == "completed").sum())
    failed = int((status == "failed").sum())
    pending = int(status.isin(["pending", "downloading", "transcribing"]).sum())
    orphans = int(rec["lead_id"].isna().sum()) if rec["lead_id"] is not None else 0

    days = [{
        "label": d.strftime("%-d %b") if hasattr(d, "strftime") else str(d),
        "tick": d.day if hasattr(d, "day") else "",
        "t": int(g.shape[0]), "c": int(g["ingested"].sum()),
    } for d, g in sf_rec.groupby("date")]

    staff = []
    for name, g in sf_rec.groupby("staff"):
        n, i = len(g), int(g["ingested"].sum())
        staff.append({"staff": name, "recorded": n, "ingested": i,
                      "pct": round(i / n * 100)})
    staff.sort(key=lambda r: (-r["pct"], -r["recorded"]))

    weeks = sf_rec.groupby(sf_rec["start"].dt.to_period("W"))
    week_rows = [(str(p)[:10], len(g), int(g["ingested"].sum())) for p, g in weeks]

    total_secs = int(sf_rec["secs"].sum())
    lost_secs = int(missing["secs"].sum())

    summary = {
        "window": f"{sf['start'].min():%d %b} – {sf['start'].max():%d %b %Y}",
        "total_calls": len(sf), "recorded": recorded, "ingested": ingested,
        "loss_pct": round((1 - ingested / recorded) * 100) if recorded else 0,
        "app_rows": len(rec), "completed": completed, "failed": failed,
        "pending": pending, "orphans": orphans,
        "linked_pct": round((len(rec) - orphans) / len(rec) * 100) if len(rec) else 0,
        "processed_pct": round(completed / len(rec) * 100) if len(rec) else 0,
        "offset_hours": offset, "offset_matched": off_hits, "offset_total": off_total,
        "hours_total": round(total_secs / 3600, 1),
        "hours_lost": round(lost_secs / 3600, 1),
        "talk_loss_pct": round(lost_secs / total_secs * 100) if total_secs else 0,
        "by_week": [{"week": w, "recorded": n, "ingested": i} for w, n, i in week_rows],
        "by_staff": staff,
    }

    # verdict sentence — the phase comparison is what stops people blaming the
    # last incident for a problem that predates it
    if len(week_rows) >= 2:
        worst = min(week_rows, key=lambda r: r[2] / max(r[1], 1))
        best = max(week_rows, key=lambda r: r[2] / max(r[1], 1))
        summary["verdict"] = (
            f"Capture ranged from {round(worst[2]/max(worst[1],1)*100)}% (week of {worst[0]}) "
            f"to {round(best[2]/max(best[1],1)*100)}% (week of {best[0]}). "
            "A rate that is low across every week is a forwarding problem, not an outage — "
            "compare the per-staff table below before blaming the pipeline.")
    else:
        summary["verdict"] = "Single-week window — extend the range to separate incidents from habit."

    if lead_phones is not None:
        no_lead = missing[~missing["phone"].isin(lead_phones)]
        summary["customers_without_lead"] = int(no_lead["phone"].nunique())
        summary["calls_without_lead"] = int(len(no_lead))
        grouped = (no_lead.groupby(["phone", "customer"]).agg(
            calls=("phone", "size"), first=("start", "min"), last=("start", "max"))
            .reset_index().sort_values("calls", ascending=False))
        grouped.to_csv(os.path.join(args.out, "customers_without_lead.csv"), index=False)
        no_lead_top = [{"customer": r["customer"] or r["phone"], "calls": int(r["calls"])}
                       for _, r in grouped.head(5).iterrows()]
    else:
        summary["customers_without_lead"] = None
        summary["calls_without_lead"] = None
        no_lead_top = []

    missing[["start", "customer", "phone_raw", "staff", "duration", "status"]].to_csv(
        os.path.join(args.out, "calls_never_ingested.csv"), index=False)

    longest = missing.nlargest(5, "secs")
    longest_lost = [{"customer": r["customer"] or r["phone"],
                     "when": r["start"].strftime("%-d %b"),
                     "duration": r["duration"]} for _, r in longest.iterrows()]

    # every missing call, embedded in the report so it can be explored offline
    missing_rows = [{
        "when": r["start"].strftime("%d %b %H:%M"),
        "customer": str(r["customer"] or ""),
        "phone": str(r["phone_raw"]),
        "staff": str(r["staff"]),
        "secs": int(r["secs"]),
        "no_lead": bool(lead_phones is not None and r["phone"] not in lead_phones),
    } for _, r in missing.sort_values("start").iterrows()]

    summary["degraded"] = degraded

    with open(os.path.join(args.out, "summary.json"), "w") as fh:
        json.dump(summary, fh, indent=2, default=str)

    html = render_html(summary, days, staff, no_lead_top, longest_lost, missing_rows)
    report = os.path.join(args.out, "report.html")
    with open(report, "w") as fh:
        fh.write(html)

    # ---- console ----
    W = 66
    print("=" * W)
    print(f"SUPERFONE RECONCILIATION — {summary['window']}")
    print("=" * W)
    print(f"Clock offset detected     : +{offset}h  ({off_hits}/{off_total} app rows aligned)")
    if off_total and off_hits / off_total < 0.7:
        print("  !! LOW alignment — verify before trusting per-call numbers")
    print(f"Calls handled             : {len(sf)}")
    print(f"Recorded by Superfone     : {recorded}")
    print(f"Reached the app           : {ingested}  ({round(ingested/recorded*100)}%)")
    print(f"MISSING                   : {recorded-ingested}  ({summary['loss_pct']}%)")
    print(f"Talk time lost            : {summary['hours_lost']} of {summary['hours_total']} hrs")
    if lead_phones is not None:
        print(f"Callers with no lead      : {summary['customers_without_lead']}")
    print(f"\nProcessing: {completed} completed, {failed} failed, {pending} pending, "
          f"{orphans} orphans")
    print("\nBY WEEK  (recorded / ingested / capture)")
    for w, n, i in week_rows:
        print(f"  {w}   {n:>4} / {i:>4}   {round(i/max(n,1)*100):>3}%")
    print("\nBY STAFF (recorded / ingested / capture)")
    for r in staff:
        print(f"  {r['staff'][:26]:<26} {r['recorded']:>4} / {r['ingested']:>4}   {r['pct']:>3}%")
    print(f"\nWritten to {args.out}/")
    print("  report.html · calls_never_ingested.csv · summary.json"
          + (" · customers_without_lead.csv" if lead_phones is not None else ""))
    print("\nNext: publish report.html with the Artifact tool.")


if __name__ == "__main__":
    main()
