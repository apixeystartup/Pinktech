import { useEffect, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function AuditPage() {
  const { showToast } = useToast();
  const { tenantContextId } = useAuth();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ pages: 1, total: 0 });

  const load = async (nextPage = page) => {
    try {
      const res = await api.get("/audit/logs", { params: { page: nextPage, limit: 20 } });
      setItems(res.data.items || []);
      setPage(res.data.page || nextPage);
      setMeta({ pages: res.data.pages || 1, total: res.data.total || 0 });
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/audit/logs", { params: { page: 1, limit: 20 } })
      .then((res) => {
        if (!active) return;
        setItems(res.data.items || []);
        setPage(res.data.page || 1);
        setMeta({ pages: res.data.pages || 1, total: res.data.total || 0 });
      })
      .catch((error) => showToast(getErrorMessage(error), "error"));
    return () => {
      active = false;
    };
  }, [showToast, tenantContextId]);

  return (
    <ModulePage title="Audit Logs" description="Paginated immutable audit log explorer.">
      <TenantScopeBanner context="Audit logs" />
      <div className="inline-form">
        <span>Total: {meta.total}</span>
        <button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => load(page - 1)}>
          Prev
        </button>
        <span>
          Page {page} / {meta.pages}
        </span>
        <button className="btn-secondary" type="button" disabled={page >= meta.pages} onClick={() => load(page + 1)}>
          Next
        </button>
      </div>
      <DataTable
        columns={[
          { key: "createdAt", label: "At" },
          { key: "action", label: "Action" },
          { key: "userId", label: "User" },
          { key: "ip", label: "IP" },
        ]}
        rows={items}
      />
    </ModulePage>
  );
}

export default AuditPage;
