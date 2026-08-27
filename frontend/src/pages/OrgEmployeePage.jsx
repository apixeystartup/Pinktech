import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import TenantScopeBanner from "../components/common/TenantScopeBanner";
import useAuth from "../hooks/useAuth";
import api from "../lib/api";

export default function OrgEmployeePage() {
  const { permissionCodes = [] } = useAuth();
  const hasEmployeeView = permissionCodes.includes("*") || permissionCodes.includes("employee.view");

  const availableTabs = [];
  if (hasEmployeeView) availableTabs.push({ key: "tree", label: "Org Tree" });

  const [activeTab, setActiveTab] = useState(() => {
    if (availableTabs.length > 0) return availableTabs[0].key;
    return "";
  });

  if (availableTabs.length === 0) {
    return (
      <ModulePage title="ORG employee" description="You don't have access to this section.">
        <TenantScopeBanner context="ORG employee" />
        <p style={{ padding: 16, color: "#666" }}>You don't have the required permissions to view this page.</p>
      </ModulePage>
    );
  }

  return (
    <ModulePage title="ORG employee" description="Org directory, assignments, and role management.">
      <TenantScopeBanner context="ORG employee" />
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e2e8f0", marginBottom: 16 }}>
        {availableTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              borderBottom: activeTab === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
              marginBottom: -2,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#3b82f6" : "#64748b",
              fontSize: 14,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "tree" && <OrgTreeTab />}
    </ModulePage>
  );
}

function OrgTreeTab() {
  const iframeRef = useRef(null);
  const { tenantContextId, refreshSession } = useAuth();
  const src = useMemo(() => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    return `${base}org-embed/index.html?embed=org`;
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const inject = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        if (doc.getElementById("pink-rename-script")) return;
        const script = doc.createElement("script");
        script.id = "pink-rename-script";
        script.textContent = `
          (function() {
            function rename() {
              document.querySelectorAll('button').forEach(function(btn) {
                var t = btn.textContent.trim();
                if (t === 'Reload' || t === 'Reloading…') {
                  btn.textContent = 'Rollback';
                  btn.title = 'Restore previous workbook data';
                }
              });
            }
            rename();
            new MutationObserver(rename).observe(document.body, {childList:true, subtree:true, characterData:true});

            function linkEmpIds() {
              document.querySelectorAll('.value, .node-meta, .dir-meta, .member-meta, .removed-meta, .picker-row-meta').forEach(function(el) {
                if (el.dataset.empLinked) return;
                var text = el.textContent || '';
                var match = text.match(/\\u00A0\\s*(.+)$/);
                if (!match) return;
                var empId = match[1].trim();
                if (!empId || el.querySelector('a[data-emp-link]')) return;
                el.dataset.empLinked = '1';
                el.style.cursor = 'pointer';
                el.title = 'Click to view ' + empId + ' in org tree';
                el.addEventListener('click', function(e) {
                  e.stopPropagation();
                  var searchInput = doc.querySelector('input[placeholder*="Search"]');
                  if (searchInput) {
                    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(searchInput, empId);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                });
              });
            }
            linkEmpIds();
            new MutationObserver(linkEmpIds).observe(doc.body, {childList:true, subtree:true, characterData:true});
          })();
        `;
        doc.head.appendChild(script);
      } catch (error) {
        console.error("Unable to enhance the organization explorer iframe", error);
      }
    };

    iframe.addEventListener("load", inject);
    if (iframe.contentDocument?.readyState === "complete") inject();
    return () => iframe.removeEventListener("load", inject);
  }, [src, tenantContextId]);

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
      if (h > 0) iframe.style.height = `${h}px`;
    } catch { /* ignore */ }
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
      } catch { /* ignore */ }
    };
    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") onLoad();
    return () => { iframe.removeEventListener("load", onLoad); ro?.disconnect(); };
  }, [syncIframeHeight, src, tenantContextId]);

  return (
    <div className="org-embed-module">
      <iframe
        ref={iframeRef}
        key={tenantContextId || "home"}
        title="Org Tree"
        src={src}
        className="org-embed-iframe"
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
      />
    </div>
  );
}
