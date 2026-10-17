import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "../../styles/sign-designer.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PAGE_WIDTH = 800;

function fieldsOverlap(candidate, other) {
  return (
    candidate.x < other.x + other.w &&
    candidate.x + candidate.w > other.x &&
    candidate.y < other.y + other.h &&
    candidate.y + candidate.h > other.y
  );
}

function PageCanvas({ pageObj, pageWidth, overlays, selectedId, mode, onSelect, onChange, onDelete, onSign, onAdd, onCollision }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const placedRef = useRef([]);
  const onChangeRef = useRef(onChange);
  const onCollisionRef = useRef(onCollision);
  const viewport = pageObj.viewport;
  const scale = pageWidth / viewport.width;
  const wPx = Math.round(viewport.width * scale);
  const hPx = Math.round(viewport.height * scale);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = Math.round(viewport.width * scale);
    canvas.height = Math.round(viewport.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const renderTask = pageObj.page.render({
      canvasContext: ctx,
      viewport: pageObj.page.getViewport({ scale }),
    });
    return () => {
      try { renderTask.cancel(); } catch { /* ignore */ }
    };
  }, [pageObj.page, viewport, scale]);

  const placed = (overlays || []).filter((f) => f.page === pageObj.pageIndex);
  useEffect(() => {
    placedRef.current = placed;
    onChangeRef.current = onChange;
    onCollisionRef.current = onCollision;
  }, [placed, onChange, onCollision]);

  useEffect(() => {
    if (!drag) return undefined;
    let collisionNotified = false;
    const handleMove = (e) => {
      const currentDrag = dragRef.current;
      if (!currentDrag) return;
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const rx = 100 / r.width;
      const ry = 100 / r.height;
      const dx = (e.clientX - currentDrag.startClientX) * rx;
      const dy = (e.clientY - currentDrag.startClientY) * ry;
      let nx = currentDrag.startX + dx;
      let ny = currentDrag.startY + dy;
      const lastValid = currentDrag.lastValid;
      let candidate;
      if (currentDrag.resize) {
        const rw = Math.max(3, currentDrag.startW + dx);
        const rh = Math.max(3, currentDrag.startH + dy);
        candidate = {
          ...lastValid,
          w: Math.min(rw, 100 - lastValid.x),
          h: Math.min(rh, 100 - lastValid.y),
        };
      } else {
        nx = Math.max(0, Math.min(100 - currentDrag.startW, nx));
        ny = Math.max(0, Math.min(100 - currentDrag.startH, ny));
        candidate = { ...lastValid, x: nx, y: ny };
      }
      const collides = placedRef.current.some((field) => field.cid !== currentDrag.id && fieldsOverlap(candidate, field));
      if (collides) {
        if (!collisionNotified) {
          onCollisionRef.current?.();
          collisionNotified = true;
        }
        return;
      }
      collisionNotified = false;
      currentDrag.lastValid = candidate;
      onChangeRef.current(currentDrag.id, currentDrag.resize ? { w: candidate.w, h: candidate.h } : { x: candidate.x, y: candidate.y });
    };
    const handleUp = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [drag]);

  const beginDrag = (field, event, resize = false) => {
    const nextDrag = {
      id: field.cid,
      startX: field.x,
      startY: field.y,
      startW: field.w,
      startH: field.h,
      startClientX: event.clientX,
      startClientY: event.clientY,
      resize,
      lastValid: { x: field.x, y: field.y, w: field.w, h: field.h },
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  return (
    <div
      className="signPdfPage"
      style={{ width: wPx, height: hPx }}
      data-page={pageObj.pageIndex}
      ref={wrapRef}
      onDragOver={(e) => { if (mode === "design") { e.preventDefault(); } }}
      onDrop={(e) => {
        if (mode !== "design") return;
        e.preventDefault();
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r) return;
        let payload;
        try { payload = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
        if (!payload) return;
        const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
        const defaultW = payload.type === "SIGNATURE" || payload.type === "IMAGE" ? 25 : 30;
        const defaultH = payload.type === "SIGNATURE" || payload.type === "IMAGE" ? 10 : 5;
        const candidate = {
          page: pageObj.pageIndex,
          x: Math.max(0, Math.min(100 - defaultW, x - defaultW / 2)),
          y: Math.max(0, Math.min(100 - defaultH, y - defaultH / 2)),
          w: defaultW,
          h: defaultH,
        };
        if (placed.some((field) => fieldsOverlap(candidate, field))) {
          onCollision?.();
          return;
        }
        onSelect?.(null);
        // Hand placement back to parent with a transient shape.
        onAdd?.({
          ...candidate,
          type: payload.type,
          tag: payload.tag,
          label: payload.label,
        });
      }}
    >
      <canvas ref={canvasRef} className="signPdfCanvas" width={wPx} height={hPx} />
      <div className="signOverlayLayer">
        {placed.map((f) => {
          const sel = selectedId === f.cid;
          const signerOwned = mode === "sign" && f.canSign;
          const cls = [
            "signField",
            `signField--${String(f.type).toLowerCase()}`,
            sel ? "is-selected" : "",
            mode === "design" ? "is-draggable" : "",
            mode === "sign" && signerOwned ? "is-editable" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={f.cid}
              className={cls}
              style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
              onClick={(e) => { e.stopPropagation(); onSelect?.(f.cid); if (mode === "sign" && ["SIGNATURE", "INITIALS"].includes(f.type) && signerOwned) onSign?.(f.cid); }}
              onPointerDown={
                mode === "design"
                  ? (e) => {
                      e.stopPropagation(); e.preventDefault();
                      onSelect?.(f.cid);
                      if (!wrapRef.current) return;
                      beginDrag(f, e);
                    }
                  : undefined
              }
            >
              {f.type === "IMAGE" && f.value ? <img src={f.value} alt={f.label || f.tag} draggable={false} /> : null}
              {f.type === "TEXT" || f.type === "DATE" ? (
                mode === "sign" && signerOwned ? (
                  <input
                    type={f.type === "DATE" ? "date" : "text"}
                    value={f.value || ""}
                    onChange={(e) => onChange(f.cid, { value: e.target.value })}
                    placeholder={f.label || ""}
                  />
                ) : (
                  <span className="signField__text">{f.value || f.label || ""}</span>
                )
              ) : null}
              {f.type === "CHECKBOX" ? (
                <input type="checkbox" checked={Boolean(f.value)} onChange={(e) => mode === "sign" && signerOwned && onChange(f.cid, { value: e.target.checked ? "checked" : "" })} disabled={!(mode === "sign" && signerOwned)} />
              ) : null}
              {f.type === "SIGNATURE" || f.type === "INITIALS" ? (
                signerOwned ? <button type="button" className="signPadTrigger">{f.type === "INITIALS" ? "Add initials" : "Draw here"}</button> : <span className="signField__placeholder">{f.value ? "Signed" : f.type === "INITIALS" ? "Initials" : "Signature"}</span>
              ) : null}
              {mode === "design" && sel ? (
                <>
                  <span className="signField__tag">{f.tag}</span>
                  <button type="button" className="signField__delete" onClick={(e) => { e.stopPropagation(); onDelete?.(f.cid); }}>&times;</button>
                  <span
                    className="signField__resize"
                    onPointerDown={(e) => {
                      e.stopPropagation(); e.preventDefault();
                      beginDrag(f, e, true);
                    }}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PdfFieldCanvas({
  pdfUrl,
  fields,
  selectedId,
  mode = "design",
  signerFieldIds,
  onSelect,
  onAdd,
  onChange,
  onDelete,
  onSignatureRequest,
  fitToContainer = false,
}) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(PAGE_WIDTH);
  const [collisionNotice, setCollisionNotice] = useState("");
  const collisionTimer = useRef(null);

  const signerSet = useMemo(() => signerFieldIds || new Set(), [signerFieldIds]);

  const augmented = (fields || []).map((f) => ({
    ...f,
    cid: f.cid || f._id || f.id || `${f.tag}-${f.x}-${f.y}`,
    canSign: signerSet.has(f.cid || f._id || f.id),
  }));

  const notifyCollision = () => {
    setCollisionNotice("Placeholders cannot overlap. Move this field to a clear area.");
    if (collisionTimer.current) clearTimeout(collisionTimer.current);
    collisionTimer.current = setTimeout(() => {
      setCollisionNotice("");
      collisionTimer.current = null;
    }, 2000);
  };

  useEffect(() => () => {
    if (collisionTimer.current) clearTimeout(collisionTimer.current);
  }, []);

  useEffect(() => {
    if (!fitToContainer) return undefined;
    const root = scrollRef.current;
    const container = root?.parentElement;
    if (!container) return undefined;
    const updateWidth = () => {
      const styles = window.getComputedStyle(container);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const availableWidth = container.clientWidth - horizontalPadding;
      setPageWidth(Math.max(280, Math.min(PAGE_WIDTH, Math.floor(availableWidth))));
    };
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    updateWidth();
    return () => observer.disconnect();
  }, [fitToContainer, pages.length]);

  useEffect(() => {
    if (!pdfUrl) { setPages([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`Agreement could not be loaded (${response.status}).`);
        const data = await response.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        const out = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          out.push({ pageIndex: i - 1, page, viewport });
        }
        if (out.length === 0) throw new Error("No pages were detected in this PDF.");
        setPages(out);
      } catch (err) {
        if (!cancelled) { console.error("pdf load failed", err); setPages([]); setError(err?.message || "Could not read this PDF."); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  if (!pdfUrl) {
    return <div className="signCanvasEmpty">Upload an agreement PDF to place fields.</div>;
  }
  if (loading) {
    return <div className="signCanvasEmpty">Loading agreement…</div>;
  }
  if (!pages.length) {
    return <div className="signCanvasEmpty">{error || "No pages detected."}</div>;
  }
  return (
    <div className="signCanvasRoot" ref={scrollRef}>
      {collisionNotice ? <div className="signCanvasCollisionToast" role="status">{collisionNotice}</div> : null}
      {pages.map((p) => (
        <PageCanvas
          key={p.pageIndex}
          pageObj={p}
          pageWidth={pageWidth}
          overlays={augmented}
          selectedId={selectedId}
          mode={mode}
          onSelect={onSelect}
          onChange={onChange}
          onDelete={onDelete}
          onSign={onSignatureRequest}
          onAdd={onAdd}
          onCollision={notifyCollision}
        />
      ))}
    </div>
  );
}
