import { useEffect, useState } from "react";
import api from "../../lib/api";

/* ------------------------------------------------------------------ *
 * Recent activity for the dashboard: the last audit entries, phrased  *
 * for people and clocked as times. Kept out of the card components    *
 * so the file exports only components (fast refresh).                 *
 * ------------------------------------------------------------------ */

const ACTION_WORDS = {
  TENANT_CREATED: "Tenant created",
  TENANT_UPDATED: "Tenant updated",
  TENANT_PROFILE_UPDATED: "Tenant profile updated",
  ROLE_CREATED: "Role created",
  ROLE_UPDATED: "Role updated",
  ROLE_DELETED: "Role deleted",
  ROLE_DELETED_BULK: "Roles deleted",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_INVITED: "Invite sent",
  FORM_CREATED: "Form created",
  FORM_UPDATED: "Form updated",
  FORM_PUBLISHED: "Form published",
  SUBMISSION_CREATED: "Submission received",
  DOCTOR_CREATED: "Doctor onboarded",
  LOGIN_SUCCESS: "Signed in",
  ORG_ROLE_ENGINE_RUN: "Org roles recalculated",
};

function describeLog(item) {
  const base =
    ACTION_WORDS[item.action] ||
    String(item.action || "")
      .toLowerCase()
      .split("_")
      .filter(Boolean)
      .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(" ");
  const subject = item.metadata?.name || item.metadata?.code || item.tenantOrgLabel;
  const who = item.user?.name;
  return [base, subject && subject !== "Platform" ? subject : null, who ? `by ${who}` : null].filter(Boolean).join(" · ");
}

/* Clock like the wireframe does: times for today, "Yesterday" for the day
 * before, and a short date once an entry is older than that. */
function timeOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((today - thatDay) / 86400000);

  if (days <= 0) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function useRecentActivity() {
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get("/audit/logs", { params: { limit: 5 } })
      .then((res) => {
        if (!active) return;
        const items = res.data?.items || [];
        setActivity(
          items.map((item) => ({
            id: item._id || `${item.action}-${item.createdAt}`,
            time: timeOf(item.createdAt),
            text: describeLog(item),
          })),
        );
      })
      .catch(() => {
        if (active) setActivity([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return activity;
}

/* ------------------------------------------------------------------ *
 * The feed behind the wireframe's chart and cards: real form          *
 * submissions (per tenant scope for a super admin), tenant creations  *
 * from the audit trail and the newest audit entry per tenant, which   *
 * drives the "Last activity" column. Every request degrades on its    *
 * own — a missing feed only empties the chart, it never breaks the    *
 * page.                                                               *
 * ------------------------------------------------------------------ */

const EMPTY_FEED = { submissions: [], tenantsCreated: [], publishedForms: null, lastActivity: {} };

function listOf(payload, keys) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export function usePlatformActivity(data) {
  const [feed, setFeed] = useState(EMPTY_FEED);

  useEffect(() => {
    if (!data) return undefined;
    let active = true;

    const scopes =
      data.role === "super_admin"
        ? (data.tenants || []).map((tenant) => tenant.tenantId).filter(Boolean).slice(0, 8)
        : [null];

    const opts = (scope) => (scope ? { headers: { "X-Tenant-Id": scope } } : undefined);

    const readScope = async (scope) => {
      const out = { submissions: [], published: 0, readable: false };
      try {
        const res = await api.get("/forms/schema-forms/modules", opts(scope));
        const modules = listOf(res.data, ["modules", "items", "forms", "data"]);
        out.readable = true;
        for (const item of modules) {
          if (String(item.status || "").toUpperCase() === "PUBLISHED") out.published += 1;
          const moduleId = item._id || item.id || item.formId;
          if (!moduleId) continue;
          try {
            const submissions = await api.get(`/forms/submissions/module/${moduleId}`, opts(scope));
            for (const row of listOf(submissions.data, ["submissions", "items", "data"])) {
              const stamp = row.createdAt || row.submittedAt;
              if (stamp) out.submissions.push(stamp);
            }
          } catch {
            // one module is best-effort; the rest of the feed still renders
          }
        }
      } catch {
        // this scope is not readable for this account
      }
      return out;
    };

    const created = api
      .get("/audit/logs", { params: { action: "TENANT_CREATED", limit: 100 } })
      .then((res) => listOf(res.data, ["items"]).map((item) => item.createdAt).filter(Boolean))
      .catch(() => []);

    const recent = api
      .get("/audit/logs", { params: { limit: 100 } })
      .then((res) => {
        const byTenant = {};
        for (const item of listOf(res.data, ["items"])) {
          const key = item.tenantId || item.metadata?.tenantId;
          if (!key || !item.createdAt) continue;
          const stamp = byTenant[String(key)];
          if (!stamp || new Date(item.createdAt) > new Date(stamp)) byTenant[String(key)] = item.createdAt;
        }
        return byTenant;
      })
      .catch(() => ({}));

    Promise.all([Promise.all(scopes.map(readScope)), created, recent]).then(
      ([scopeRows, tenantsCreated, lastActivity]) => {
        if (!active) return;
        const readable = scopeRows.some((row) => row.readable);
        setFeed({
          submissions: scopeRows.flatMap((row) => row.submissions),
          tenantsCreated,
          publishedForms: readable ? scopeRows.reduce((total, row) => total + row.published, 0) : null,
          lastActivity,
        });
      },
    );

    return () => {
      active = false;
    };
  }, [data]);

  return feed;
}