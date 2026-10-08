/**
 * Demo film script.
 *
 * The landing page "demo video" is a scripted 3D film: a single camera dolly
 * flies through eight stages of the real platform (gateway -> 8 microservices ->
 * MongoDB -> tenancy -> org tree -> forms/approvals -> KYC/e-sign/audit -> live
 * operations), while the overlay narrates each chapter.
 *
 * All timings are authored in seconds. `CHAPTERS` is the single source of truth
 * for the overlay text; `CAMERA_TRACK` is a keyframed dolly in world space.
 */

export const PALETTE = {
  indigo: "#818cf8",
  indigoDeep: "#4f46e5",
  cyan: "#22d3ee",
  purple: "#a855f7",
  pink: "#ec4899",
  emerald: "#34d399",
  amber: "#fbbf24",
  rose: "#fb7185",
  slate: "#94a3b8",
  white: "#f8fafc",
};

/* ---- Stage origins along -Z: the camera travels through the platform ---- */
export const STAGE_Z = {
  platform: 0,
  routing: -34,
  tenancy: -68,
  org: -102,
  workflow: -136,
  kyc: -170,
  ops: -204,
  outro: -238,
};

export const CHAPTERS = [
  {
    id: "platform",
    scene: "platform",
    number: "01",
    kicker: "The platform",
    title: "One front end. Nine services.",
    caption:
      "A Vite + React client talks to a single Express API gateway. The gateway verifies the token, resolves the tenant, then proxies to eight independent microservices.",
    bullets: [
      "API Gateway :5001 — JWT verify, rate limits, tenant scope",
      "8 services on ports 4001 → 4008",
      "One MongoDB, tenant-partitioned collections",
    ],
    duration: 9,
  },
  {
    id: "routing",
    scene: "routing",
    number: "02",
    kicker: "Request lifecycle",
    title: "Every request, guarded end to end.",
    caption:
      "One login call walks the full pipeline: TLS, rate limit, JWT verify, role + permission resolution, tenant override check, route match, proxy, response.",
    bullets: [
      "Brute-force budgets on /auth/* endpoints",
      "x-tenant-id override restricted to tenant.manage",
      "Permission codes forwarded as request headers",
    ],
    duration: 10,
  },
  {
    id: "tenancy",
    scene: "tenancy",
    number: "03",
    kicker: "Multi-tenancy",
    title: "Isolated vaults, one platform.",
    caption:
      "Each tenant lives in its own sealed vault with its own users, roles and data. A central permission gate decides what every role may reach.",
    bullets: [
      "Tenant-scoped RBAC: role → permission catalog",
      "Super admin sees every tenant and can impersonate scope",
      "Cross-tenant reads are rejected at the gateway",
    ],
    duration: 9.5,
  },
  {
    id: "org",
    scene: "org",
    number: "04",
    kicker: "Organization",
    title: "The org tree, in three levels.",
    caption:
      "Level 1 invites employees, Level 2 manages teams, Level 3 works the queue. Positions map to roles, and permission chips cascade down the tree.",
    bullets: [
      "Reporting lines rendered from live org data",
      "Position assignment drives approver routing",
      "Visibility gated by employee.view / edit / assign",
    ],
    duration: 8.5,
  },
  {
    id: "workflow",
    scene: "workflow",
    number: "05",
    kicker: "Forms & approvals",
    title: "Build a form. Route it. Approve it.",
    caption:
      "A schema form is assembled field by field, dispatched to the right people by tokenised public links, and pushed through SLA-timed approval stages.",
    bullets: [
      "Conditional logic, validation, custom fields",
      "Tokenised public dispatch — no login for the submitter",
      "Multi-level chains with escalation and rework",
    ],
    duration: 11,
  },
  {
    id: "kyc",
    scene: "kyc",
    number: "06",
    kicker: "Compliance",
    title: "KYC, e-signature, audit.",
    caption:
      "Documents are uploaded, scanned, verified and signed. Every decision is sealed into an append-only audit ledger that compliance can replay.",
    bullets: [
      "Document upload with verification workflow",
      "Hand-drawn e-signature with full audit trail",
      "Append-only audit records for every action",
    ],
    duration: 10,
  },
  {
    id: "ops",
    scene: "ops",
    number: "07",
    kicker: "Live operations",
    title: "Everything shows up here.",
    caption:
      "Submissions, SLA compliance, tenant health and approval throughput stream into one dashboard, with notifications pushed the moment state changes.",
    bullets: [
      "Cross-service dashboard aggregation",
      "Real-time notification fan-out",
      "Exportable compliance reports",
    ],
    duration: 10,
  },
  {
    id: "outro",
    scene: "outro",
    number: "08",
    kicker: "Ship it",
    title: "Automate approvals. Empower decisions.",
    caption:
      "One command boots the gateway, all eight services, MongoDB and the front end. Your workflows are live the same minute.",
    bullets: [
      "npm run setup — MongoDB, seeds, every service",
      "Role hierarchy seeded on first boot",
      "Your tenant, your branding, your data",
    ],
    duration: 9,
  },
];

/* ---- Total runtime ---- */
export const TOTAL_DURATION = CHAPTERS.reduce((sum, c) => sum + c.duration, 0);

export const CHAPTER_STARTS = (() => {
  const starts = [];
  let acc = 0;
  for (const chapter of CHAPTERS) {
    starts.push(acc);
    acc += chapter.duration;
  }
  return starts;
})();

export function chapterAt(time) {
  const clamped = Math.min(Math.max(time, 0), TOTAL_DURATION - 0.001);
  for (let i = CHAPTERS.length - 1; i >= 0; i -= 1) {
    if (clamped >= CHAPTER_STARTS[i]) return i;
  }
  return 0;
}

/* ---- Camera dolly keyframes (world space, seconds) ---- */
const look = (x, y, z) => [x, y, z];

export const CAMERA_TRACK = [
  { t: 0, pos: [0, 4.2, 36], look: look(0, 2, 0) },
  { t: 4.2, pos: [0, 7, 31], look: look(0, 2, 0) },
  { t: 9, pos: [15, 12.5, 25], look: look(0, 1.5, 0) },
  { t: 13, pos: [7, 6, -6], look: look(0, 1.5, -20) },
  { t: 19, pos: [-7, 5, -20], look: look(0, 1.5, -34) },
  { t: 22, pos: [-7, 4, -29], look: look(0, 1, -34) },
  { t: 24, pos: [0, 7, -47], look: look(0, 1, -56) },
  { t: 28.5, pos: [0, 11.5, -53], look: look(0, 1, -68) },
  { t: 31.5, pos: [0, 8, -71], look: look(0, 2, -86) },
  { t: 37, pos: [-10, 6, -87], look: look(0, 2, -102) },
  { t: 40, pos: [0, 7, -117], look: look(0, 1.5, -136) },
  { t: 48, pos: [-12, 5, -123], look: look(0, 1, -136) },
  { t: 51, pos: [0, 6, -153], look: look(0, 1, -170) },
  { t: 58, pos: [-10, 4.5, -155], look: look(0, 1, -170) },
  { t: 61, pos: [0, 7, -187], look: look(0, 1.5, -204) },
  { t: 68, pos: [8, 6, -193], look: look(0, 1.5, -204) },
  { t: 71, pos: [0, 8.5, -225], look: look(0, 2, -238) },
  { t: TOTAL_DURATION, pos: [0, 3.6, -230], look: look(0, 1, -238) },
];

/* ---- Math helpers shared by the scenes ---- */
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const smoothstep = (v) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (v) => 1 - Math.pow(1 - clamp01(v), 3);

export const easeInOutCubic = (v) => {
  const t = clamp01(v);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Ramp a value from 0 → 1 across [start, start + span] seconds. */
export const ramp = (time, start, span) => smoothstep((time - start) / span);

/** A 0 → 1 → 0 pulse across [start, start + span]. */
export const pulse = (time, start, span) => {
  const t = (time - start) / span;
  if (t < 0 || t > 1) return 0;
  return Math.sin(t * Math.PI);
};

/** Deterministic pseudo-random in [0, 1) — keeps the film identical every run. */
export function seeded(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}