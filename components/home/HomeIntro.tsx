"use client";

import { useCallback, useState } from "react";
import Hero from "./Hero";
import OpeningLite from "./OpeningLite";

/**
 * E↔F 結合契約（P3_SPEC）: prop なしの client コンポーネント。
 * page.tsx は <HomeIntro /> を置くだけでよい（呼び出し形は不変）。
 *
 * 2026-09-07 OP 復活：
 * 第1幕 OP「一筆と灯」→ 第2幕 FV「転記」を 1 本の続きものとして繋ぐ。
 * OP は自分の筆致がほどけて事務のデータの断片になる瞬間（1.20s）に onDone を返し、
 * Hero 側の転記ステージがそこから時計を回す。待ち時間は 1 回きり。
 *
 * Hero の props インターフェース { openingDone: boolean } は現行から変えない。
 * OP は pointer-events: none の幕なのでスクロールは止めない。
 * reduced-motion では OP を張らず、即 openingDone になる。
 */
export default function HomeIntro() {
  const [openingDone, setOpeningDone] = useState(false);
  const handleDone = useCallback(() => setOpeningDone(true), []);

  return (
    <>
      <OpeningLite onDone={handleDone} />
      <Hero openingDone={openingDone} />
    </>
  );
}
