function ModulePage({ title, description, actions, children }) {
  return (
    <section className="module-page">
      <div className="module-header">
        <div className="module-header-text">
          <h2>{title}</h2>
          {description ? <p className="module-page-desc">{description}</p> : null}
        </div>
        <div className="module-header-actions">
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}

export default ModulePage;
