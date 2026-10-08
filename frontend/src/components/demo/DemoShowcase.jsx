import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping } from "three";
import { Atmosphere, CameraDirector } from "./parts";
import { DemoClockContext } from "./clock";
import useDemoPlayback from "./useDemoPlayback";
import { CAMERA_TRACK, CHAPTERS, TOTAL_DURATION } from "./demoScript";
import "./demo.css";

/*
 * Scenes are split per chapter and code-split, so the landing page only
 * downloads the 3D engine when the demo is actually scrolled into view, and
 * each chapter's geometry loads on its own.
 */
const SCENES = {
  platform: lazy(() => import("./scenes/PlatformScene")),
  routing: lazy(() => import("./scenes/RoutingScene")),
  tenancy: lazy(() => import("./scenes/TenancyScene")),
  org: lazy(() => import("./scenes/OrgScene")),
  workflow: lazy(() => import("./scenes/WorkflowScene")),
  kyc: lazy(() => import("./scenes/KycScene")),
  ops: lazy(() => import("./scenes/OpsScene")),
  outro: lazy(() => import("./scenes/OutroScene")),
};

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SceneStage({ clock, chapterIndex }) {
  const chapter = CHAPTERS[chapterIndex] ?? CHAPTERS[0];
  const Scene = SCENES[chapter.scene];

  return (
    <>
      {/* Fog only kicks in far past the subject — the camera sits ~35 units out,
          so anything closer reads as a dark wash if fog starts nearby. */}
      <fog attach="fog" args={["#060d24", 90, 260]} />
      <CameraDirector clock={clock} track={CAMERA_TRACK} />
      <Atmosphere count={200} spread={70} />

      {/* Physically-based lights: three r165+ dropped legacy lighting, so these
          are much higher than the old "intensity 1 is bright" habit. */}
      <ambientLight intensity={2.4} color="#a5b4fc" />
      <hemisphereLight args={["#818cf8", "#141b3d", 2.6]} />
      <directionalLight position={[16, 26, 18]} intensity={4.2} color="#e0e7ff" />
      <directionalLight position={[-18, 12, -14]} intensity={2.4} color="#67e8f9" />
      <directionalLight position={[0, -10, 8]} intensity={1.1} color="#a855f7" />
      <pointLight position={[0, 6, 26]} intensity={900} distance={120} decay={1.6} color="#6366f1" />

      <Suspense fallback={null}>
        <DemoClockContext.Provider value={clock}>
          <Scene key={chapter.scene} />
        </DemoClockContext.Provider>
      </Suspense>
    </>
  );
}

/* ---- Caption painter for the exported clip (mirrors the DOM overlay) ---- */
function drawCaption(ctx, chapter, width, height) {
  const pad = 56;
  const baseY = height - 96;

  ctx.save();

  // Kicker pill
  ctx.font = "600 15px Inter, system-ui, sans-serif";
  const kickerText = chapter.kicker.toUpperCase();
  const kickerWidth = ctx.measureText(kickerText).width + 44;
  ctx.fillStyle = "rgba(129,140,248,0.16)";
  roundRect(ctx, pad, baseY - 84, kickerWidth, 30, 15);
  ctx.fill();
  ctx.strokeStyle = "rgba(129,140,248,0.42)";
  ctx.lineWidth = 1;
  roundRect(ctx, pad, baseY - 84, kickerWidth, 30, 15);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(pad + 10, 0, pad + 10 + kickerWidth - 20, 0);
  gradient.addColorStop(0, "#818cf8");
  gradient.addColorStop(1, "#22d3ee");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(pad + 15, baseY - 69, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#020617";
  ctx.font = "800 11px Inter, system-ui, sans-serif";
  ctx.fillText(chapter.number, pad + 11, baseY - 65);

  ctx.fillStyle = "#c7d2fe";
  ctx.font = "700 13px Inter, system-ui, sans-serif";
  ctx.fillText(kickerText, pad + 30, baseY - 65);

  // Title
  ctx.fillStyle = "#f8fafc";
  ctx.font = "800 42px Inter, system-ui, sans-serif";
  ctx.fillText(chapter.title, pad, baseY - 34);

  // Caption body (wrapped)
  ctx.fillStyle = "#cbd5e1";
  ctx.font = "400 19px Inter, system-ui, sans-serif";
  wrapText(ctx, chapter.caption, pad, baseY - 4, Math.min(width * 0.52, 760), 26);

  // Bullets
  let bulletY = baseY + 30;
  ctx.font = "500 15px Inter, system-ui, sans-serif";
  for (const bullet of chapter.bullets) {
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(pad + 4, bulletY - 5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(bullet, pad + 18, bulletY);
    bulletY += 24;
  }

  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function DemoShowcase() {
  const sectionRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [started, setStarted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const autoplayRef = useRef(false);

  const progressFillRef = useRef(null);
  const timeRef = useRef(null);

  /* The scrub bar and clock label are written imperatively: routing 60fps time
     updates through React state would re-render the whole player shell every
     frame. Both must be updated here — doing the label in a dep-less effect
     left it frozen at 0:00, because sync() only re-renders when the chapter
     actually changes. */
  const handleProgress = useCallback((time) => {
    const node = progressFillRef.current;
    if (node) node.style.width = `${(time / TOTAL_DURATION) * 100}%`;
    const label = timeRef.current;
    if (label) label.textContent = `${formatTime(time)} / ${formatTime(TOTAL_DURATION)}`;
  }, []);

  const { clock, playing, ended, rate, reducedMotion, chapterIndex, play, pause, toggle, seek, seekChapter, restart, setRate, total } =
    useDemoPlayback({ onProgress: handleProgress });

  /* ---- Stop the capture when the film reaches its last frame ---- */
  useEffect(() => {
    if (ended && recorderRef.current) recorderRef.current.stop();
  }, [ended]);

  /* ---- Only build the canvas when the section is near the viewport ---- */
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (!autoplayRef.current) {
            autoplayRef.current = true;
            // Let the intro settle before the film starts rolling.
            setTimeout(() => {
              if (!reducedMotion) restart();
            }, 900);
          }
        } else {
          pause();
        }
      },
      // Generous margin: the section sits ~335px below the fold on a 900px
      // viewport, so a tight margin left the canvas unbuilt and the player
      // showing a placeholder instead of the demo.
      { rootMargin: "600px 0px", threshold: 0.02 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pause, reducedMotion, restart]);

  /* ---- Stop recording if the tab is hidden mid-capture ---- */
  useEffect(() => {
    if (recordUrl) {
      return () => URL.revokeObjectURL(recordUrl);
    }
    return undefined;
  }, [recordUrl]);

  /* ---- Video export ----
     MediaRecorder can only capture a canvas, and the narration is DOM. So the
     export composites the WebGL canvas plus the on-screen caption, bullets and
     vignette into a single offscreen 2D canvas, then records that. The result is
     a self-contained clip that plays anywhere, with the story intact. */
  function startRecording() {
    const source = canvasWrapRef.current?.querySelector("canvas");
    if (!source || typeof document.createElement("canvas").captureStream !== "function") return;

    const mime = pickMime();
    if (!mime) return;

    const width = 1600;
    const height = 900;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const composite = () => {
      raf = requestAnimationFrame(composite);

      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      try {
        ctx.drawImage(source, 0, 0, width, height);
      } catch {
        return;
      }

      // Vignette + letterbox fade, matching the on-screen framing.
      const vignette = ctx.createRadialGradient(
        width / 2,
        height * 0.45,
        height * 0.3,
        width / 2,
        height * 0.45,
        height * 0.95,
      );
      vignette.addColorStop(0, "rgba(2,6,23,0)");
      vignette.addColorStop(1, "rgba(2,6,23,0.78)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      const fade = ctx.createLinearGradient(0, height * 0.55, 0, height);
      fade.addColorStop(0, "rgba(2,6,23,0)");
      fade.addColorStop(1, "rgba(2,6,23,0.92)");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, width, height);

      const active = CHAPTERS[clock.current.chapter] ?? CHAPTERS[0];
      drawCaption(ctx, active, width, height);
    };

    try {
      const recorder = new MediaRecorder(out.captureStream(60), {
        mimeType: mime,
        videoBitsPerSecond: 10_000_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(raf);
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setRecordUrl(url);

        const link = document.createElement("a");
        link.href = url;
        link.download = `pinktech-demo.${mime.includes("mp4") ? "mp4" : "webm"}`;
        link.click();

        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
      setRecordUrl(null);
      setStarted(true);
      seek(0);
      play();
      composite();
    } catch {
      cancelAnimationFrame(raf);
      setRecording(false);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  function pickMime() {
    const candidates = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    if (typeof MediaRecorder === "undefined") return null;
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
  }

  const chapter = CHAPTERS[chapterIndex];

  function onScrub(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    seek(ratio * total);
  }

  return (
    <section className="demo-section" id="demo" ref={sectionRef}>
      <div className="demo-heading">
        <div className="section-badge">🎬 Product Demo</div>
        <h2 className="section-title">
          Watch the Platform <span className="gradient-text">in Motion</span>
        </h2>
        <p className="section-subtitle">
          A 3D walkthrough of the real architecture — gateway, microservices, tenancy,
          workflows, compliance. Rendered live in your browser, not a pre-recorded file.
        </p>
      </div>

      <div className="demo-shell">
        <div className="demo-stage" ref={canvasWrapRef}>
          {inView ? (
            <Canvas
              className="demo-canvas"
              dpr={[1, 1.75]}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: "high-performance",
                preserveDrawingBuffer: true,
              }}
              camera={{ fov: 42, near: 0.1, far: 400, position: [0, 4.2, 36] }}
              onCreated={({ gl }) => {
                gl.toneMapping = ACESFilmicToneMapping;
                // ACES crushes the shadows hard; a slight lift keeps the dark
                // navy background readable instead of near-black.
                gl.toneMappingExposure = 1.35;
              }}
            >
              <DemoClockContext.Provider value={clock}>
                <SceneStage clock={clock} chapterIndex={chapterIndex} />
              </DemoClockContext.Provider>
            </Canvas>
          ) : (
            <div className="demo-placeholder">
              <div className="demo-placeholder-grid" />
              <div className="demo-placeholder-inner">
                <span className="demo-placeholder-spinner" aria-hidden="true" />
                <p className="demo-placeholder-title">Preparing the 3D demo</p>
                <p className="demo-placeholder-sub">
                  The first frame can take a moment on slower devices.
                </p>
              </div>
            </div>
          )}

          {/* Letterbox + vignette sell the "film" framing */}
          <div className="demo-vignette" />
          <div className="demo-scanlines" />

          {/* Narration overlay */}
          <div className="demo-caption" key={chapter.id}>
            <div className="demo-caption-inner">
              <div className="demo-kicker">
                <span className="demo-kicker-num">{chapter.number}</span>
                {chapter.kicker}
              </div>
              <h3 className="demo-title">{chapter.title}</h3>
              <p className="demo-text">{chapter.caption}</p>
              <ul className="demo-bullets">
                {chapter.bullets.map((bullet) => (
                  <li key={bullet}>
                    <span className="demo-bullet-dot" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Live badge */}
          <div className="demo-live">
            <span className={`pulse-dot ${playing ? "" : "paused"}`} />
            {playing ? "RENDERING LIVE" : ended ? "END OF FILM" : "PAUSED"}
          </div>

          {/* Big play button before the film rolls */}
          {!started && !playing && !ended && (
            <button
              className="demo-bigplay"
              onClick={() => {
                setStarted(true);
                if (clock.current.time > 0.5) restart();
                else play();
              }}
              disabled={reducedMotion}
            >
              <span className="demo-bigplay-icon">▶</span>
              <span>
                <strong>Play the demo</strong>
                <small>{formatTime(total)} · 8 chapters</small>
              </span>
            </button>
          )}

          {recording && (
            <div className="demo-rec-badge">
              <span className="demo-rec-dot" /> REC — capturing video
            </div>
          )}
        </div>

        {/* ---- Transport controls ---- */}
        <div className="demo-controls">
          <div className="demo-scrub" onClick={onScrub} role="presentation">
            <div className="demo-scrub-track">
              <div className="demo-scrub-fill" ref={progressFillRef} />
            </div>
            {CHAPTERS.map((ch, i) => {
              let offset = 0;
              for (let k = 0; k < i; k += 1) offset += CHAPTERS[k].duration;
              return (
                <span
                  key={ch.id}
                  className={`demo-scrub-mark ${i === chapterIndex ? "active" : ""}`}
                  style={{ left: `${(offset / total) * 100}%` }}
                  title={ch.title}
                />
              );
            })}
          </div>

          <div className="demo-controls-row">
            <div className="demo-controls-left">
              <button
                className="demo-btn demo-btn-primary"
                onClick={() => {
                  setStarted(true);
                  toggle();
                }}
                aria-label={playing ? "Pause demo" : "Play demo"}
              >
                {playing ? "❚❚" : "▶"}
              </button>
              <button className="demo-btn" onClick={restart} aria-label="Restart demo">
                ↺
              </button>
              <span className="demo-time" ref={timeRef}>
        0:00 / {formatTime(TOTAL_DURATION)}
      </span>
            </div>

            <div className="demo-chapters">
              {CHAPTERS.map((ch, i) => (
                <button
                  key={ch.id}
                  className={`demo-chapter ${i === chapterIndex ? "active" : ""}`}
                  onClick={() => {
                    setStarted(true);
                    seekChapter(i);
                  }}
                >
                  {ch.number}
                </button>
              ))}
            </div>

            <div className="demo-controls-right">
              <button
                className="demo-btn demo-btn-text"
                onClick={() => setRate(rate === 1 ? 0.5 : rate === 0.5 ? 2 : 1)}
              >
                {rate}×
              </button>
              {recording ? (
                <button className="demo-btn demo-btn-danger" onClick={stopRecording}>
                  Stop
                </button>
              ) : (
                <button className="demo-btn demo-btn-text" onClick={startRecording} title="Record this demo as a video file to share">
                  ⤓ MP4
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="demo-footer">
        <p className="demo-footer-text">
          Rendered with WebGL — every service tower, packet and audit record above is a real
          component of the running system. Use <strong>⤓ MP4</strong> to record the whole
          film, captions included, and share it with your team.
        </p>
        <div className="demo-footer-cta">
          {recordUrl && (
            <a className="btn-hero-secondary" href={recordUrl} download="pinktech-demo.webm">
              ↓ Download your recording
            </a>
          )}
          <Link to="/login" className="btn-hero-primary">
            Try it live →
          </Link>
        </div>
      </div>
    </section>
  );
}