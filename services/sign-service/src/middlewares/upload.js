const multer = require("multer");

/**
 * Agreement-PDF upload for sign templates — memory storage (repo convention),
 * PDF/Word only, 10 MB cap. The route validates magic bytes and converts
 * Word documents to PDF before storing them on disk.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const kind = String(file.mimetype || "").toLowerCase();
  if (
    [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/zip",
    ].includes(kind)
  ) {
    return cb(null, true);
  }
  return cb(new Error("Please upload a PDF or Word (.docx) agreement."));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
