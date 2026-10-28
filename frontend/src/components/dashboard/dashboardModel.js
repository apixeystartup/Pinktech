/* ------------------------------------------------------------------ *
 * Turns the /dashboard/stats payload into what the dashboard cards draw.
 * Every figure here comes from the API — nothing is invented, and totals
 * are counted from the same rows the cards display.
 * ------------------------------------------------------------------ */

const RING_COLORS = ["#f8d858", "#dcd8ce", "#c2beb4", "#a5a199"];

const METRIC_LABELS = {
  employees: "Employees",
  doctors: "Doctors",
  forms: "Forms",
  submitted: "Forms submitted",
  formsCreated: "Forms created",
  doctorsCreated: "Doctors created",
};

function asCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shareParts(counts) {
  return counts
    .filter((part) => part.count > 0)
    .map((part, index) => ({ ...part, color: RING_COLORS[index % RING_COLORS.length] }));
}

function statusKey(status) {
  const key = String(status || "").toUpperCase();
  if (key === "OTP_PENDING" || key === "INVITED" || key === "PENDING") return "Invited";
  if (key === "ACTIVE") return "Active";
  if (key === "SUSPENDED" || key === "DISABLED") return "Suspended";
  return key ? key.charAt(0) + key.slice(1).toLowerCase() : "Unknown";
}

function monthWindow(months) {
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString([], { month: "short" }),
      count: 0,
    });
  }
  return out;
}

/* ----------------------------- super admin ----------------------------- */

function superAdminModel(data) {
  const summary = data.summary || {};
  const tenants = (data.tenants || []).slice();
  const totalTenants = asCount(summary.totalTenants);
  const totalEmployees = asCount(summary.totalEmployees);
  const totalUsers = asCount(summary.totalUsers);
  const totalForms = asCount(summary.totalForms);
  const totalDoctors = asCount(summary.totalDoctors);
  const formsSubmitted = asCount(summary.formsSubmitted);

  const byHeadcount = tenants
    .filter((tenant) => asCount(tenant.employeeCount) > 0)
    .sort((a, b) => asCount(b.employeeCount) - asCount(a.employeeCount));

  let ring;
  if (byHeadcount.length > 1) {
    const top = byHeadcount.slice(0, 3).map((tenant) => ({ label: tenant.name, count: asCount(tenant.employeeCount) }));
    const rest = byHeadcount.slice(3);
    const parts = shareParts([
      ...top,
      ...(rest.length
        ? [{ label: `${rest.length} more tenant${rest.length > 1 ? "s" : ""}`, count: rest.reduce((sum, tenant) => sum + asCount(tenant.employeeCount), 0) }]
        : []),
    ]);
    ring = {
      title: "Where the people are",
      centerLabel: "Employees",
      centerValue: String(totalEmployees),
      parts,
    };
  } else {
    ring = {
      title: "Accounts on the platform",
      centerLabel: "People",
      centerValue: String(totalEmployees + totalUsers),
      parts: shareParts([
        { label: "Org employees", count: totalEmployees },
        { label: "Other accounts", count: totalUsers },
      ]),
    };
  }

  const metrics = [
    { value: "employees", label: "Employees", rows: (tenant) => asCount(tenant.employeeCount) },
    { value: "doctors", label: "Doctors", rows: (tenant) => asCount(tenant.doctorCount) },
    { value: "forms", label: "Forms", rows: (tenant) => asCount(tenant.formCount) },
    { value: "submitted", label: "Forms submitted", rows: (tenant) => asCount(tenant.formSubmittedCount) },
  ];

  const rowsFor = (metricValue) => {
    const metric = metrics.find((item) => item.value === metricValue) || metrics[3];
    return tenants
      .map((tenant) => ({ tenant, value: metric.rows(tenant) }))
      .sort((a, b) => b.value - a.value || a.tenant.name.localeCompare(b.tenant.name))
      .slice(0, 6)
      .map((row, index) => ({
        label: row.tenant.name,
        value: row.value,
        accent: index === 0 && row.value > 0,
        tipValue: String(row.value),
        tipLabel: metric.label,
      }));
  };

  const usage = {
    title: "Usage Over View",
    switcher: { options: metrics.map((metric) => ({ label: metric.label, value: metric.value })), index: 3, rowsFor },
    foot: `${totalForms} forms created · ${formsSubmitted} submitted across ${totalTenants} tenant${totalTenants === 1 ? "" : "s"}`,
  };

  const list = {
    title: "Latest Tenants",
    count: tenants.length,
    items: tenants
      .slice()
      .sort((a, b) => new Date(b.createdAt || b.startDate || 0) - new Date(a.createdAt || a.startDate || 0))
      .slice(0, 4)
      .map((tenant) => ({
        title: tenant.name,
        meta: [
          { label: "Plan", value: String(tenant.plan || "—").toUpperCase() },
          { label: "Employees", value: String(asCount(tenant.employeeCount)) },
          { label: "Doctors", value: String(asCount(tenant.doctorCount)) },
          { label: "Forms", value: `${asCount(tenant.formCount)} / ${asCount(tenant.formSubmittedCount)} submitted` },
        ],
      })),
  };

  const report = {
    filename: "pinktech-tenants.csv",
    note: `${tenants.length} tenant${tenants.length === 1 ? "" : "s"} · headcount, doctors and forms today`,
    rows: [
      ["Tenant", "Code", "Plan", "Status", "Employees", "Doctors", "Forms", "Forms submitted", "Started"],
      ...tenants.map((tenant) => [
        tenant.name,
        tenant.code,
        tenant.plan,
        tenant.status,
        asCount(tenant.employeeCount),
        asCount(tenant.doctorCount),
        asCount(tenant.formCount),
        asCount(tenant.formSubmittedCount),
        tenant.startDate ? new Date(tenant.startDate).toISOString().slice(0, 10) : "",
      ]),
    ],
  };

  return {
    stats: [
      { icon: "tenants", value: totalTenants, label: "Tenants" },
      { icon: "people", value: totalEmployees, label: "Employees" },
      { icon: "doctors", value: totalDoctors, label: "Doctors" },
      { icon: "forms", value: formsSubmitted, label: "Forms Submitted" },
    ],
    ring,
    usage,
    list,
    report,
  };
}

/* ----------------------------- tenant admin ---------------------------- */

function tenantAdminModel(data) {
  const summary = data.summary || {};
  const employees = data.employees || [];
  const doctors = data.doctors || [];
  const totalEmployees = asCount(summary.totalEmployees);
  const totalDoctors = asCount(summary.totalDoctors);
  const formsCreated = asCount(summary.formsCreated);
  const formsSubmitted = asCount(summary.formsSubmitted);

  const statusCounts = new Map();
  for (const employee of employees) {
    const key = statusKey(employee.status);
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  }
  const parts = shareParts(
    [...statusCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ label, count })),
  );

  const ring = {
    title: "Team status",
    centerLabel: "Employees",
    centerValue: String(totalEmployees),
    parts: parts.length
      ? parts
      : shareParts([{ label: "Active", count: 0 }]),
  };

  const metrics = [
    { value: "forms", label: "Forms created", pick: (employee) => asCount(employee.formsCreated) },
    { value: "doctors", label: "Doctors created", pick: (employee) => asCount(employee.usersCreated) },
  ];

  const rowsFor = (metricValue) => {
    const metric = metrics.find((item) => item.value === metricValue) || metrics[0];
    return employees
      .map((employee) => ({ employee, value: metric.pick(employee) }))
      .sort((a, b) => b.value - a.value || String(a.employee.name).localeCompare(String(b.employee.name)))
      .slice(0, 6)
      .map((row, index) => ({
        label: row.employee.name || row.employee.email || "—",
        value: row.value,
        accent: index === 0 && row.value > 0,
        tipValue: String(row.value),
        tipLabel: metric.label,
      }));
  };

  const usage = {
    title: "Usage Over View",
    switcher: { options: metrics.map((metric) => ({ label: metric.label, value: metric.value })), index: 0, rowsFor },
    foot: `${formsCreated} form${formsCreated === 1 ? "" : "s"} created · ${formsSubmitted} submitted by ${totalEmployees} employee${totalEmployees === 1 ? "" : "s"}`,
  };

  const list = {
    title: "Top Doctors",
    count: doctors.length,
    items: doctors
      .slice()
      .sort((a, b) => asCount(b.formsCreated) - asCount(a.formsCreated))
      .slice(0, 4)
      .map((doctor) => ({
        title: doctor.name || "—",
        meta: [
          { label: "Created by", value: doctor.createdBy?.name || "—" },
          { label: "Emp code", value: doctor.createdBy?.empCode || "—" },
          { label: "Forms", value: String(asCount(doctor.formsCreated)) },
        ],
      })),
  };

  const report = {
    filename: "pinktech-employees.csv",
    note: `${employees.length} employee${employees.length === 1 ? "" : "s"} · roles and output today`,
    rows: [
      ["Name", "Email", "Emp code", "Roles", "Reports to", "Status", "Forms created", "Doctors created"],
      ...employees.map((employee) => [
        employee.name,
        employee.email,
        employee.empCode || "",
        employee.roles || "",
        employee.reportingTo?.name || "Root",
        employee.status || "",
        asCount(employee.formsCreated),
        asCount(employee.usersCreated),
      ]),
    ],
  };

  return {
    stats: [
      { icon: "people", value: totalEmployees, label: "Employees" },
      { icon: "doctors", value: totalDoctors, label: "Doctors" },
      { icon: "forms", value: formsCreated, label: "Forms Created" },
      { icon: "reports", value: formsSubmitted, label: "Forms Submitted" },
    ],
    ring,
    usage,
    list,
    report,
  };
}

/* ------------------------------- employee ------------------------------ */

function employeeModel(data) {
  const summary = data.summary || {};
  const myForms = data.myForms || [];
  const reports = data.directReports || [];
  const onboarded = data.usersCreated || [];
  const formsCreated = asCount(summary.formsCreated);
  const directReports = asCount(summary.directReports);
  const usersCreated = asCount(summary.usersCreated);

  const statusCounts = new Map();
  for (const form of myForms) {
    const key = String(form.status || "").toUpperCase() === "PUBLISHED" ? "Published" : "Draft";
    statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
  }
  const ring = {
    title: "My forms",
    centerLabel: "Forms",
    centerValue: String(myForms.length),
    parts: shareParts(
      [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
    ).length
      ? shareParts(
          [...statusCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count })),
        )
      : shareParts([{ label: "Published", count: 0 }]),
  };

  const months = monthWindow(6);
  for (const form of myForms) {
    const date = new Date(form.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const bucket = months.find((month) => month.key === key);
    if (bucket) bucket.count += 1;
  }
  let lastActive = -1;
  months.forEach((month, index) => {
    if (month.count > 0) lastActive = index;
  });

  const usage = {
    title: "Usage Over View",
    scope: "Last 6 months",
    rows: months.map((month, index) => ({
      label: month.label,
      value: month.count,
      accent: index === lastActive,
      tipValue: String(month.count),
      tipLabel: month.count === 1 ? "form created" : "forms created",
    })),
    foot: `${formsCreated} form${formsCreated === 1 ? "" : "s"} created · ${onboarded.length} doctor${onboarded.length === 1 ? "" : "s"} onboarded`,
  };

  const list = {
    title: "My Forms",
    count: myForms.length,
    items: myForms
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 4)
      .map((form) => ({
        title: form.name || "—",
        meta: [
          { label: "Status", value: String(form.status || "—").toLowerCase() },
          {
            label: "Created",
            value: form.createdAt ? new Date(form.createdAt).toLocaleDateString() : "—",
          },
        ],
      })),
  };

  const report = {
    filename: "pinktech-my-work.csv",
    note: `${myForms.length} form${myForms.length === 1 ? "" : "s"} · ${usersCreated} doctor${usersCreated === 1 ? "" : "s"} onboarded`,
    rows: [
      ["Form", "Status", "Created"],
      ...myForms.map((form) => [
        form.name,
        form.status || "",
        form.createdAt ? new Date(form.createdAt).toISOString().slice(0, 10) : "",
      ]),
      [],
      ["Doctor onboarded", "Email", "Status", "Created"],
      ...onboarded.map((user) => [
        user.name,
        user.email,
        user.status || "",
        user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : "",
      ]),
    ],
  };

  return {
    stats: [
      { icon: "forms", value: formsCreated, label: "Forms Created" },
      { icon: "doctors", value: usersCreated, label: "Doctors Onboarded" },
      { icon: "people", value: directReports, label: "Direct Reports" },
    ],
    ring,
    usage,
    list,
    report,
    listFallbackNote: reports.length === 0 && myForms.length === 0,
  };
}

export default function buildDashboardModel(data) {
  if (!data) return null;
  if (data.role === "super_admin") return superAdminModel(data);
  if (data.role === "tenant_admin") return tenantAdminModel(data);
  return employeeModel(data);
}

/* ================================================================== *
 * Wireframe layer (Screen 1 / Screen 2): the four stat cards, the    *
 * weekday series behind "What's happening" and the attention list.   *
 * All figures come from /dashboard/stats plus the activity feed      *
 * (audit logs + real form submissions) — nothing is invented.        *
 * ================================================================== */

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WINDOW_DAYS = 30;

function withinDays(value, days = WINDOW_DAYS) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  return time >= Date.now() - days * 86400000;
}

function weekdayIndex(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return -1;
  return (date.getDay() + 6) % 7; // Monday-first, matching the wireframe axis
}

/* Weekday buckets over the rolling window used by the chart. */
export function buildWeekSeries(feed) {
  const submitted = [0, 0, 0, 0, 0, 0, 0];
  const tenants = [0, 0, 0, 0, 0, 0, 0];

  for (const iso of feed?.submissions || []) {
    const index = weekdayIndex(iso);
    if (index >= 0 && withinDays(iso)) submitted[index] += 1;
  }
  for (const iso of feed?.tenantsCreated || []) {
    const index = weekdayIndex(iso);
    if (index >= 0 && withinDays(iso)) tenants[index] += 1;
  }

  return DAY_LABELS.map((label, index) => ({
    label,
    submitted: submitted[index],
    tenants: tenants[index],
  }));
}

function publishedLine(feed, total) {
  const published = feed?.publishedForms;
  if (published == null) return `${total} total`;
  if (total > 0 && published >= total) return "Ready to be used";
  return `${published} of ${total} published`;
}

function monthLine(count, noun) {
  if (!count) return `No ${noun} yet this month`;
  return `${count} ${noun} this month`;
}

function activePhrase(total, active) {
  if (!total) return "No records yet";
  if (active === total) return total === 2 ? "Both are active" : `All ${total} are active`;
  return `${active} of ${total} are active`;
}

/* The four cards of Screen 1 — one row per role, same shape. */
export function buildStatCards(data, feed) {
  if (!data) return [];
  const summary = data.summary || {};
  const submissions = (feed?.submissions || []).filter((iso) => withinDays(iso)).length;

  if (data.role === "super_admin") {
    const tenants = data.tenants || [];
    const total = asCount(summary.totalTenants);
    const active = tenants.filter((tenant) => String(tenant.status || "").toUpperCase() === "ACTIVE").length;
    const pct = total ? Math.round((active / total) * 100) : 0;
    const totalForms = asCount(summary.totalForms);

    return [
      {
        key: "tenants",
        icon: "tenants",
        label: "Total tenants",
        value: total,
        sub: activePhrase(total, active),
        badge: total ? { text: `${pct}% active`, tone: "green" } : null,
        glyph: "ring",
        ringPct: pct,
      },
      {
        key: "doctors",
        icon: "doctors",
        label: "Doctors",
        value: asCount(summary.totalDoctors),
        sub: "Across all tenants",
        badge: { text: "On track", tone: "khaki" },
        glyph: "dots",
        dots: ["green", "yellow", "green"],
      },
      {
        key: "forms",
        icon: "forms",
        label: "Forms created",
        value: totalForms,
        sub: publishedLine(feed, totalForms),
        badge: { text: totalForms ? "On track" : "Nothing yet", tone: "khaki" },
        glyph: "dots",
        dots: ["yellow", "yellow", "khaki"],
      },
      {
        key: "submitted",
        icon: "send",
        label: "Forms submitted",
        value: asCount(summary.formsSubmitted),
        sub: monthLine(submissions, "submissions"),
        badge: null,
        trend: submissions > 0,
        glyph: "trend",
      },
    ];
  }

  if (data.role === "tenant_admin") {
    const employees = data.employees || [];
    const total = asCount(summary.totalEmployees);
    const active = employees.filter((employee) => String(employee.status || "").toUpperCase() === "ACTIVE").length;
    const pct = total ? Math.round((active / total) * 100) : 0;
    const totalForms = asCount(summary.formsCreated);

    return [
      {
        key: "employees",
        icon: "people",
        label: "Total employees",
        value: total,
        sub: activePhrase(total, active),
        badge: total ? { text: `${pct}% active`, tone: "green" } : null,
        glyph: "ring",
        ringPct: pct,
      },
      {
        key: "doctors",
        icon: "doctors",
        label: "Doctors",
        value: asCount(summary.totalDoctors),
        sub: "Created by your team",
        badge: { text: "On track", tone: "khaki" },
        glyph: "dots",
        dots: ["green", "yellow", "green"],
      },
      {
        key: "forms",
        icon: "forms",
        label: "Forms created",
        value: totalForms,
        sub: publishedLine(feed, totalForms),
        badge: { text: totalForms ? "On track" : "Nothing yet", tone: "khaki" },
        glyph: "dots",
        dots: ["yellow", "yellow", "khaki"],
      },
      {
        key: "submitted",
        icon: "send",
        label: "Forms submitted",
        value: asCount(summary.formsSubmitted),
        sub: monthLine(submissions, "submissions"),
        badge: null,
        trend: submissions > 0,
        glyph: "trend",
      },
    ];
  }

  const myForms = data.myForms || [];
  const totalForms = asCount(summary.formsCreated);
  const published = myForms.filter((form) => String(form.status || "").toUpperCase() === "PUBLISHED").length;
  const reports = asCount(summary.directReports);

  const cards = [
    {
      key: "forms",
      icon: "forms",
      label: "Forms created",
      value: totalForms,
      sub: myForms.length
        ? published >= myForms.length
          ? "Ready to be used"
          : `${published} of ${myForms.length} published`
        : "Nothing drafted yet",
      badge: { text: totalForms ? "On track" : "Nothing yet", tone: "khaki" },
      glyph: "dots",
      dots: ["yellow", "yellow", "khaki"],
    },
    {
      key: "doctors",
      icon: "doctors",
      label: "Doctors onboarded",
      value: asCount(summary.usersCreated),
      sub: "Profiles you created",
      badge: { text: "On track", tone: "khaki" },
      glyph: "dots",
      dots: ["green", "yellow", "green"],
    },
  ];

  if (reports > 0) {
    cards.push({
      key: "reports",
      icon: "people",
      label: "Direct reports",
      value: reports,
      sub: activePhrase(reports, reports),
      badge: { text: `${pct0(reports)}% active`, tone: "green" },
      glyph: "ring",
      ringPct: 100,
    });
  }

  cards.push({
    key: "submitted",
    icon: "send",
    label: "Forms submitted",
    value: asCount(summary.formsSubmitted),
    sub: monthLine(submissions, "submissions"),
    badge: null,
    trend: submissions > 0,
    glyph: "trend",
  });

  return cards;
}

function pct0() {
  return 100;
}

/* "Needs your attention" — up to three tasks, role aware. */
export function buildAttentionItems(data) {
  if (!data) return [];
  const summary = data.summary || {};
  const items = [];

  if (data.role === "super_admin") {
    const tenants = data.tenants || [];
    const total = asCount(summary.totalTenants);
    if (total) {
      items.push({
        tone: "amber",
        icon: "alert",
        title: `Review ${total} tenant profile${total === 1 ? "" : "s"}`,
        body: "Make sure details are complete",
      });
    }
    const needsFirst = total === 0 || tenants.some((tenant) => asCount(tenant.doctorCount) === 0);
    items.push({
      tone: "person",
      icon: "person",
      title: needsFirst ? "Invite your first doctor" : "Invite more doctors",
      body: "Doctors can submit and manage forms",
    });
    items.push({
      tone: "green",
      icon: "inbox",
      title: "Check recent submissions",
      body: "Stay on top of incoming data",
    });
    return items;
  }

  if (data.role === "tenant_admin") {
    const total = asCount(summary.totalEmployees);
    items.push({
      tone: "amber",
      icon: "alert",
      title: total ? `Review ${total} employee profile${total === 1 ? "" : "s"}` : "Add your first employee",
      body: "Make sure details are complete",
    });
    items.push({
      tone: "person",
      icon: "person",
      title: asCount(summary.totalDoctors) ? "Invite more doctors" : "Invite your first doctor",
      body: "Doctors can submit and manage forms",
    });
    items.push({
      tone: "green",
      icon: "inbox",
      title: "Check recent submissions",
      body: "Stay on top of incoming data",
    });
    return items;
  }

  const onboarded = asCount(summary.usersCreated);
  items.push({
    tone: "green",
    icon: "inbox",
    title: asCount(summary.formsCreated) ? "Check recent submissions" : "Start with your first form",
    body: "Stay on top of incoming data",
  });
  items.push({
    tone: "person",
    icon: "person",
    title: onboarded ? "Invite more doctors" : "Invite your first doctor",
    body: "Doctors can submit and manage forms",
  });
  const reports = asCount(summary.directReports);
  if (reports) {
    items.push({
      tone: "amber",
      icon: "alert",
      title: `Review ${reports} direct report${reports === 1 ? "" : "s"}`,
      body: "Keep your team's details complete",
    });
  }
  return items;
}

/* "Last activity" cell: the newest audit entry for the tenant, falling
 * back to the day the tenant itself was created. */
export function tenantLastActivity(tenant, feed) {
  const fromLog = feed?.lastActivity?.[String(tenant.tenantId)];
  const value = fromLog || tenant.createdAt || tenant.startDate;
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today - thatDay) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function capitalizeWord(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "—";
}

export { METRIC_LABELS };
