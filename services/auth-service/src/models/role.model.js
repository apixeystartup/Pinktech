const mongoose = require("mongoose");

const ORG_SCOPES = ["ALL_INDIA", "ZONE", "REGION", "AREA", "HQ"];

const roleSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["SYSTEM", "CUSTOM"], default: "CUSTOM" },
    permissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
    /** Designation aliases (uppercase) for matching imports / merges — org-chart automation. */
    aliases: { type: [String], default: [] },
    /** Inferred org level (numeric) and geographic scope; refined by org role engine. */
    auto: {
      level: { type: Number, default: 1 },
      scope: { type: String, enum: ORG_SCOPES, default: "HQ" },
      detectedAt: { type: Date, default: Date.now },
    },
    /** Manual corrections: override wins over auto (same as test MERN app). */
    override: {
      level: { type: Number, default: undefined },
      scope: { type: String, enum: ORG_SCOPES, default: undefined },
    },
    employeeCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

function effectiveLevel(role) {
  if (!role) return 1;
  const ov = role.override && role.override.level;
  if (ov !== undefined && ov !== null) return ov;
  const lv = role.auto && role.auto.level;
  return lv !== undefined && lv !== null ? lv : 1;
}

function effectiveScope(role) {
  if (!role) return "HQ";
  const ov = role.override && role.override.scope;
  if (ov) return ov;
  const sc = role.auto && role.auto.scope;
  return sc || "HQ";
}

module.exports = mongoose.model("Role", roleSchema);
module.exports.ORG_SCOPES = ORG_SCOPES;
module.exports.effectiveLevel = effectiveLevel;
module.exports.effectiveScope = effectiveScope;
