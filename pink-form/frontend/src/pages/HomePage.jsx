import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getModules } from "../api";
import Layout from "../components/Layout";

function HomePage() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getModules()
      .then((result) => setModules(result.filter((item) => item.isPublished)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Your forms" subtitle="Open a published form to respond, or go to the editor to create and manage forms.">
      <section>
        <h2>Published Forms</h2>
        {loading ? <p className="hint">Loading forms...</p> : null}
        {error ? <p className="alert alert--error">{error}</p> : null}
        {!loading && !modules.length ? <p className="hint">No published forms yet. Create one from admin.</p> : null}
        <div className="cards">
          {modules.map((moduleDoc) => (
            <article key={moduleDoc._id} className="card">
              <h3>{moduleDoc.name}</h3>
              <p className="hint">Fields: {moduleDoc.schema?.fields?.length || 0}</p>
              <Link className="ioButton ioButton--sm" to={`/forms/${moduleDoc._id}`}>
                Open form
              </Link>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}

export default HomePage;
