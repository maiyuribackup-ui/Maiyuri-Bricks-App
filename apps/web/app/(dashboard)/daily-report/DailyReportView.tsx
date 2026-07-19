"use client";

import Link from "next/link";
import type {
  DailyReport,
  PlanActualSection,
  WebsiteSection,
} from "@/lib/daily-report/aggregate";
import styles from "./daily-report.module.css";

/* ---------- formatting ---------- */
const inr = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
const compact = (n: number) =>
  n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n.toLocaleString("en-IN");

function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(dateISO: string): string {
  return new Date(`${dateISO}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function pctClass(pct: number): "chipGood" | "chipWarn" | "chipBad" {
  if (pct >= 95) return "chipGood";
  if (pct >= 80) return "chipWarn";
  return "chipBad";
}
function fillClass(pct: number): "fillGood" | "fillWarn" | "fillBad" {
  if (pct >= 95) return "fillGood";
  if (pct >= 80) return "fillWarn";
  return "fillBad";
}

/* ---------- small building blocks ---------- */
function Pending({ note, error }: { note?: string; error?: boolean }) {
  return (
    <div className={styles.pending}>
      <span className={`${styles.pendingDot} ${error ? styles.errorDot : ""}`} />
      {note ?? (error ? "Could not load" : "Not connected yet")}
    </div>
  );
}

function Sparkline({ series }: { series: WebsiteSection["timeseries"] }) {
  if (!series.length) return null;
  const w = 260;
  const h = 56;
  const max = Math.max(...series.map((p) => p.users), 1);
  const step = series.length > 1 ? w / (series.length - 1) : w;
  const pts = series.map((p, i) => {
    const x = Math.round(i * step);
    const y = Math.round(h - 6 - (p.users / max) * (h - 12));
    return `${x},${y}`;
  });
  const line = pts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(" ");
  const [lastX, lastY] = pts[pts.length - 1].split(",");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Visitor trend">
      <defs>
        <linearGradient id="drSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a83a24" stopOpacity="0.28" />
          <stop offset="1" stopColor="#a83a24" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#drSpark)" />
      <path d={line} fill="none" stroke="#a83a24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3.2" fill="#a83a24" />
    </svg>
  );
}

/* ---------- main ---------- */
export function DailyReportView({ report }: { report: DailyReport }) {
  const { date, finance, receivables, production, deliveries, website, leads, calls, whatsapp, tasks, recordings } = report;
  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const genTime = new Date(report.generatedAt).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className={styles.desk}>
      {/* Controls (hidden in print) */}
      <div className={styles.toolbar}>
        <div className={styles.dateNav}>
          <Link href={`/daily-report?date=${prev}`}>← Prev</Link>
          <span className={`${styles.today} ${styles.cur}`}>{date}</span>
          <Link href={`/daily-report?date=${next}`}>Next →</Link>
          {date !== today ? <Link href="/daily-report">Today</Link> : null}
        </div>
        <div className={styles.actions}>
          <button className={styles.btn} onClick={() => window.print()}>
            ⤓ Export PDF
          </button>
        </div>
      </div>

      <div className={styles.sheet}>
        {/* Masthead */}
        <header className={styles.masthead}>
          <div className={styles.brand}>
            <div className={styles.mark}>M</div>
            <div>
              <div className={styles.name}>MAIYURI</div>
              <span className={styles.tag}>Bricks · Daily Operations</span>
            </div>
          </div>
          <div className={styles.meta}>
            <div className={styles.kicker}>Daily Operations Briefing</div>
            <div className={styles.date}>{prettyDate(date)}</div>
            <div className={styles.gen}>Generated {genTime} IST</div>
          </div>
        </header>

        {/* Hero KPIs */}
        <section className={styles.hero}>
          <div className={`${styles.kpi} ${styles.kpiAccent}`}>
            <div className={styles.kpiLab}>Invoiced</div>
            <div className={styles.kpiVal}>
              <span className={styles.cur}>₹</span>
              {finance.status === "live" ? inr(finance.invoiced) : "—"}
            </div>
            <div className={styles.kpiSub}>
              {finance.status === "live" ? `${finance.invoiceCount} invoices` : finance.note}
            </div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLab}>Expenses</div>
            <div className={styles.kpiVal}>
              <span className={styles.cur}>₹</span>
              {finance.status === "live" ? inr(finance.expenses) : "—"}
            </div>
            <div className={styles.kpiSub}>
              {finance.status === "live" ? `${finance.expenseCount} entries` : ""}
            </div>
          </div>
          <div className={`${styles.kpi} ${styles.kpiAccent}`}>
            <div className={styles.kpiLab}>Net Movement</div>
            <div className={styles.kpiVal}>
              <span className={styles.cur}>₹</span>
              {finance.status === "live" ? inr(finance.net) : "—"}
            </div>
            <div className={styles.kpiSub}>
              {finance.status === "live" ? (
                <span className={finance.net >= 0 ? styles.up : styles.down}>
                  {finance.net >= 0 ? "positive day" : "negative day"}
                </span>
              ) : (
                ""
              )}
            </div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLab}>Production</div>
            <div className={styles.kpiVal}>
              {production.status === "live" ? inr(production.actualUnits) : "—"}
            </div>
            <div className={styles.kpiSub}>
              {production.status === "live" ? (
                <>
                  of {inr(production.plannedUnits)} planned ·{" "}
                  <span className={`${styles.chip} ${styles[pctClass(production.pct)]}`}>
                    {production.pct}%
                  </span>
                </>
              ) : (
                production.note
              )}
            </div>
          </div>
          <div className={`${styles.kpi} ${styles.kpiAccent}`}>
            <div className={styles.kpiLab}>Overdue Receivables</div>
            <div className={styles.kpiVal}>
              <span className={styles.cur}>₹</span>
              {receivables.status === "live" ? inr(receivables.overdue) : "—"}
            </div>
            <div className={styles.kpiSub}>
              {receivables.status === "live" ? (
                receivables.overdue > 0 ? (
                  <span className={styles.down}>
                    {receivables.overdueCount} invoices past due · ₹{inr(receivables.outstanding)} total out
                  </span>
                ) : (
                  <span className={styles.up}>nothing overdue 🎉</span>
                )
              ) : (
                receivables.note
              )}
            </div>
          </div>
          <div className={styles.kpi}>
            <div className={styles.kpiLab}>Deliveries</div>
            <div className={styles.kpiVal}>
              {deliveries.status === "live" ? deliveries.completed : "—"}
              {deliveries.status === "live" ? (
                <span className={styles.cur}> / {deliveries.planned}</span>
              ) : null}
            </div>
            <div className={styles.kpiSub}>
              {deliveries.status === "live"
                ? [
                    deliveries.rolledOver
                      ? `${deliveries.rolledOver} rolled over`
                      : "all on schedule",
                    deliveries.tripKm || deliveries.dieselCost
                      ? `🚛 ${inr(deliveries.tripKm)} km · ₹${inr(deliveries.dieselCost)} diesel`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : deliveries.note}
            </div>
          </div>
        </section>

        {/* Row 1 */}
        <div className={styles.grid}>
          {/* Finance */}
          <section className={`${styles.mod} ${styles.c6}`}>
            <h3 className={styles.modHead}>
              Finance <span className={styles.src}>Odoo</span>
            </h3>
            {finance.status === "live" ? (
              <>
                <div className={styles.fin}>
                  <div>
                    <div className={styles.amt}>
                      <span className={styles.cur}>₹</span>
                      {inr(finance.invoiced)}
                    </div>
                    <div className={styles.cap}>Revenue invoiced · {finance.invoiceCount} invoices</div>
                  </div>
                  <div>
                    <div className={`${styles.amt} ${styles.amtExp}`}>
                      <span className={styles.cur}>₹</span>
                      {inr(finance.expenses)}
                    </div>
                    <div className={styles.cap}>Expenses booked · {finance.expenseCount} entries</div>
                  </div>
                </div>
                {finance.topInvoices.length || finance.topExpenses.length ? (
                  <div className={styles.ledger}>
                    {finance.topInvoices.map((i) => (
                      <div className={styles.ledRow} key={i.ref}>
                        <span className={styles.who}>
                          {i.ref} · {i.party}
                        </span>
                        <span className={styles.ledNum}>₹{inr(i.amount)}</span>
                      </div>
                    ))}
                    {finance.topExpenses.map((e, idx) => (
                      <div className={styles.ledRow} key={`e${idx}`}>
                        <span className={styles.who}>{e.label}</span>
                        <span className={`${styles.ledNum} ${styles.neg}`}>−₹{inr(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {receivables.status === "live" && receivables.topDebtors.length ? (
                  <div className={styles.ledger}>
                    <div className={styles.ledRow}>
                      <span className={styles.who}>
                        <strong>📞 Collect first (overdue)</strong>
                      </span>
                      <span className={`${styles.ledNum} ${styles.neg}`}>
                        ₹{inr(receivables.overdue)}
                      </span>
                    </div>
                    {receivables.topDebtors.map((d) => (
                      <div className={styles.ledRow} key={d.customer}>
                        <span className={styles.who}>
                          {d.customer} · {d.oldestDays}d late
                        </span>
                        <span className={`${styles.ledNum} ${styles.neg}`}>₹{inr(d.due)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <Pending note={finance.note} error={finance.status === "error"} />
            )}
          </section>

          {/* Production plan vs actual */}
          <section className={`${styles.mod} ${styles.c6}`}>
            <h3 className={styles.modHead}>
              Production · Plan vs Actual <span className={styles.src}>Planner</span>
            </h3>
            {production.status === "live" ? (
              <ProductionBody production={production} />
            ) : (
              <Pending note={production.note} error={production.status === "error"} />
            )}
          </section>
        </div>

        {/* Row 2 */}
        <div className={styles.grid}>
          {/* Deliveries */}
          <section className={`${styles.mod} ${styles.c4}`}>
            <h3 className={styles.modHead}>
              Deliveries <span className={styles.src}>Planner</span>
            </h3>
            {deliveries.status === "live" ? (
              <>
                <div className={styles.summLine}>
                  <span className={styles.big}>{deliveries.completed}</span>
                  <span className={styles.pct}>/ {deliveries.planned} completed</span>
                </div>
                <div className={styles.dots}>
                  {Array.from({ length: deliveries.planned }).map((_, i) => (
                    <span
                      key={i}
                      className={`${styles.dot} ${i < deliveries.completed ? styles.dotDone : styles.dotPending}`}
                    >
                      {i < deliveries.completed ? "✓" : "…"}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <Pending note={deliveries.note} error={deliveries.status === "error"} />
            )}
          </section>

          {/* Calls */}
          <section className={`${styles.mod} ${styles.c4}`}>
            <h3 className={styles.modHead}>
              Calls <span className={styles.src}>Superfone</span>
            </h3>
            <Pending note={calls.note} error={calls.status === "error"} />
          </section>

          {/* WhatsApp */}
          <section className={`${styles.mod} ${styles.c4}`}>
            <h3 className={styles.modHead}>
              WhatsApp <span className={styles.src}>Meta API</span>
            </h3>
            <Pending note={whatsapp.note} error={whatsapp.status === "error"} />
          </section>
        </div>

        {/* Row 3 */}
        <div className={styles.grid}>
          {/* Website */}
          <section className={`${styles.mod} ${styles.c7}`}>
            <h3 className={styles.modHead}>
              Website · maiyuri.com <span className={styles.src}>GA4</span>
            </h3>
            {website.status === "live" ? (
              <div className={styles.webWrap}>
                <div>
                  <div className={styles.metrics} style={{ marginBottom: 8 }}>
                    <div>
                      <div className={styles.metricN}>{inr(website.visitors)}</div>
                      <div className={styles.metricL}>Visitors</div>
                    </div>
                    <div>
                      <div className={styles.metricN}>{inr(website.pageViews)}</div>
                      <div className={styles.metricL}>Pageviews</div>
                    </div>
                  </div>
                  <Sparkline series={website.timeseries} />
                </div>
                <div>
                  {website.keyEvents.slice(0, 5).map((e) => (
                    <div className={styles.ev} key={e.event}>
                      <span className={styles.evCta}>{e.event.replace(/_/g, " ")}</span>
                      <span className={styles.evN}>{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Pending note={website.note} error={website.status === "error"} />
            )}
          </section>

          {/* Tasks — fed by the My Work module */}
          <section className={`${styles.mod} ${styles.c5}`}>
            <h3 className={styles.modHead}>
              Tasks <span className={styles.src}>My Work</span>
            </h3>
            {tasks.status === "live" ? (
              <>
                <div className={styles.summLine}>
                  <span className={styles.big}>{tasks.primary}</span>
                  <span className={styles.pct}>tasks done today</span>
                </div>
                <div className={styles.metrics}>
                  {tasks.metrics.map((m) => (
                    <div key={m.label}>
                      <div className={styles.metricN}>{m.value}</div>
                      <div className={styles.metricL}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Pending note={tasks.note} error={tasks.status === "error"} />
            )}
          </section>
        </div>

        {/* Call-recording pipeline health */}
        <div className={styles.grid}>
          <section className={`${styles.mod} ${styles.c12}`}>
            <h3 className={styles.modHead}>
              Call Recordings <span className={styles.src}>Telegram → Gemini</span>
            </h3>
            {recordings.status === "live" ? (
              <>
                <div className={styles.summLine}>
                  <span className={styles.big}>{recordings.primary}</span>
                  <span className={styles.pct}>calls processed today</span>
                </div>
                <div className={styles.metrics}>
                  {recordings.metrics.map((m) => (
                    <div key={m.label}>
                      <div className={styles.metricN}>{m.value}</div>
                      <div className={styles.metricL}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <Pending note={recordings.note} error={recordings.status === "error"} />
            )}
          </section>
        </div>

        {/* Leads strip */}
        <div className={styles.grid}>
          <section className={`${styles.mod} ${styles.c12}`}>
            <h3 className={styles.modHead}>
              Leads &amp; Enquiries <span className={styles.src}>CRM</span>
            </h3>
            {leads.status !== "error" ? (
              <div className={styles.leadsRow}>
                <div className={styles.leadCard}>
                  <div className={styles.leadN}>{leads.newLeads}</div>
                  <div className={styles.leadL}>New leads</div>
                </div>
                <div className={styles.leadCard}>
                  <div className={`${styles.leadN} ${styles.leadHot}`}>{leads.hot}</div>
                  <div className={styles.leadL}>Hot</div>
                </div>
                <div className={styles.leadCard}>
                  <div className={styles.leadN}>{leads.followupsDue}</div>
                  <div className={styles.leadL}>Follow-ups due</div>
                </div>
              </div>
            ) : (
              <Pending note={leads.note} error />
            )}
          </section>
        </div>

        {/* Footer: data-source legend */}
        <footer className={styles.foot}>
          <div className={styles.sources}>
            {(
              [
                ["Odoo", finance.status],
                ["Planner", production.status],
                ["GA4", website.status],
                ["CRM", leads.status],
                ["Superfone", calls.status],
                ["WhatsApp", whatsapp.status],
                ["My Work", tasks.status],
              ] as const
            ).map(([label, status]) => (
              <span className={styles.s} key={label}>
                <span
                  className={`${styles.sdot} ${
                    status === "live" ? styles.live : status === "error" ? styles.err : styles.pend
                  }`}
                />
                {label}
              </span>
            ))}
          </div>
          <div className={styles.sig}>
            நம் மண். நம் வீடு. நம் அறிவு. · <b>MAIYURI</b>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ProductionBody({ production }: { production: PlanActualSection }) {
  return (
    <>
      <div className={styles.summLine}>
        <span className={styles.big}>{inr(production.actualUnits)}</span>
        <span className={styles.pct}>/ {inr(production.plannedUnits)} units planned</span>
        <span className={`${styles.chip} ${styles[pctClass(production.pct)]} ${styles.mlAuto}`}>
          {production.pct}% met
        </span>
      </div>
      <div className={styles.pva}>
        {production.byProduct.map((p) => {
          const pct = p.planned ? Math.round((p.actual / p.planned) * 100) : 0;
          return (
            <div key={p.name}>
              <div className={styles.barTop}>
                <span className={styles.barName}>{p.name}</span>
                <span className={styles.barFig}>
                  <b>{compact(p.actual)}</b> / {compact(p.planned)}
                </span>
              </div>
              <div className={styles.track}>
                <span
                  className={`${styles.fill} ${styles[fillClass(pct)]}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
