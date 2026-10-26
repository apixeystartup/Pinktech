/* CSV export for the dashboard's "Download reports" button.
 *
 * Kept out of DashboardBlocks.jsx on purpose: react-refresh requires files
 * that export components to export only components (fast refresh). The data
 * is unchanged from the old "Download Reports" card — same rows, same file.
 */

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
}

export function downloadReport(report) {
  if (!report?.rows?.length) return;
  const blob = new Blob([toCsv(report.rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
