import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import useAuth from "../../hooks/useAuth";
import SignaturePad from "../schema-forms/SignaturePad";

const EMPTY_ORG = {
  name: "",
  code: "",
  email: "",
  phone: "",
  address: "",
  registrationNumber: "",
  signature: "",
  stamp: "",
  logo: "",
};

function tenantToOrg(tenant) {
  return {
    name: tenant?.name || "",
    code: tenant?.code || "",
    email: tenant?.email || "",
    phone: tenant?.phone || "",
    address: tenant?.address || "",
    registrationNumber: tenant?.registrationNumber || tenant?.registration_number || "",
    signature: tenant?.signature || "",
    stamp: tenant?.stamp || "",
    logo: tenant?.logo || "",
  };
}

const MAX_SIG_CHARS = 1200000;

function fileToSignatureDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load that image. Try a PNG or JPG."));
      img.onload = () => {
        const maxW = 900;
        const width = Math.min(img.width || maxW, maxW);
        const height = Math.max(1, Math.round((img.height || 1) * (width / (img.width || 1))));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length > MAX_SIG_CHARS) {
          reject(new Error("That image is too large even after resizing — use a smaller image."));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export default function OrganizationDataEditor({ open, tenant, onClose, onSaved }) {
  const { tenantContextId, updateCurrentTenant } = useAuth();
  const queryClient = useQueryClient();
  const [org, setOrg] = useState(tenantToOrg(tenant || EMPTY_ORG));
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [sigMode, setSigMode] = useState("upload");

  if (!open) return null;

  const onImageFile = (field) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (field === "logo" && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setNote("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    if (field === "logo" && file.size > 850 * 1024) {
      setNote("Logo must be 850 KB or smaller.");
      return;
    }
    try {
      const dataUrl = await fileToSignatureDataUrl(file);
      setOrg((previous) => ({ ...previous, [field]: dataUrl }));
      setNote("");
    } catch (error) {
      setNote(error?.message || "Failed to read the image.");
    }
  };

  const saveOrg = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNote("");
    try {
      const res = await api.patch("/tenants/current", {
        email: String(org.email || "").trim(),
        phone: String(org.phone || "").trim(),
        address: String(org.address || "").trim(),
        registrationNumber: String(org.registrationNumber || "").trim(),
        signature: org.signature || "",
        stamp: org.stamp || "",
        logo: org.logo || "",
      });
      const updatedTenant = { ...(tenant || {}), ...res.data };
      queryClient.setQueryData(["tenant-current", String(tenantContextId || "")], (previous) => ({
        ...(previous || {}),
        ...updatedTenant,
      }));
      updateCurrentTenant(updatedTenant);
      onSaved?.(updatedTenant);
      onClose();
    } catch (error) {
      setNote(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="form-editor-backdrop" onClick={onClose}>
      <div className="form-editor-modal schema-forms" onClick={(event) => event.stopPropagation()}>
        <div className="builderCard">
          <div className="adminRow">
            <h2>Edit organization data</h2>
            <button type="button" className="ghostBtn" onClick={onClose}>Close</button>
          </div>
          <form onSubmit={saveOrg}>
            <div className="grid">
              <div className="field">
                <label>Organization name</label>
                <input value={org.name} disabled />
              </div>
              <div className="field">
                <label>Organization code</label>
                <input value={org.code} disabled />
              </div>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={org.email}
                  onChange={(event) => setOrg((previous) => ({ ...previous, email: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Phone</label>
                <input
                  value={org.phone}
                  onChange={(event) => setOrg((previous) => ({ ...previous, phone: event.target.value }))}
                />
              </div>
            </div>
            <label>Address</label>
            <textarea
              rows={2}
              value={org.address}
              onChange={(event) => setOrg((previous) => ({ ...previous, address: event.target.value }))}
            />
            <label>Registration no.</label>
            <input
              value={org.registrationNumber}
              onChange={(event) => setOrg((previous) => ({ ...previous, registrationNumber: event.target.value }))}
            />
            <div className="sigCapture">
              <label>Organization logo</label>
              <div className="adminRow" style={{ gap: 8 }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageFile("logo")} />
                {org.logo ? (
                  <button
                    type="button"
                    className="smallBtn"
                    onClick={() => setOrg((previous) => ({ ...previous, logo: "" }))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {org.logo ? (
                <div className="sigCapture__preview">
                  <img src={org.logo} alt="Organization logo preview" />
                </div>
              ) : (
                <p className="doc-form-note" style={{ margin: "4px 0 0" }}>
                  No organization logo uploaded.
                </p>
              )}
            </div>
            <div className="sigCapture">
              <div className="adminRow" style={{ gap: 8 }}>
                <label style={{ margin: 0 }}>Party 1 signature — used in templates ({`{{signature.tenant}}`})</label>
                <div className="segmented-toggle" role="tablist" aria-label="Signature input mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sigMode === "upload"}
                    className={`segmented-toggle-btn${sigMode === "upload" ? " active" : ""}`}
                    onClick={() => setSigMode("upload")}
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sigMode === "draw"}
                    className={`segmented-toggle-btn${sigMode === "draw" ? " active" : ""}`}
                    onClick={() => setSigMode("draw")}
                  >
                    Draw
                  </button>
                </div>
              </div>
              {sigMode === "upload" ? (
                <div className="adminRow" style={{ gap: 8 }}>
                  <input type="file" accept="image/*" onChange={onImageFile("signature")} />
                  {org.signature ? (
                    <button
                      type="button"
                      className="smallBtn"
                      onClick={() => setOrg((previous) => ({ ...previous, signature: "" }))}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : (
                <SignaturePad
                  width={420}
                  height={140}
                  onSign={(dataUrl) => setOrg((previous) => ({ ...previous, signature: dataUrl }))}
                />
              )}
              {org.signature ? (
                <div className="sigCapture__preview">
                  <img src={org.signature} alt="Saved Party 1 signature" />
                </div>
              ) : (
                <p className="doc-form-note" style={{ margin: "4px 0 0" }}>
                  No signature saved yet — templates show a blank signature line until you add one.
                </p>
              )}
            </div>
            <div className="sigCapture">
              <div className="adminRow" style={{ gap: 8 }}>
                <label style={{ margin: 0 }}>Party 1 stamp / seal - used in sign templates (stamp field)</label>
              </div>
              <div className="adminRow" style={{ gap: 8 }}>
                <input type="file" accept="image/*" onChange={onImageFile("stamp")} />
                {org.stamp ? (
                  <button
                    type="button"
                    className="smallBtn"
                    onClick={() => setOrg((previous) => ({ ...previous, stamp: "" }))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {org.stamp ? (
                <div className="sigCapture__preview">
                  <img src={org.stamp} alt="Saved Party 1 stamp" />
                </div>
              ) : (
                <p className="doc-form-note" style={{ margin: "4px 0 0" }}>
                  No stamp uploaded yet — templates show a blank stamp area until you add one.
                </p>
              )}
            </div>
            <div className="adminRow" style={{ marginTop: 10 }}>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save organization data"}
              </button>
              {note ? <span className="doc-form-note" style={{ margin: 0 }}>{note}</span> : null}
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
