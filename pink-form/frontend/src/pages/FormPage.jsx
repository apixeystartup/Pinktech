import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import DynamicFormRenderer from "../components/DynamicFormRenderer";
import { getModule } from "../api";

function FormPage() {
  const { moduleId } = useParams();
  const [moduleDoc, setModuleDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!moduleId) return;
    setLoading(true);
    getModule(moduleId)
      .then((result) => setModuleDoc(result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [moduleId]);

  if (loading) {
    return <Layout title="Loading..." subtitle="Fetching form definition." />;
  }

  if (error || !moduleDoc) {
    return <Layout title="Form Not Found" subtitle={error || "Invalid form link."} />;
  }

  return (
    <Layout title={moduleDoc.name} subtitle={moduleDoc.schema?.settings?.description || ""}>
      <DynamicFormRenderer moduleDoc={moduleDoc} />
    </Layout>
  );
}

export default FormPage;
