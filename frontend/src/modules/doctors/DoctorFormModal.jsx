import { useRef, useState } from "react";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import { useToast } from "../../components/common/ToastProvider";

const EMPTY_VALUES = {
  name: "",
  specialization: "",
  qualification: "",
  yearsOfExperience: "",
  gender: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  medicalRegistrationNumber: "",
  pan: "",
  aadhaar: "",
  clinicHospitalName: "",
  address: "",
  status: "ACTIVE",
};

const PHONE_RE = /^[0-9+\-\s()]{7,15}$/;
const PAN_RE = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/;
const AADHAAR_RE = /^[0-9]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, required, wide, error, children }) {
  return (
    <label className={`stacked-label${wide ? " doc-form-full" : ""}`}>
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
      {error ? <span className="doc-form-error">{error}</span> : null}
    </label>
  );
}

function validate(values, { forDraft }) {
  const errors = {};
  const requiredButMissing = !forDraft;

  if (!values.name.trim()) errors.name = "Full name is required.";
  else if (values.name.trim().length < 2) errors.name = "Enter at least 2 characters.";

  if (requiredButMissing && !values.specialization.trim()) {
    errors.specialization = "Specialization is required.";
  }
  if (requiredButMissing && !values.gender) errors.gender = "Gender is required.";

  if (requiredButMissing && !values.phone.trim()) {
    errors.phone = "Phone number is required.";
  } else if (values.phone.trim() && !PHONE_RE.test(values.phone.trim())) {
    errors.phone = "Enter a valid phone number (7–15 digits).";
  }

  if (requiredButMissing && !values.email.trim()) {
    errors.email = "Email is required.";
  } else if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (values.yearsOfExperience !== "") {
    const n = Number(values.yearsOfExperience);
    if (!Number.isInteger(n) || n < 0 || n > 70) {
      errors.yearsOfExperience = "Years of experience must be a whole number between 0 and 70.";
    }
  }

  if (values.dateOfBirth) {
    const d = new Date(values.dateOfBirth);
    if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) {
      errors.dateOfBirth = "Date of birth cannot be in the future.";
    }
  }

  if (values.pan.trim() && !PAN_RE.test(values.pan.trim())) {
    errors.pan = "Enter a valid PAN (e.g. ABCDE1234F).";
  }

  if (values.aadhaar.trim() && !AADHAAR_RE.test(values.aadhaar.trim())) {
    errors.aadhaar = "Aadhaar must be exactly 12 digits.";
  }

  return errors;
}

function buildPayload(values, draft) {
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const str = (v) => (v && String(v).trim() ? String(v).trim() : null);

  return {
    name: values.name.trim(),
    specialization: str(values.specialization),
    qualification: str(values.qualification),
    yearsOfExperience: num(values.yearsOfExperience),
    gender: values.gender || null,
    dateOfBirth: values.dateOfBirth || null,
    phone: str(values.phone),
    email: values.email ? values.email.trim().toLowerCase() : null,
    medicalRegistrationNumber: str(values.medicalRegistrationNumber),
    pan: values.pan.trim() ? values.pan.trim().toUpperCase() : null,
    aadhaar: str(values.aadhaar),
    clinicHospitalName: str(values.clinicHospitalName),
    address: str(values.address),
    ...(values.status ? { status: values.status } : {}),
    draft,
  };
}

function toValues(doctor) {
  if (!doctor) return EMPTY_VALUES;
  return {
    name: doctor.name || "",
    specialization: doctor.specialization || "",
    qualification: doctor.qualification || "",
    yearsOfExperience: doctor.yearsOfExperience ?? "",
    gender: doctor.gender || "",
    dateOfBirth: doctor.dateOfBirth ? String(doctor.dateOfBirth).slice(0, 10) : "",
    phone: doctor.phone || "",
    email: doctor.email || "",
    medicalRegistrationNumber: doctor.medicalRegistrationNumber || "",
    pan: doctor.pan || "",
    aadhaar: doctor.aadhaar || "",
    clinicHospitalName: doctor.clinicHospitalName || "",
    address: doctor.address || "",
    status: doctor.accountStatus || "ACTIVE",
  };
}

/**
 * Add / Edit doctor form. "Save as Draft" keeps the record in draft state and
 * only enforces the minimal rules; "Create Doctor" / "Save Changes" enforces the
 * full profile validation.
 */
function DoctorFormModal({ doctor, onClose, onSaved }) {
  const { showToast } = useToast();
  const isEdit = Boolean(doctor);
  const [values, setValues] = useState(() => toValues(doctor));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(null);
  const [scanNotes, setScanNotes] = useState({ pan: "", aadhaar: "" });
  const panFileRef = useRef(null);
  const aadhaarFileRef = useRef(null);

  const set = (key) => (event) => {
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  // Shrink photos so the upload stays well under the API JSON body limit.
  const downscaleImage = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Could not process this image"))),
          "image/jpeg",
          0.85,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read this image"));
      };
      img.src = url;
    });

  // Upload a PAN / Aadhaar scan and prefill the form from what is found.
  // The card's own number always updates; name / DOB / gender only fill empty
  // fields so typed values are never clobbered. Everything stays editable.
  const scanDoc = async (docType, file) => {
    if (!file || scanning) return;
    setScanning(docType);
    setScanNotes((prev) => ({ ...prev, [docType]: "" }));
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
      let blob = file;
      let mimeType = file.type || "";
      if (!isPdf) {
        try {
          blob = await downscaleImage(file);
          mimeType = "image/jpeg";
        } catch {
          blob = file;
          if (!mimeType.startsWith("image/")) mimeType = "image/jpeg";
        }
      } else {
        mimeType = "application/pdf";
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read this file"));
        reader.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) throw new Error("Could not read this file");
      const { data } = await api.post("/doctors/id-extract", {
        fileName: file.name || "",
        mimeType,
        dataBase64: base64,
        docType,
      });
      const filled = [];
      const next = { ...values };
      if (docType === "pan" && data.pan) {
        next.pan = data.pan;
        filled.push(`PAN ${data.pan}`);
      }
      if (docType === "aadhaar" && data.aadhaar) {
        next.aadhaar = String(data.aadhaar).replace(/\D/g, "").slice(0, 12);
        filled.push("Aadhaar number");
      }
      if (data.name && !next.name.trim()) {
        next.name = data.name;
        filled.push(`name "${data.name}"`);
      }
      if (data.dob && !next.dateOfBirth) {
        next.dateOfBirth = data.dob;
        filled.push("date of birth");
      }
      if (data.gender && !next.gender && ["Male", "Female", "Other"].includes(data.gender)) {
        next.gender = data.gender;
        filled.push(`gender ${data.gender}`);
      }
      setValues(next);
      setErrors((prev) => {
        const copy = { ...prev };
        ["pan", "aadhaar", "name", "dateOfBirth", "gender"].forEach((key) => {
          if (next[key] !== values[key]) delete copy[key];
        });
        return copy;
      });
      const confidence = data.confidence != null ? ` (read confidence ${data.confidence}%)` : "";
      setScanNotes((prev) => ({
        ...prev,
        [docType]: filled.length
          ? `Auto-filled: ${filled.join(", ")}${confidence}. Check the values before saving.`
          : "No usable details found in this file — fill the fields manually.",
      }));
    } catch (error) {
      setScanNotes((prev) => ({ ...prev, [docType]: getErrorMessage(error) }));
    } finally {
      setScanning(null);
    }
  };

  const submit = async (draft) => {
    setBanner("");
    const found = validate(values, { forDraft: draft });
    const nextErrors = Object.fromEntries(Object.entries(found).filter(([, v]) => Boolean(v)));
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const payload = buildPayload(values, draft);
      const res = isEdit
        ? await api.patch(`/doctors/${doctor._id}`, payload)
        : await api.post("/doctors", payload);
      showToast(
        draft ? "Saved as draft." : isEdit ? "Doctor updated." : "Doctor created.",
        "success",
      );
      onSaved(res.data);
    } catch (error) {
      setBanner(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleBackdrop = (event) => {
    if (event.target === event.currentTarget && !saving) onClose();
  };

  const showDraftButton = !isEdit || Boolean(doctor?.draft);
  const primaryLabel = isEdit && !doctor?.draft ? "Save Changes" : "Create Doctor";

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop} role="presentation">
      <div className="modal-card doc-modal-card" role="dialog" aria-modal="true">
        <h3>{isEdit ? "Edit Doctor" : "Add Doctor"}</h3>
        <p className="doc-hint">
          Fields marked * are required to create a doctor. &quot;Save as Draft&quot; keeps an incomplete
          profile so you can finish it later.
        </p>

        {banner ? <div className="doc-form-banner">{banner}</div> : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            // Primary action always finalises the record (Create Doctor /
            // Save Changes); "Save as Draft" is the secondary button below.
            submit(false);
          }}
        >
          <div className="doc-form-grid">
            <Field label="Full Name" required error={errors.name}>
              <input
                type="text"
                value={values.name}
                onChange={set("name")}
                placeholder="Dr. first and last name"
                autoFocus
              />
            </Field>

            <Field label="Specialization" required={!isEdit || Boolean(doctor?.draft)} error={errors.specialization}>
              <input
                type="text"
                value={values.specialization}
                onChange={set("specialization")}
                placeholder="e.g. Cardiology"
              />
            </Field>

            <Field label="Years of Experience" error={errors.yearsOfExperience}>
              <input
                type="number"
                min="0"
                max="70"
                value={values.yearsOfExperience}
                onChange={set("yearsOfExperience")}
                placeholder="e.g. 8"
              />
            </Field>

            <Field label="Gender" required={!isEdit || Boolean(doctor?.draft)} error={errors.gender}>
              <select value={values.gender} onChange={set("gender")}>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </Field>

            <Field label="Date of Birth" error={errors.dateOfBirth}>
              <input type="date" value={values.dateOfBirth} onChange={set("dateOfBirth")} />
            </Field>

            <Field label="Phone Number" required={!isEdit || Boolean(doctor?.draft)} error={errors.phone}>
              <input
                type="tel"
                value={values.phone}
                onChange={set("phone")}
                placeholder="+91 98765 43210"
              />
            </Field>

            <Field label="Email" required={!isEdit || Boolean(doctor?.draft)} error={errors.email}>
              <input type="email" value={values.email} onChange={set("email")} placeholder="doctor@clinic.com" />
            </Field>

            <Field label="Medical Registration Number" error={errors.medicalRegistrationNumber}>
              <input
                type="text"
                value={values.medicalRegistrationNumber}
                onChange={set("medicalRegistrationNumber")}
                placeholder="e.g. TNMC/12345"
              />
            </Field>

            <Field label="Qualification" error={errors.qualification}>
              <input
                type="text"
                value={values.qualification}
                onChange={set("qualification")}
                placeholder="e.g. MBBS, MD"
                maxLength={160}
              />
            </Field>

            <Field label="PAN" error={errors.pan}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  value={values.pan}
                  onChange={set("pan")}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ whiteSpace: "nowrap" }}
                  disabled={scanning !== null}
                  onClick={() => panFileRef.current?.click()}
                >
                  {scanning === "pan" ? "Scanning…" : "Upload & scan"}
                </button>
                <input
                  ref={panFileRef}
                  type="file"
                  hidden
                  accept="image/*,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) scanDoc("pan", file);
                  }}
                />
              </div>
              {scanNotes.pan ? <span className="doc-form-note">{scanNotes.pan}</span> : null}
            </Field>

            <Field label="Aadhaar" error={errors.aadhaar}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.aadhaar}
                  onChange={set("aadhaar")}
                  placeholder="12 digit number"
                  maxLength={12}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ whiteSpace: "nowrap" }}
                  disabled={scanning !== null}
                  onClick={() => aadhaarFileRef.current?.click()}
                >
                  {scanning === "aadhaar" ? "Scanning…" : "Upload & scan"}
                </button>
                <input
                  ref={aadhaarFileRef}
                  type="file"
                  hidden
                  accept="image/*,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) scanDoc("aadhaar", file);
                  }}
                />
              </div>
              {scanNotes.aadhaar ? <span className="doc-form-note">{scanNotes.aadhaar}</span> : null}
            </Field>

            <Field label="Clinic / Hospital Name" error={errors.clinicHospitalName}>
              <input
                type="text"
                value={values.clinicHospitalName}
                onChange={set("clinicHospitalName")}
                placeholder="e.g. City Care Hospital"
              />
            </Field>

            {isEdit ? (
              <Field label="Status" error={errors.status}>
                <select value={values.status} onChange={set("status")}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </Field>
            ) : null}

            <Field label="Address" wide error={errors.address}>
              <textarea
                rows={3}
                value={values.address}
                onChange={set("address")}
                placeholder="Clinic / correspondence address"
              />
            </Field>
          </div>

          <div className="doc-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {showDraftButton ? (
              <button type="button" className="btn-secondary" onClick={() => submit(true)} disabled={saving}>
                Save as Draft
              </button>
            ) : null}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : primaryLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DoctorFormModal;
