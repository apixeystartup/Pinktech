import { useRef, useState, useEffect, useCallback } from "react";

export default function SignaturePad({ onSign, width = 400, height = 150 }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [getPos]);

  const draw = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  const confirm = useCallback(() => {
    if (!hasDrawn) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onSign(dataUrl);
  }, [hasDrawn, onSign]);

  return (
    <div className="signaturePadWrap">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="signaturePadCanvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="signaturePadActions">
        <button type="button" className="smallBtn" onClick={clear}>Clear</button>
        <button type="button" className="smallBtn primary" onClick={confirm} disabled={!hasDrawn}>Use This Signature</button>
      </div>
    </div>
  );
}
