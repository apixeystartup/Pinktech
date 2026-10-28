/* ------------------------------------------------------------------ *
 * The dashboard blocks as drawn in /wire-frame/Screen 1 + 2: the four *
 * stat cards, the "What's happening" chart with the recent activity   *
 * below it, the "Needs your attention" panel and the CSV download that *
 * used to live in its own card. Everything renders the real payload of *
 * /dashboard/stats, /audit/logs and /forms — nothing is placeholder.  *
 * ------------------------------------------------------------------ */

/* ------------------------------- icons ------------------------------ */

function Glyph({ children, className = "", size = 20 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function StatIcon({ name }) {
  const shapes = {
    tenants: (
      <>
        <path d="M4 20V6.5L12 3.5l8 3V20" />
        <path d="M4 20h16" />
        <path d="M8.5 9.5h2M13.5 9.5h2M8.5 13.5h2M13.5 13.5h2" />
        <path d="M10.5 20v-3.2h3V20" />
      </>
    ),
    doctors: (
      <>
        <path d="M6 3.5v5a4 4 0 0 0 8 0v-5" />
        <path d="M4.6 3.5h2.8M12.6 3.5h2.8" />
        <path d="M10 12.5v2.2a4.3 4.3 0 0 0 8.6 0v-1.2" />
        <circle cx="18.6" cy="11.6" r="1.9" />
      </>
    ),
    forms: (
      <>
        <path d="M6.5 3.5h7l4.5 4.5v12h-11.5z" />
        <path d="M13.5 3.7V8.2H18" />
        <path d="M9 12.5h6M9 16h4" />
      </>
    ),
    send: (
      <>
        <path d="M20.5 3.8 3.8 10.4l6.4 2.6 2.6 6.4z" />
        <path d="M20.5 3.8 10.2 13" />
      </>
    ),
    people: (
      <>
        <circle cx="9.5" cy="8.5" r="3.2" />
        <path d="M3.8 19.4c.6-3 2.9-4.7 5.7-4.7s5.1 1.7 5.7 4.7" />
        <path d="M16.4 6.2a3.1 3.1 0 0 1 0 5.6M18 14.9c1.7.6 2.8 2.1 3.2 4.5" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19.5h16" />
        <path d="M6.5 19.5v-6M11 19.5V8M15.5 19.5v-9M20 19.5V5.5" />
      </>
    ),
  };
  return <Glyph size={21}>{shapes[name] || shapes.forms}</Glyph>;
}

function IconDownload() {
  return (
    <Glyph size={17}>
      <path d="M12 4v9.5" />
      <path d="m8 10.2 4 4 4-4" />
      <path d="M4.5 19.5h15" />
    </Glyph>
  );
}

function IconSpark() {
  return (
    <Glyph size={30}>
      <path
        d="M12 3.5c.7 4 2.3 5.6 6.3 6.3-4 .7-5.6 2.3-6.3 6.3-.7-4-2.3-5.6-6.3-6.3 4-.7 5.6-2.3 6.3-6.3Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M18.6 15.4c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8Z" fill="currentColor" stroke="none" />
      <path d="M6.4 16.4c.2 1.2.7 1.7 1.9 1.9-1.2.2-1.7.7-1.9 1.9-.2-1.2-.7-1.7-1.9-1.9 1.2-.2 1.7-.7 1.9-1.9Z" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function IconAttention({ name }) {
  if (name === "person") {
    return (
      <Glyph size={26}>
        <circle cx="10" cy="8.4" r="3.4" />
        <path d="M4.2 19.6c.6-3.2 3-5 5.8-5 1 0 1.9.2 2.7.6" />
        <path d="M17.8 14.2v5.2M15.2 16.8h5.2" />
      </Glyph>
    );
  }
  if (name === "inbox") {
    return (
      <Glyph size={26}>
        <path d="M4 13.6 6.4 5.4h11.2L20 13.6v5.2H4z" />
        <path d="M4 13.6h4.2l1.2 2.4h5.2l1.2-2.4H20" />
      </Glyph>
    );
  }
  return (
    <Glyph size={26}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.8v4.6" />
      <path d="M12 15.6h.01" />
    </Glyph>
  );
}

function IconActivity({ name }) {
  if (name === "person") {
    return (
      <Glyph size={19}>
        <circle cx="10" cy="8.4" r="3.3" />
        <path d="M4.4 19.4c.6-3.1 2.9-4.9 5.6-4.9 1 0 1.9.2 2.7.6" />
        <path d="M17.8 14.4v5M15.3 16.9h5" />
      </Glyph>
    );
  }
  return (
    <Glyph size={19}>
      <path d="M6.5 3.8h7l4.4 4.4v12H6.5z" />
      <path d="M13.4 3.9v4.4h4.4" />
      {name === "form-plus" ? <path d="M9.4 13.6h4.4M11.6 11.4v4.4" /> : <path d="M9.4 13.4h4.6M9.4 16.4h3" />}
    </Glyph>
  );
}

/* ------------------------------- stats ------------------------------ */

function StatGlyph({ card }) {
  if (card.glyph === "ring") {
    const pct = Math.max(0, Math.min(100, Number(card.ringPct || 0)));
    const r = 14;
    const c = 2 * Math.PI * r;
    return (
      <svg className="wf-stat-art" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#cee4d2" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="#1c7a45"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 18 18)"
        />
        <circle cx="18" cy="18" r="4.6" fill="#1c7a45" />
      </svg>
    );
  }

  const dots = card.dots || ["green", "yellow", "green"];
  const bars = <StatBars card={card} dots={dots} />;

  if (card.glyph === "trend") {
    return (
      <>
        <svg className="wf-stat-art wf-stat-art--trend" viewBox="0 0 96 30" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M2 27h14v-6h14v-4h14v-7h14v-5h14v-4h16"
            fill="none"
            stroke="#1c7a45"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {bars}
      </>
    );
  }

  return (
    <>
      <span className="wf-stat-dots" aria-hidden="true">
        {dots.map((tone, index) => (
          <i key={`${tone}-${index}`} className={`wf-dot wf-dot--${tone}`} />
        ))}
      </span>
      {bars}
    </>
  );
}

/* Phone variant of the same glyphs (Screen 2 draws bars instead of dots). */
function StatBars({ card, dots }) {
  if (card.key === "forms") {
    return (
      <span className="wf-stat-bars wf-stat-bars--h" aria-hidden="true">
        {dots.map((tone, index) => (
          <i
            key={`${tone}-${index}`}
            className={`wf-stat-bar wf-stat-bar--${tone}`}
            style={{ width: `${[100, 84, 66][index] || 62}%` }}
          />
        ))}
      </span>
    );
  }
  return (
    <span className="wf-stat-bars wf-stat-bars--v" aria-hidden="true">
      {[46, 78, 100, 64, 88].map((height, index) => (
        <i
          key={height}
          className={`wf-stat-bar wf-stat-bar--${dots[index % dots.length]}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </span>
  );
}

export function StatCards({ cards }) {
  return (
    <div className="wf-stats">
      {cards.map((card) => (
        <article className="wf-dash-card wf-stat" key={card.key}>
          <div className="wf-stat-top">
            <span className="wf-stat-label">{card.label}</span>
            <span className="wf-stat-ico">
              <StatIcon name={card.icon} />
            </span>
          </div>
          <p className="wf-stat-value">{card.value ?? "—"}</p>
          <div className="wf-stat-mid">
            <span className="wf-stat-sub">{card.sub}</span>
            {card.badge ? <span className={`wf-pill wf-pill--${card.badge.tone}`}>{card.badge.text}</span> : null}
            {card.trend ? (
              <span className="wf-stat-trend" aria-hidden="true">
                <Glyph size={18}>
                  <path d="M4.5 17.5 10 12l3.4 3.4L19.5 9" />
                  <path d="M14.6 9h4.9v4.9" />
                </Glyph>
              </span>
            ) : null}
          </div>
          <div className="wf-stat-foot">
            <StatGlyph card={card} />
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------- what's happening ------------------------ */

function activityTone(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("submission")) return "green";
  if (value.includes("form")) return "yellow";
  if (value.includes("invit") || value.includes("doctor") || value.includes("user")) return "person";
  return "khaki";
}

function activityIcon(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("invit") || value.includes("doctor") || value.includes("user")) return "person";
  if (value.includes("form")) return "form-plus";
  return "doc";
}

function ActivityRow({ entry }) {
  return (
    <div className="wf-act-row">
      <span className={`wf-act-ico wf-act-ico--${activityTone(entry.text)}`}>
        <IconActivity name={activityIcon(entry.text)} />
      </span>
      <span className="wf-act-text">
        <strong>{entry.time}</strong> — {entry.text}
      </span>
    </div>
  );
}

/* Screen 1 keeps the recent activity inside the "What's happening" card,
 * Screen 2 pulls it out into its own card under "Needs your attention".
 * It renders as two siblings so the grid can place each block per breakpoint. */
export function HappeningCard({ series, activity }) {
  const max = Math.max(
    1,
    ...series.map((day) => day.submitted),
    ...series.map((day) => day.tenants),
  );

  return (
    <>
      <section className="wf-dash-card wf-happen">
        <header className="wf-card-head">
          <h2 className="wf-card-title">What&rsquo;s happening</h2>
          <p className="wf-card-sub">A quick view of activity across your platform</p>
        </header>

        <div className="wf-plot">
          <div className="wf-plot-area">
            {series.map((day) => (
              <div className="wf-col" key={day.label}>
                <span
                  className="wf-bar wf-bar--sub"
                  style={{
                    height: `${(day.submitted / max) * 100}%`,
                    opacity: day.submitted ? 0.55 + 0.45 * (day.submitted / max) : 0,
                  }}
                />
                <span
                  className="wf-bar wf-bar--ten"
                  style={{
                    /* Tenant creation is rare: draw it as a small tick at the
                     * foot of the column so one tenant never overtakes the
                     * submission bars (Screen 1 shows no tall yellow blocks). */
                    height: day.tenants ? "8px" : 0,
                    opacity: day.tenants ? 1 : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="wf-axis">
            {series.map((day) => (
              <span key={day.label}>{day.label}</span>
            ))}
          </div>
          <div className="wf-legend">
            <span className="wf-chip">
              <i className="wf-dot wf-dot--green" />
              Forms submitted
            </span>
            <span className="wf-chip">
              <i className="wf-dot wf-dot--yellow" />
              New tenants
            </span>
          </div>
        </div>
      </section>

      <section className="wf-dash-card wf-activity">
        <h3 className="wf-activity-title">Recent activity</h3>
        {activity === null ? (
          <div className="wf-act-rows">
            {[0, 1, 2].map((row) => (
              <div className="wf-act-row is-skeleton" key={row}>
                <span className="wf-act-ico" />
                <span className="wf-act-text" />
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="wf-act-empty">No activity recorded in this scope yet.</p>
        ) : (
          <div className="wf-act-rows">
            {activity.slice(0, 3).map((entry) => (
              <ActivityRow entry={entry} key={entry.id} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------ needs your attention ---------------------- */

export function AttentionCard({ items }) {
  if (!items.length) return null;
  return (
    <section className="wf-dash-card wf-attn">
      <header className="wf-card-head">
        <h2 className="wf-card-title">Needs your attention</h2>
        <p className="wf-card-sub">Small tasks that keep everything moving</p>
      </header>
      <ul className="wf-attn-list">
        {items.map((item) => (
          <li className="wf-attn-item" key={item.title}>
            <span className={`wf-attn-ico wf-attn-ico--${item.tone}`}>
              <IconAttention name={item.icon} />
            </span>
            <span className="wf-attn-copy">
              <span className="wf-attn-title">{item.title}</span>
              <span className="wf-attn-body">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- report download ------------------------ */

/* The CSV export itself lives in ./reportDownload.js so this file only
 * exports components (react-refresh / fast refresh requirement). */

export function HeaderButtons({ onDownload, ready }) {
  return (
    <div className="wf-dash-head-actions">
      <button type="button" className="wf-btn wf-btn--light" onClick={onDownload} disabled={!ready}>
        <IconDownload />
        Download reports
      </button>
    </div>
  );
}

export { IconSpark };
