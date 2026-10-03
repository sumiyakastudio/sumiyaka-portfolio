"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { photoLoops, whoScenes } from "@/data/photoLoops";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./WhoFilm.module.css";

/**
 * WhoFilm — トップ 01「何をする人か」の動画（3場面・約27秒）と場面の目次（2026-10-03 動画 v2）。
 *
 * 3つの部品で組む（Who.tsx が並べる）：
 *   <WhoFilm>          … 状態の持ち主（動画の再生・現在の場面・場面内の進み）。DOM は出さない
 *   <WhoSceneIndex />  … 場面の目次（PC＝左列の h2 と説明の間・罫線だけの3行）
 *   <WhoFilmFigure>    … 額＋静止画＋動画＋（SP・タブレット）目盛り3本と現在の場面の添え書き
 *
 * 動画の重ね方は components/photo/LoopVideo.tsx と同じ作法（この節専用に自前で持つ）：
 * - 静止画（next/image）が土台。grid の同じ升目に <video> を重ねる（position を使わない）。
 *   ⚠ <video> に width/height 属性を付けない（升目が数 px 伸びる＝2026-10-01 実測）。
 * - 画面に入ったら読み込んで再生（preload="none"）。画面外・背面タブでは止める。
 * - 「動きを減らす」・省データ・自動再生の拒否では静止画のまま＝目次も静的（3行とも同じ調子）。
 * - 場面の進みは requestAnimationFrame で video.currentTime を読み、目盛りの要素の
 *   style.transform（scaleX）へ直接書く（毎フレーム setState しない）。
 *   場面番号が変わった時だけ setState。場面割りは data/photoLoops.ts の whoScenes だけを見る。
 * - 動かすのは transform と opacity だけ（filter・blend・3D は使わない）。操作パネルは出さない。
 */

type FilmState = {
  /** 動画が出ている（再生が一度始まった）。false の間、目次は静的 */
  live: boolean;
  /** 現在の場面（whoScenes の添字） */
  scene: number;
  /** 場面の頭へ頭出し（止まっていれば再生） */
  seek: (i: number) => void;
  /** 目盛り（data-scene を持つ要素）の登録口 */
  barRef: (el: HTMLElement | null) => void | (() => void);
  videoRef: RefObject<HTMLVideoElement | null>;
  motion: boolean;
};

const FilmContext = createContext<FilmState | null>(null);

function useFilm(): FilmState {
  const v = useContext(FilmContext);
  if (!v) throw new Error("WhoFilm の内側で使う");
  return v;
}

/** 時刻 → 場面の添字 */
function sceneAt(t: number): number {
  for (let i = whoScenes.length - 1; i >= 0; i--) {
    if (t >= whoScenes[i].start) return i;
  }
  return 0;
}

export default function WhoFilm({ children }: { children: ReactNode }) {
  const motion = useMotionAllowed();
  const videoRef = useRef<HTMLVideoElement>(null);
  const bars = useRef<Set<HTMLElement>>(new Set());
  const sceneRef = useRef(0);
  const [shown, setShown] = useState(false);
  const [scene, setScene] = useState(0);

  /** 現在の時刻を目盛りへ書く（DOM へ直接）。場面が変わった時だけ state を更新 */
  const paint = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    const i = sceneAt(t);
    const s = whoScenes[i];
    const p = Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start)));
    bars.current.forEach((el) => {
      const k = Number(el.dataset.scene) === i ? p : 0;
      el.style.transform = `scaleX(${k.toFixed(4)})`;
    });
    if (i !== sceneRef.current) {
      sceneRef.current = i;
      setScene(i);
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!motion || !v) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    v.muted = true;
    v.defaultMuted = true;
    let inView = false;
    let raf = 0;

    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const play = () => {
      if (!inView || document.visibilityState !== "visible") return;
      if (v.preload !== "auto") v.preload = "auto";
      const p = v.play();
      if (p) p.catch(() => {});
    };
    const pause = () => {
      if (!v.paused) v.pause();
    };

    const onPlaying = () => {
      setShown(true);
      startLoop();
    };
    const onPause = () => {
      stopLoop();
      paint();
    };
    const onSeeked = () => paint();

    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeeked);

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) play();
        else pause();
      },
      { threshold: 0.15 }
    );
    io.observe(v);

    const onVis = () => {
      if (document.visibilityState === "visible") play();
      else pause();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeeked);
      stopLoop();
      pause();
    };
  }, [motion, paint]);

  const seek = useCallback((i: number) => {
    const v = videoRef.current;
    const s = whoScenes[i];
    if (!v || !s) return;
    // 区切りちょうどだと前の場面の最後のコマに落ちることがあるので、わずかに内側へ
    v.currentTime = i === 0 ? 0 : s.start + 0.02;
    sceneRef.current = i;
    setScene(i);
    if (v.paused) {
      const p = v.play();
      if (p) p.catch(() => {});
    }
  }, []);

  const barRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const set = bars.current;
    set.add(el);
    return () => {
      set.delete(el);
    };
  }, []);

  const live = motion && shown;
  const value = useMemo<FilmState>(
    () => ({ live, scene, seek, barRef, videoRef, motion }),
    [live, scene, seek, barRef, motion]
  );

  return <FilmContext.Provider value={value}>{children}</FilmContext.Provider>;
}

/** 1行ぶんの文字（番号＋場面の添え書き）。白い層を上に重ね、opacity だけで切り替える */
function SceneLabel({ no, caption }: { no: string; caption: string }) {
  return (
    <span className={styles.label}>
      <span className={styles.labelBase}>
        <span className={styles.no}>{no}</span>
        <span className={styles.cap}>{caption}</span>
      </span>
      <span className={styles.labelHi} aria-hidden="true">
        <span className={styles.no}>{no}</span>
        <span className={styles.cap}>{caption}</span>
      </span>
    </span>
  );
}

/**
 * 場面の目次（PC＝左列）。罫線だけの3行。再生中の行だけ文字が白く、その行の罫の上を白い細線が進む。
 * 押すとその場面の頭へ頭出し。動画が出ていない時は3行とも同じ調子の静的な目次（button にしない）。
 */
export function WhoSceneIndex({ className }: { className?: string }) {
  const { live, scene, seek, barRef } = useFilm();

  return (
    <ol className={[styles.side, live ? styles.sideLive : "", className].filter(Boolean).join(" ")}>
      {whoScenes.map((s, i) => {
        const on = live && i === scene;
        const body = (
          <>
            <SceneLabel no={s.no} caption={s.caption} />
            <span className={styles.rowTrack} aria-hidden="true">
              {live && <span ref={barRef} data-scene={i} className={styles.rowBar} />}
            </span>
          </>
        );
        return (
          <li key={s.no} className={`${styles.row} ${on ? styles.on : ""}`}>
            {live ? (
              <button
                type="button"
                className={styles.rowBtn}
                aria-label={`${s.no} ${s.caption}`}
                aria-current={on ? "true" : undefined}
                onClick={() => seek(i)}
              >
                {body}
              </button>
            ) : (
              <span className={styles.rowBtn}>{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 額＋静止画＋動画。SP・タブレット（1100px 未満）は動画の直下に目盛り3本と現在の場面の添え書き。
 * figcaption は PC で表示・SP では場面の添え書きと重なるので視覚的にだけ隠す（読み上げには残す）。
 * 入場＝額の罫は外側（ScrollReveal）と一緒に先に出て、絵は内側で opacity＋scale 1.03→1。
 */
export function WhoFilmFigure({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  caption: string;
  className?: string;
}) {
  const { live, scene, seek, barRef, videoRef, motion } = useFilm();
  const frameRef = useRef<HTMLSpanElement>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!motion || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntered(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  // SSR・JS 無し・動きを減らす＝クラスなし（最初から見えたまま）
  const picState = !motion ? "" : entered ? styles.picIn : styles.picPre;

  return (
    <figure className={[styles.figure, className].filter(Boolean).join(" ")}>
      <span ref={frameRef} className={styles.frame}>
        <span className={styles.clip}>
          <span className={`${styles.pic} ${picState}`}>
            {children}
            {motion && (
              <video
                ref={videoRef}
                className={`${styles.video} ${live ? styles.videoShown : ""}`}
                poster={photoLoops.whoSequence.poster}
                preload="none"
                muted
                loop
                playsInline
                disablePictureInPicture
                disableRemotePlayback
                aria-hidden="true"
                tabIndex={-1}
              >
                <source src={photoLoops.whoSequence.src} type="video/mp4" />
              </video>
            )}
          </span>
        </span>
      </span>

      {/* SP・タブレット：横3分割の目盛り（押せる・高さ 44px） */}
      <ol className={styles.ticks} aria-hidden={live ? undefined : true}>
        {whoScenes.map((s, i) => (
          <li key={s.no} className={styles.tickItem}>
            {live ? (
              <button
                type="button"
                className={styles.tick}
                aria-label={`${s.no} ${s.caption}`}
                aria-current={i === scene ? "true" : undefined}
                onClick={() => seek(i)}
              >
                <span className={styles.tickTrack}>
                  <span ref={barRef} data-scene={i} className={styles.tickBar} />
                </span>
              </button>
            ) : (
              <span className={styles.tick}>
                <span className={styles.tickTrack} />
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* SP・タブレット：現在の場面の添え書き（opacity のクロスフェード）。読み上げは目盛りのボタンが持つ */}
      <p className={styles.sceneCap} aria-hidden="true">
        {whoScenes.map((s, i) => (
          <span
            key={s.no}
            className={`${styles.sceneCapItem} ${live && i === scene ? styles.sceneCapOn : ""}`}
          >
            <span className={styles.sceneNo}>{s.no}</span>
            <span className={styles.sceneText}>{s.caption}</span>
          </span>
        ))}
      </p>

      <figcaption className={`${styles.caption} ${live ? styles.captionQuiet : ""}`}>
        {caption}
      </figcaption>
    </figure>
  );
}
