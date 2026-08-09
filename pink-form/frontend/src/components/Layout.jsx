import { Link } from "react-router-dom";

function Layout({ title, subtitle, children }) {
  return (
    <div className="shell">
      <div className="ambient ambient--light" aria-hidden="true">
        <div className="ambient__wash" />
      </div>
      <main className="container">
        <div className="container__accent" aria-hidden="true" />
        <header className="pageHeader">
          <div className="pageHeader__titles">
            <p className="eyebrow">Form Studio</p>
            <h1>{title}</h1>
            {subtitle ? <p className="lead">{subtitle}</p> : null}
          </div>
          <nav className="navPills" aria-label="Main">
            <Link className="navPills__item" to="/">
              Home
            </Link>
            <Link className="navPills__item navPills__item--primary" to="/admin/forms">
              Editor
            </Link>
          </nav>
        </header>
        <div className="container__body">{children}</div>
      </main>
    </div>
  );
}

export default Layout;
