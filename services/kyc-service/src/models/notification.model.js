const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    subject: { type: String, default: "" },
    channel: { type: String, enum: ["EMAIL", "SMS", "WHATSAPP", "IN_APP"], required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING", index: true },
    eventType: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);