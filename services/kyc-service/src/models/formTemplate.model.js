const mongoose = require("mongoose");

// Read-only view of the `formtemplates` collection written by the forms
// service (model name and collection must match there). Used at assign time to
// compose a form's agreement: Party 1 (this tenant) + doctor blanks resolved
// for the selected doctor.
const formTemplateSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    bodyText: { type: String, default: "" },
    partyFields: { type: [String], default: [] },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "formtemplates" }
);

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
