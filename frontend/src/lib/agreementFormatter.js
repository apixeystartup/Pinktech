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

const ALLOWED_TAGS = ["H1", "H2", "H3", "H4", "P", "UL", "OL", "LI", "STRONG", "EM", "BR", "HR", "BLOCKQUOTE"];

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

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return sanitizeHtml(result.value || "");
  }

  const text = await file.text();
  return sanitizeHtml(textToStructuredHtml(text));
}
