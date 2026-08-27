import { useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import { moduleTitle, permissionPrimaryLabel } from "../../../lib/permissionDisplay";

function PermissionsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get("/permissions");
        setItems(res.data || []);
      } catch (error) {
        showToast(getErrorMessage(error), "error");
      }
    }
    load();
  }, [showToast]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? items
      : items.filter((p) => {
          const blob = [p.code, p.module, p.action, p.label, p.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return blob.includes(q);
        });
    const byModule = new Map();
    for (const p of filtered) {
      const m = p.module || "other";
      if (!byModule.has(m)) byModule.set(m, []);
      byModule.get(m).push(p);
    }
    return [...byModule.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));
  }, [items, query]);

  return (
    <ModulePage
      title="Access catalog"
      description="Every grant the platform understands. Assign these to custom roles on the Roles page. Codes are stable API identifiers."
      actions={
        <span className="perm-catalog-count">
          <strong>{items.length}</strong> grants
        </span>
      }
    >
      <div className="perm-catalog-toolbar">
        <input
          type="search"
          className="perm-catalog-search"
          placeholder="Search by name, code, module, or description…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter permissions"
        />
      </div>
      {grouped.length === 0 ? (
        <p className="small-note">No permissions match this filter.</p>
      ) : (
        grouped.map(([mod, rows]) => (
          <section key={mod} className="perm-module-section">
            <h3 className="perm-module-heading">
              <span className="perm-module-title">{moduleTitle(mod)}</span>
              <span className="perm-module-meta">{mod}</span>
              <span className="perm-module-count">{rows.length}</span>
            </h3>
            <div className="perm-card-grid">
              {rows.map((p) => (
                <article key={p.code} className="perm-card">
                  <div className="perm-card__top">
                    <span className="perm-card__label">{permissionPrimaryLabel(p)}</span>
                    <code className="perm-card__code">{p.code}</code>
                  </div>
                  {p.description ? <p className="perm-card__desc">{p.description}</p> : null}
                  <div className="perm-card__foot">
                    <span className="perm-card__action">{p.action}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </ModulePage>
  );
}

export default PermissionsPage;
