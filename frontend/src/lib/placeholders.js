// Mirrors shared/src/placeholders.js (backend resolves these per dispatch).
// Tags can be placed anywhere in the text — start, middle or end.
export const PLACEHOLDER_TAGS = [
  { key: "doctor.name", label: "Doctor name" },
  { key: "doctor.full_name", label: "Doctor full name" },
  { key: "doctor.email", label: "Doctor email" },
  { key: "doctor.phone", label: "Doctor phone" },
  { key: "doctor.specialization", label: "Specialization" },
  { key: "doctor.qualification", label: "Qualification" },
  { key: "doctor.code", label: "Doctor ID" },
  { key: "doctor.registration_number", label: "Registration number" },
  { key: "doctor.clinic", label: "Clinic / hospital" },
  { key: "doctor.hospital_name", label: "Hospital name" },
  { key: "doctor.address", label: "Address" },
  { key: "tenant.name", label: "Organization name" },
  { key: "tenant.code", label: "Organization code" },
  { key: "tenant.email", label: "Organization email" },
  { key: "tenant.phone", label: "Organization phone" },
  { key: "tenant.address", label: "Organization address" },
  { key: "tenant.registration_number", label: "Organization registration no." },
  { key: "date", label: "Today's date" },
];

const SIGNATURE_TAG_RE = /^signature\.[a-z]+$/;

export function placeholderTag(key) {
  return `{{${key}}}`;
}

export function placeholderContextClient({ doctor = {}, tenant = null, tenantName = "" } = {}) {
  const doctorName = doctor?.name || "";
  const clinic = doctor?.clinicHospitalName || "";
  const tenantObj = tenant && typeof tenant === "object" ? tenant : {};
  const resolvedTenantName = tenantObj.name || (typeof tenant === "string" ? tenant : tenantName) || "";
  return {
    "doctor.name": doctorName,
    "doctor.full_name": doctorName,
    "doctor.email": doctor?.email || "",
    "doctor.phone": doctor?.phone || "",
    "doctor.specialization": doctor?.specialization || "",
    "doctor.qualification": doctor?.qualification || "",
    "doctor.code": doctor?.doctorCode || "",
    "doctor.registration_number": doctor?.medicalRegistrationNumber || "",
    "doctor.clinic": clinic,
    "doctor.hospital_name": clinic,
    "doctor.address": doctor?.address || "",
    "tenant.name": resolvedTenantName || "",
    "tenant.code": tenantObj.code || "",
    "tenant.email": tenantObj.email || "",
    "tenant.phone": tenantObj.phone || "",
    "tenant.address": tenantObj.address || "",
    "tenant.registration_number": tenantObj.registrationNumber || tenantObj.registration_number || "",
    date: new Date().toISOString().slice(0, 10),
  };
}

export function resolvePlaceholdersClient(text, context) {
  if (typeof text !== "string" || !text.includes("{{")) return text;
  const map = context && typeof context === "object" ? context : {};
  return text.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (match, rawKey) => {
    const key = String(rawKey).toLowerCase();
    const value = map[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/** Missing-data / unsupported-tag report for previewing a template. */
export function analyzePlaceholdersClient(texts, context) {
  const map = context && typeof context === "object" ? context : {};
  const labels = {};
  for (const def of PLACEHOLDER_TAGS) labels[def.key] = def.label;
  const missing = [];
  const unknown = [];
  const seenMissing = new Set();
  const seenUnknown = new Set();
  const list = Array.isArray(texts) ? texts : [texts];
  for (const text of list) {
    if (typeof text !== "string") continue;
    const re = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = String(m[1]).toLowerCase();
      if (SIGNATURE_TAG_RE.test(key)) continue;
      if (labels[key]) {
        const value = map[key];
        const empty = value === undefined || value === null || String(value).trim() === "";
        if (empty && key !== "tenant.name" && key !== "date" && !seenMissing.has(key)) {
          seenMissing.add(key);
          missing.push({ tag: `{{${key}}}`, label: labels[key] });
        }
      } else if (!seenUnknown.has(key)) {
        seenUnknown.add(key);
        unknown.push({ tag: `{{${key}}}` });
      }
    }
  }
  return { missing, unknown };
}
