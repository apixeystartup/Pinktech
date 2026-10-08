import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTERS, TOTAL_DURATION, chapterAt } from "./demoScript";

/**
 * Playback engine for the 3D demo film.
 *
 * The clock lives in a ref so the render loop can read the current time 60
 * times a second without triggering a single React re-render. React state is
 * only used for the things that genuinely change the DOM: the chapter index,
 * and coarse play state.
 */
export default function useDemoPlayback({ onProgress } = {}) {
  const clock = useRef({
    time: 0,
    chapter: 0,
    chapterTime: 0,
    progress: 0,
    rate: 1,
    playing: false,
    ended: false,
    reducedMotion: false,
  });

  const [playing, setPlaying] = useState(false);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [rate, setRateState] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);

  /* ---- Keep the React mirror of the clock in sync ---- */
  const sync = useCallback(() => {
    const c = clock.current;
    const index = chapterAt(c.time);
    setChapterIndex((prev) => (prev === index ? prev : index));
    setEnded((prev) => (prev === c.ended ? prev : c.ended));
    if (onProgress) onProgress(c.time);
  }, [onProgress]);

  const play = useCallback(() => {
    const c = clock.current;
    if (c.reducedMotion) return;
    if (c.time >= TOTAL_DURATION - 0.02) {
      c.time = 0;
      c.chapter = 0;
      c.ended = false;
    }
    c.playing = true;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    clock.current.playing = false;
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (clock.current.playing) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback(
    (next) => {
      const c = clock.current;
      const clamped = Math.min(Math.max(next, 0), TOTAL_DURATION);
      c.time = clamped;
      c.progress = clamped / TOTAL_DURATION;
      c.chapter = chapterAt(clamped);
      c.ended = clamped >= TOTAL_DURATION - 0.001;
      setEnded(c.ended);
      sync();
    },
    [sync],
  );

  const seekChapter = useCallback(
    (index) => {
      let start = 0;
      for (let i = 0; i < index; i += 1) start += CHAPTERS[i].duration;
      seek(start + 0.05);
      if (!clock.current.playing) play();
    },
    [play, seek],
  );

  const restart = useCallback(() => {
    seek(0);
    play();
  }, [play, seek]);

  const setRate = useCallback((value) => {
    clock.current.rate = value;
    setRateState(value);
  }, []);

  /* ---- Detect reduced-motion preference ---- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      clock.current.reducedMotion = query.matches;
      setReducedMotion(query.matches);
      if (query.matches) {
        clock.current.playing = false;
        setPlaying(false);
      }
    };
    apply();
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }, []);

  /* ---- The frame driver ---- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let uiAccumulator = 0;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;

      const c = clock.current;
      if (c.playing) {
        c.time += delta * c.rate;
        if (c.time >= TOTAL_DURATION) {
          c.time = TOTAL_DURATION;
          c.playing = false;
          c.ended = true;
          setPlaying(false);
        }
      }

      c.progress = c.time / TOTAL_DURATION;
      c.chapter = chapterAt(c.time);
      c.chapterTime = c.time - CHAPTER_STARTS_LOCAL[c.chapter];

      // DOM progress bar updates at ~20fps: smooth enough, cheap enough.
      uiAccumulator += delta;
      if (uiAccumulator >= 0.05) {
        uiAccumulator = 0;
        sync();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sync]);

  /* ---- Pause while the tab is hidden ---- */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && clock.current.playing) {
        clock.current.playing = false;
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return {
    clock,
    playing,
    ended,
    rate,
    reducedMotion,
    chapterIndex,
    play,
    pause,
    toggle,
    seek,
    seekChapter,
    restart,
    setRate,
    total: TOTAL_DURATION,
  };
}

/* Precomputed chapter start offsets, used by the frame driver. */
const CHAPTER_STARTS_LOCAL = (() => {
  const starts = [];
  let acc = 0;
  for (const chapter of CHAPTERS) {
    starts.push(acc);
    acc += chapter.duration;
  }
  return starts;
})();