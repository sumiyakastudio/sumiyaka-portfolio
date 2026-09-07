"use client";

import { useEffect, useRef } from "react";
import { prefersLightVisuals } from "@/lib/device";
import { OP_FULL, OP_HARD_TIMEOUT_MS, OP_LIGHT } from "@/components/fv/top/opening";
import { resetOpState, setOpState } from "@/components/fv/top/opClock";

/**
 * OP「一筆と灯」— 第1幕の"指揮"だけを持つ。
 *
 * ★2026-09-07 連続変形化：OP の絵は自前の canvas を持たず、第2幕と同じ描画面
 *   （TenkiStage の canvas）が描く。灯敷が砕けた破片が、飛びながらそのまま
 *   CSV / XLSX / PDF へ姿を変えるため、境目でクロスフェードを起こさないのが狙い。
 *   このコンポーネントは時計を進めて opClock へ流し、`onDone` を返すだけ（描画なし）。
 *
 *   0.02–0.62  一筆
 *   0.52–1.04  灯敷（版下の切り出し・字形は崩れない）
 *   1.00–      灯
 *   1.20–1.75  ほどけ＝破片が飛びながら書類へ変形（第2幕の散らばりへ着地）
 *   1.26       onDone → openingDone → Hero の本文が出る
 *
 * 経路：reduced-motion＝再生せず即 onDone ／ タッチ・狭幅＝0.56s の短縮版 ／ それ以外＝フル。
 * スクロールは止めない（DOM を持たない）。ハードタイムアウト 2.2s で必ず渡す。
 */

declare global {
  interface Window {
    /** OP の位相（撮影・実測用） */
    __op?: { t: number; phase: string; light: boolean; skipped: boolean };
    /** QC 用：数値を入れるとその時刻に止まる（未設定なら通常再生） */
    __opScrub?: number | null;
  }
}

interface OpeningLiteProps {
  onDone: () => void;
}

export default function OpeningLite({ onDone }: OpeningLiteProps) {
  const doneRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setOpState({ done: true });
      onDone();
    };

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const light = prefersLightVisuals();
    resetOpState(light);

    if (reduced) {
      // 幕を張らず、第2幕の終端へ即座に渡す
      setOpState({ skipped: true, t: 99 });
      window.__op = { t: 99, phase: "skipped", light, skipped: true };
      const id = window.setTimeout(finish, 0);
      return () => {
        window.clearTimeout(id);
        setOpState({ live: false });
      };
    }

    const T = light ? OP_LIGHT : OP_FULL;
    const stopAt = T.unravelAt + T.morphDur + 0.8;
    let t = 0;
    let last = 0;
    let raf = 0;
    let disposed = false;

    const tick = (ts: number) => {
      if (disposed) return;
      if (!last) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.25);
      last = ts;
      t += dt;
      // QC 用の一時停止（撮影を演出の時刻で揃えるため。通常再生では未設定）
      if (typeof window.__opScrub === "number") t = window.__opScrub;
      setOpState({ t });
      window.__op = {
        t: Math.round(t * 1000) / 1000,
        phase:
          t < T.glyph0Start ? "stroke" : t < T.unravelAt ? "glyph" : t < T.unravelAt + T.morphDur ? "morph" : "handed",
        light,
        skipped: false,
      };
      if (t >= T.doneAt) finish();
      // 変形が終われば指揮の役目は終わり（常時ループを残さない）
      if (t >= stopAt && typeof window.__opScrub !== "number") return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // 保険：何があっても 2.2s で第2幕へ渡す（QC で時計を止めているあいだは効かせない）
    const born = performance.now();
    const hard = window.setInterval(() => {
      if (typeof window.__opScrub === "number") return;
      if (performance.now() - born >= OP_HARD_TIMEOUT_MS) finish();
    }, 150);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearInterval(hard);
      setOpState({ live: false });
    };
  }, [onDone]);

  return null;
}
