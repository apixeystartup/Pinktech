function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyInline(text) {
  let out = escapeText(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "||B||$1||B||");
  out = " " + out;
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  out = out.replace(/\|\|B\|\|([^*]+)\|\|B\|\|/g, "<strong>$1</strong>");
  out = out.trim();
  return out;
}

const ALLOWED_TAGS = ["H1", "H2", "H3", "H4", "P", "UL", "OL", "LI", "STRONG", "EM", "BR", "HR", "BLOCKQUOTE",
  // Agreement templates: Party 1 block + body.
  "DIV", "DL", "DT", "DD",
  // Party 1's saved signature renders inline as a data-URL image.
  "IMG"];

// Presentation-only attributes kept on allowed elements (no behavior, no URLs).
function copySafeAttributes(source, target) {
  const cls = source.getAttribute && source.getAttribute("class");
  if (cls) target.setAttribute("class", cls);
  if (source.attributes) {
    for (const attr of source.attributes) {
      if (attr.name.startsWith("data-")) target.setAttribute(attr.name, attr.value);
    }
  }
}

export function sanitizeHtml(dirty) {
  if (typeof document === "undefined") {
    return String(dirty ?? "");
  }
  const doc = new DOMParser().parseFromString(`<div>${dirty}</div>`, "text/html");
  const root = doc.body.firstChild || doc.body;

  function walk(node, target) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        target.appendChild(child.cloneNode());
        return;
      }
      if (child.nodeType !== 1) return;
      if (ALLOWED_TAGS.includes(child.tagName)) {
        const el = document.createElement(child.tagName);
        copySafeAttributes(child, el);
        if (child.tagName === "IMG") {
          // Only embedded raster images (the saved Party 1 signature) —
          // never remote URLs or SVG.
          const src = child.getAttribute("src") || "";
          if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) el.setAttribute("src", src);
          const alt = child.getAttribute("alt") || "";
          if (alt) el.setAttribute("alt", alt);
        }
        walk(child, el);
        target.appendChild(el);
      } else {
        walk(child, target);
      }
    });
  }

  const result = document.createElement("div");
  walk(root, result);
  return result.innerHTML;
}

export function textToStructuredHtml(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${applyInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      const tag = listType || "ul";
      html.push(`<${tag}>${listItems.map((item) => `<li>${applyInline(item)}</li>`).join("")}</${tag}>`);
      listItems = [];
      listType = null;
    }
  };

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = line.match(/^#+/)[0].length;
      html.push(`<h${level}>${applyInline(heading[1])}</h${level}>`);
      continue;
    }

    if (/^---+|\*\*\*+$/.test(line)) {
      flushParagraph();
      flushList();
      html.push("<hr/>");
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    if (/^[A-Z0-9][A-Z0-9 ,.;:'"&()-]{3,}$/.test(line) && line === line.toUpperCase()) {
      flushParagraph();
      flushList();
      html.push(`<h3>${applyInline(line)}</h3>`);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return html.join("");
}

export async function fileToAgreementHtml(file) {
  if (!file) return "";
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return sanitizeHtml(result.value || "");
  }

  if (name.endsWith(".pdf") || type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    try {
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      const workerUrl = worker?.default || worker;
      if (workerUrl && pdfjs?.GlobalWorkerOptions) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
    } catch {
      /* worker is optional — pdf.js falls back when unavailable */
    }
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pages = [];
    const maxPages = Math.min(pdf.numPages || 0, 50);
    for (let i = 1; i <= maxPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = [];
      let lastY = null;
      for (const item of content.items || []) {
        const str = item?.str ?? "";
        const y = Array.isArray(item?.transform) ? Math.round(item.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) lines.push("\n");
        else if (str) lines.push(str);
        if (str) lines.push(" ");
        if (y !== null) lastY = y;
      }
      pages.push(lines.join("").replace(/[ \t]+/g, " "));
    }
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
    const text = pages.join("\n\n").trim();
    if (!text) return "";
    return sanitizeHtml(textToStructuredHtml(text));
  }

  const text = await file.text();
  return sanitizeHtml(textToStructuredHtml(text));
}

export function extractTemplateText(html) {
  if (typeof document === "undefined") return String(html ?? "");
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return (doc.body?.textContent || "").trim();
}
