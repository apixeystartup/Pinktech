function generatePdfUrl({ tenantId, refId }) {
  return `https://mock-storage.local/${tenantId}/documents/${refId}-${Date.now()}.pdf`;
}

module.exports = {
  generatePdfUrl,
};
