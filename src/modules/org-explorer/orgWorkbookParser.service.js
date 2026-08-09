/**
 * Org Explorer workbook reader — same column contract as test/server xlsx-parser.ts (ExcelJS).
 */

const ExcelJS = require("exceljs");
const { clean } = require("../../utils/orgNorm");

const HEADER_MAP = {
  "S.NO.": "sno",
  "S NO": "sno",
  SNO: "sno",
  "EMP ID": "empId",
  "NAME OF THE EMPLOYEES": "name",
  "EMPLOYEE NAME": "name",
  DESIGNATION: "designation",
  HQ: "hq",
  REGION: "region",
  STATE: "state",
  ZONE: "zone",
  "REPORTING MANAGER": "reportingManagerRaw",
  DOJ: "doj",
  DOB: "dob",
  GENDER: "gender",
  EMAIL: "workEmail",
  "E-MAIL": "workEmail",
  "E MAIL": "workEmail",
  "EMAIL ID": "workEmail",
  "EMAIL-ID": "workEmail",
  "MAIL ID": "workEmail",
  "OFFICIAL EMAIL": "workEmail",
  "OFFICIAL E-MAIL": "workEmail",
  "COMPANY EMAIL": "workEmail",
  "WORK EMAIL": "workEmail",
  "CORPORATE EMAIL": "workEmail",
  "BUSINESS EMAIL": "workEmail",
  "EMAIL ADDRESS": "workEmail",
  "E-MAIL ADDRESS": "workEmail",
  "E MAIL ADDRESS": "workEmail",
  "OFFICIAL MAIL ID": "workEmail",
  "OFFICIAL MAIL": "workEmail",
  /** Common sheet typo / abbreviation (matches NUTRIMAX template). */
  "OFFIC EMAIL ID": "workEmail",
  "OFFICE EMAIL ID": "workEmail",
  "OFFIC E-MAIL ID": "workEmail",
  "E-MAIL ID": "workEmail",
  "E MAIL ID": "workEmail",
  "EMPLOYEE EMAIL": "workEmail",
  "EMP EMAIL": "workEmail",
  "EMP. EMAIL": "workEmail",
  "COMPANY MAIL": "workEmail",
  "COMPANY MAIL ID": "workEmail",
  "WORK MAIL": "workEmail",
  "WORKMAIL": "workEmail",
  "CORPORATE MAIL": "workEmail",
  "OFFICIAL ID": "workEmail",
};

function normalizeHeaderKey(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[\t\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/:+\s*$/, "")
    .toUpperCase();
}

function headerTextFromCellValue(cellValue) {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "object" && cellValue.richText) {
    return cellValue.richText.map((r) => r.text).join("");
  }
  if (typeof cellValue === "object" && "text" in cellValue && cellValue.text != null) {
    return String(cellValue.text);
  }
  return String(cellValue);
}

/** When the sheet uses a label we did not list in HEADER_MAP (e.g. "E mail id"). */
function headerImpliesWorkEmailColumn(key) {
  if (!key) return false;
  if (key === "EMP ID" || key === "EMPID" || key === "EMP CODE" || key === "EMPLOYEE ID") return false;
  if (key.includes("EMP ID")) return false;
  if (key.startsWith("EMP ") && key.includes("ID") && !key.includes("MAIL") && !key.includes("EMAIL")) return false;
  if (key.includes("EMAIL")) return true;
  if (/^E[\s-]*MAIL/.test(key)) return true;
  if (key.includes("MAIL")) {
    if (key.includes("ID") || key.includes("ADDRESS") || key.includes("NO.")) return true;
    if (
      key.includes("OFFICIAL") ||
      key.includes("WORK") ||
      key.includes("COMPANY") ||
      key.includes("CORPORATE") ||
      key.includes("BUSINESS")
    ) {
      return true;
    }
  }
  return false;
}

function scoreEmailHeaderMatch(key) {
  let s = 0;
  if (key.includes("EMAIL")) s += 10;
  if (key.includes("E-MAIL") || key.includes("E MAIL")) s += 8;
  if (key.includes("OFFICIAL") || key.includes("WORK")) s += 4;
  if (key.includes("MAIL")) s += 2;
  return s;
}

function extractMailtoAddress(hyperlink) {
  if (!hyperlink || typeof hyperlink !== "string") return null;
  const m = hyperlink.trim().match(/^mailto:([^?#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].trim()) || null;
  } catch {
    return m[1].trim() || null;
  }
}

function hyperlinkUrl(link) {
  if (!link) return "";
  if (typeof link === "string") return link;
  if (typeof link === "object" && link.hyperlink) return String(link.hyperlink);
  return "";
}

function valueText(cellValue) {
  if (cellValue === null || cellValue === undefined) return null;
  if (typeof cellValue === "object") {
    if (cellValue.richText) {
      return clean(cellValue.richText.map((r) => r.text).join(""));
    }
    if ("hyperlink" in cellValue && cellValue.hyperlink) {
      const fromMail = extractMailtoAddress(cellValue.hyperlink);
      const t = cellValue.text != null ? String(cellValue.text) : "";
      return clean(fromMail || t || null);
    }
    if ("result" in cellValue) {
      return clean(String(cellValue.result ?? ""));
    }
    if (cellValue instanceof Date) {
      return cellValue.toISOString().slice(0, 10);
    }
  }
  return clean(String(cellValue));
}

/**
 * Excel often stores mailto links on `cell.hyperlink` while `cell.value` is empty or plain text.
 */
function cellAsText(cell) {
  if (!cell) return null;
  const primary = valueText(cell.value);
  if (primary) return primary;
  const url = hyperlinkUrl(cell.hyperlink ?? cell.model?.hyperlink);
  if (url) {
    const fromMail = extractMailtoAddress(url);
    if (fromMail) return clean(fromMail);
  }
  return null;
}

function valueDate(cellValue) {
  if (cellValue === null || cellValue === undefined || cellValue === "") return null;
  if (cellValue instanceof Date) return cellValue.toISOString().slice(0, 10);
  if (typeof cellValue === "object" && cellValue && "result" in cellValue) {
    const r = cellValue.result;
    if (r instanceof Date) return r.toISOString().slice(0, 10);
    if (r) return String(r).trim();
    return null;
  }
  return clean(String(cellValue));
}

function buildHeaderToColForRow(headerRow) {
  const headerToCol = new Map();
  const headerMeta = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = normalizeHeaderKey(headerTextFromCellValue(cell.value));
    const target = HEADER_MAP[key];
    if (target) headerToCol.set(target, col);
    headerMeta.push({ col, key });
  });

  if (!headerToCol.has("workEmail")) {
    const candidates = headerMeta.filter((h) => headerImpliesWorkEmailColumn(h.key));
    if (candidates.length === 1) {
      headerToCol.set("workEmail", candidates[0].col);
    } else if (candidates.length > 1) {
      candidates.sort((a, b) => scoreEmailHeaderMatch(b.key) - scoreEmailHeaderMatch(a.key));
      headerToCol.set("workEmail", candidates[0].col);
    }
  }
  return { headerToCol, headerMeta };
}

function scoreHeaderCandidate(headerToCol) {
  let s = headerToCol.size * 3;
  if (headerToCol.has("empId")) s += 100;
  if (headerToCol.has("name")) s += 100;
  if (headerToCol.has("workEmail")) s += 50;
  if (headerToCol.has("designation")) s += 10;
  if (headerToCol.has("reportingManagerRaw")) s += 10;
  return s;
}

/**
 * Pick the row that looks like the real column header row (templates often put a title in row 1).
 */
function detectHeaderRowNumber(ws) {
  const maxScan = Math.min(5, ws.rowCount || 0);
  let bestRn = 1;
  let bestScore = -1;
  for (let rn = 1; rn <= maxScan; rn += 1) {
    const { headerToCol } = buildHeaderToColForRow(ws.getRow(rn));
    const sc = scoreHeaderCandidate(headerToCol);
    if (sc > bestScore) {
      bestScore = sc;
      bestRn = rn;
    }
  }
  if (bestScore < 100) {
    return 1;
  }
  return bestRn;
}

/**
 * @returns {Promise<Array<{
 *   rowNumber: number,
 *   sno: number|null,
 *   empId: string|null,
 *   name: string|null,
 *   designation: string|null,
 *   hq: string|null,
 *   region: string|null,
 *   state: string|null,
 *   zone: string|null,
 *   reportingManagerRaw: string|null,
 *   doj: string|null,
 *   dob: string|null,
 *   gender: string|null,
 *   workEmail: string|null,
 *   isVacant: boolean
 * }>>}
 */
async function parseOrgWorkbookBuffer(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error("workbook_has_no_sheet");
  }

  const headerRn = detectHeaderRowNumber(ws);
  const { headerToCol } = buildHeaderToColForRow(ws.getRow(headerRn));

  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRn) return;
    const v = (k) => {
      const col = headerToCol.get(k);
      if (!col) return null;
      return valueText(row.getCell(col).value);
    };
    const dateAt = (k) => {
      const col = headerToCol.get(k);
      if (!col) return null;
      return valueDate(row.getCell(col).value);
    };

    const empId = v("empId");
    const name = v("name");
    if (!empId && !name) return;

    const snoText = v("sno");
    const snoNum = snoText && /^\d+$/.test(snoText) ? Number(snoText) : null;
    const isVacant = !empId || (name || "").toUpperCase().trim() === "VACANT";

    const workEmailCol = headerToCol.get("workEmail");
    const workEmail = workEmailCol ? cellAsText(row.getCell(workEmailCol)) : null;

    out.push({
      rowNumber,
      sno: snoNum,
      empId,
      name: name || "VACANT",
      designation: v("designation"),
      hq: v("hq"),
      region: v("region"),
      state: v("state"),
      zone: v("zone"),
      reportingManagerRaw: v("reportingManagerRaw"),
      doj: dateAt("doj"),
      dob: dateAt("dob"),
      gender: v("gender"),
      workEmail,
      isVacant,
    });
  });

  return out;
}

module.exports = { parseOrgWorkbookBuffer };
