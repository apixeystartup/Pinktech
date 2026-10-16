/** Strip ceremony secrets from any outbound representation. */
function stripTokens(plain) {
  for (const r of plain.recipients || []) {
    delete r.tokenHash;
    delete r.tokenEnc;
  }
  return plain;
}

/** Strip internal disk paths from documents; clients use /document routes. */
function stripDocumentPaths(plain) {
  for (const d of plain.documents || []) {
    delete d.filePath;
  }
  return plain;
}

function toDto(doc) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  return stripTokens(stripDocumentPaths(plain));
}

module.exports = { stripTokens, stripDocumentPaths, toDto };
