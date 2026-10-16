const Joi = require("joi");

// Same raster-data-URL rule the tenant signature uses (no remote/SVG URLs).
const SAFE_DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/;

const recipientSchema = Joi.object({
  order: Joi.number().integer().min(0).max(999), // absent → assigned by index on create
  name: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(320).required(),
  role: Joi.string().valid("SIGNER", "APPROVER", "CC").default("SIGNER"),
  auth: Joi.string().valid("EMAIL", "OTP").default("EMAIL"),
});

const fieldSchema = Joi.object({
  recipientId: Joi.string().hex().length(24).required(),
  documentId: Joi.string().hex().length(24).allow(null).default(null),
  tag: Joi.string().trim().lowercase().max(120).allow("").default(""),
  type: Joi.string().valid("SIGNATURE", "INITIALS", "IMAGE", "TEXT", "DATE", "CHECKBOX").default("SIGNATURE"),
  label: Joi.string().trim().max(200).allow("").default(""),
  page: Joi.number().integer().min(0).max(9999).default(0),
  x: Joi.number().min(0).max(100).default(0),
  y: Joi.number().min(0).max(100).default(0),
  w: Joi.number().min(0).max(100).default(25),
  h: Joi.number().min(0).max(100).default(6),
  required: Joi.boolean().default(true),
});

const documentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(300).required(),
  sourceUrl: Joi.string().trim().max(2000).allow("").default(""),
  pages: Joi.number().integer().min(0).default(0),
});

const createEnvelopeSchema = Joi.object({
  title: Joi.string().trim().min(2).max(300).required(),
  signingOrder: Joi.string().valid("SEQUENTIAL", "PARALLEL").default("SEQUENTIAL"),
  expiresAt: Joi.date().iso().greater("now").allow(null).default(null),
  recipients: Joi.array().items(recipientSchema).min(1).max(20).required(),
  documents: Joi.array().items(documentSchema).max(20).default([]),
  // Fields are placed via POST /:id/fields — recipient subdocument ids only
  // exist after the envelope is created, so they cannot be bound inline.
});

const addRecipientsSchema = Joi.object({
  recipients: Joi.array().items(recipientSchema).min(1).max(20).required(),
});

const setFieldsSchema = Joi.object({
  // Full replace keeps designer edits idempotent (drag → drop → save).
  fields: Joi.array().items(fieldSchema).max(500).required(),
});

const sendSchema = Joi.object({
  expiresAt: Joi.date().iso().greater("now").allow(null).default(null),
});

const voidSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(1000).required(),
});

const signSchema = Joi.object({
  // The ESIGN-style consent checkbox — must be explicitly true.
  consentAccepted: Joi.boolean().valid(true).required(),
  signature: Joi.object({
    mode: Joi.string().valid("DRAW", "UPLOAD").required(),
    dataUrl: Joi.string().max(1300000).allow("").default(""),
    // Normalized stroke points [[x, y], …] from the draw pad.
    points: Joi.array()
      .items(Joi.array().items(Joi.number()).min(2).max(2).length(2))
      .max(4000)
      .default([]),
  }).required(),
  values: Joi.array()
    .items(
      Joi.object({
        fieldId: Joi.string().hex().length(24).required(),
        value: Joi.string().max(4000).allow("").default(""),
      }),
    )
    .max(200)
    .default([]),
});

const declineSchema = Joi.object({
  consentAccepted: Joi.boolean().valid(true).required(),
  reason: Joi.string().trim().min(1).max(1000).required(),
});

module.exports = {
  SAFE_DATA_URL_RE,
  createEnvelopeSchema,
  addRecipientsSchema,
  setFieldsSchema,
  sendSchema,
  voidSchema,
  signSchema,
  declineSchema,
};
