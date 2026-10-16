const multer = require("multer");

/**
 * Agreement-PDF upload for sign templates — memory storage (repo convention),
 * PDFs only, 10 MB cap. The route validates magic bytes and writes to disk.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== "application/pdf") {
    return cb(new Error("Only PDF agreements can be uploaded"));
  }
  return cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
