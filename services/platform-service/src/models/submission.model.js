const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({}, { timestamps: true, strict: false });

module.exports = mongoose.model("Submission", submissionSchema);
