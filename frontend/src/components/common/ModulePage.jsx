import { useState } from "react";

function ModulePage({ title, description, actions, children }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="module-page">
      <div className="module-header">
        <div className="module-header-text">
          <h2>{title}</h2>
          {description ? <p className="module-page-desc">{description}</p> : null}
        </div>
        <div className="module-header-actions">
          {actions}
          <button
            type="button"
            className="module-header-collapse"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

export default ModulePage;
