const mongoose = require("mongoose");

const formTemplateSchema = new mongoose.Schema(
  {
    // Templates belong to one tenant: every tenant designs its own, and the
    // tenant is always Party 1 of its templates.
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    // Raw body with {{doctor.*}} blanks (typed via the blank dropdown while
    // designing). Resolved per doctor at assign time.
    bodyText: { type: String, default: "" },
    // Which organization fields appear in the Party 1 block (subset of the
    // shared TEMPLATE_PARTY_KEYS).
    partyFields: { type: [String], default: [] },
    // Values the author filled for custom blanks ({{RENT_AMOUNT}} etc.) via
    // "Detect required fields". Array of {tag, value} — tags may contain
    // dots, which Mongo forbids as object keys.
    fieldValues: {
      type: [{
        _id: false,
        tag: { type: String, required: true, trim: true, maxlength: 120 },
        value: { type: String, default: "", maxlength: 4000 },
      }],
      default: [],
    },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

formTemplateSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
