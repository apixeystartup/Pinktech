import { useCallback, useEffect, useMemo, useRef } from "react";
import ModulePage from "../components/common/ModulePage";
import TenantScopeBanner from "../components/common/TenantScopeBanner";
import useAuth from "../hooks/useAuth";

/**
 * `test/client` bundle in `public/org-embed` (npm run build:org-embed).
 * Same-origin iframe → parent can size iframe to full document height so the
 * main admin panel scrolls once (no nested iframe scrollbar).
 */
export default function OrgEmployeePage() {
  const iframeRef = useRef(null);
  const { tenantContextId, refreshSession } = useAuth();
  const src = useMemo(() => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    return `${base}org-embed/index.html?embed=org`;
  }, []);

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) return;
      const h = Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
        doc.documentElement.offsetHeight,
      );
      if (h > 0) {
        iframe.style.height = `${h}px`;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "pink:session-refresh") return;
      if (event.data?.source !== "org-embed") return;
      refreshSession();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refreshSession]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    let ro;
    const onLoad = () => {
      syncIframeHeight();
      try {
        const doc = iframe.contentDocument;
        if (!doc?.documentElement) return;
        ro = new ResizeObserver(() => syncIframeHeight());
        ro.observe(doc.documentElement);
        if (doc.body) ro.observe(doc.body);
      } catch {
        /* ignore */
      }
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      onLoad();
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [syncIframeHeight, src, tenantContextId]);

  return (
    <ModulePage
      title="ORG employee"
      description="Org directory, workbook import, and reporting tree (NUTRIMAX Org Explorer)."
    >
      <TenantScopeBanner context="ORG employee" />
      <div className="org-embed-module">
        <iframe
          ref={iframeRef}
          key={tenantContextId || "home"}
          title="ORG employee"
          src={src}
          className="org-embed-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
        />
      </div>
    </ModulePage>
  );
}
