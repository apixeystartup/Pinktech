const Joi = require("joi");

/**
 * Field tags reuse the shared placeholder system: tenant.* = Party 1 (org
 * data), doctor.* = Party 2 (selected doctor), signature/stamp/date resolve at
 * envelope creation, tenant.custom is a fixed Party 1 text value, and custom.*
 * fields are free-text for the signer.
 */
const FIELD_TAG_RE =
  /^(tenant|doctor)\.(name|code|email|phone|address|registration_number|custom)$|^signature\.(tenant|doctor)$|^stamp$|^date$|^custom\.[a-z0-9_]{1,60}$/;

const FIELD_TYPES = ["SIGNATURE", "INITIALS", "IMAGE", "TEXT", "DATE", "CHECKBOX"];

const templateFieldSchema = Joi.object({
  tag: Joi.string().trim().lowercase().pattern(FIELD_TAG_RE).max(120).required(),
  type: Joi.string().valid(...FIELD_TYPES),
  label: Joi.string().trim().max(200).allow("").default(""),
  value: Joi.when("tag", {
    is: "tenant.custom",
    then: Joi.string().trim().min(1).max(4000).required(),
    otherwise: Joi.string().max(4000).allow("").default(""),
  }),
  page: Joi.number().integer().min(0).max(9999).default(0),
  x: Joi.number().min(0).max(100).default(0),
  y: Joi.number().min(0).max(100).default(0),
  w: Joi.number().min(0).max(100).default(25),
  h: Joi.number().min(0).max(100).default(6),
  required: Joi.boolean().default(true),
});

const createTemplateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  fields: Joi.array().items(templateFieldSchema).max(500).default([]),
});

const updateTemplateSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160),
  // Full replace keeps designer saves idempotent (drag → drop → save).
  fields: Joi.array().items(templateFieldSchema).max(500),
}).min(1);

/** Assign-with-doctor-selection: instantiate + send an envelope from a template. */
const envelopeFromTemplateSchema = Joi.object({
  doctorId: Joi.string().hex().length(24).required(),
  title: Joi.string().trim().min(2).max(300).optional(),
  signingOrder: Joi.string().valid("SEQUENTIAL", "PARALLEL").default("SEQUENTIAL"),
  expiresAt: Joi.date().iso().greater("now").allow(null).default(null),
});

/**
 * The interaction type implied by a tag. signature.tenant/stamp render as
 * pre-filled images; signature.doctor is drawn in the ceremony.
 */
function expectedFieldType(tag) {
  const t = String(tag || "").toLowerCase();
  if (t === "signature.tenant" || t === "stamp") return "IMAGE";
  if (t === "signature.doctor") return "SIGNATURE";
  if (t === "date") return "DATE";
  return null;
}

module.exports = {
  FIELD_TAG_RE,
  FIELD_TYPES,
  createTemplateSchema,
  updateTemplateSchema,
  envelopeFromTemplateSchema,
  expectedFieldType,
};
