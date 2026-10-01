"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./LocalAiDiagram.module.css";

/**
 * FIG. 09-A ＝「AIも、御社のパソコンの中で動く」（2026-10-01・ローカルAI節 指示書 §3／図解の憲法 §9-0）
 *
 * 同じページの FIG. 08-A（InsideDiagram）を土台に写した図＝図題・枠・トンボ・色変数・時刻表・
 * armed/play・InViewGate の .live・reduced-motion・雲・境界の破線・「外」の位置は 08-A と同じ。
 * 08-A は「ディスプレイの中のブラウザ」、09-A は「**パソコン本体（箱）の中に AI の部品がある**」。
 *
 * ◆ 静止画だけで読めること
 *   書類がパソコンの中の AI を通って結果になる。外の雲へ行く線は抜けていて、通信は 0件。
 *
 * ◆ 部品（すべて線画・太さは 1px と 2px の二段・塗りは点だけ）
 *   器＝パソコン本体：角の丸い箱（筐体）と、その内側の室（＝壁の厚みが見える断面）。
 *       PC は左端が前面の帯（電源の丸＋灯＋横の溝2本）、下に足2つ。SP は帯が上辺。
 *       ラベル「御社のパソコン」は箱の**外側・上**（線に重ねない）。
 *   書類＝紙片3枚をずらして重ねる（FIG. 03-A の角の折れた頁。後ろの2枚は見えている縁だけ描く）。
 *        SP は3枚を横に並べる。
 *   AI ＝正方形のチップ（外枠＋四辺に足5本ずつ＋内枠＋mono の「AI」）。同心の輪は光る時だけ見える。
 *   結果＝紙1枚（題の線＋本文の線3本）と、右下の小さな ✓。
 *   配線＝書類3枚の右端 → チップの左の足3本／チップの右の足 → 結果の紙。
 *   ケーブル＝箱の壁の口から外へ出て、**境界の手前でプラグ（胴＋刃2本）で終わる**。
 *   境界＝破線。その先に雲（08-A と同じ形）と「外」。雲から線が垂れ、先に差し込み口（穴2つ）。
 *        プラグと差し込み口の間が空いている＝抜けている。そのそばに「通信 0件」。
 *   文字は6語だけ：御社のパソコン／書類／AI／結果／外／通信 0件。×印・鍵・盾などの記号は足さない。
 *
 * ◆ 動き（画面に入ったら1回・総尺 約4.6秒）
 *   箱 → 札 → 前面の帯 → 書類3枚 → チップ（外枠→足→内枠→AI）→ 配線 → 光が1回走る →
 *   結果の紙 → ✓ → ケーブル → プラグ → 境界 → 雲 → 差し込み口 →「外」→「通信 0件」
 *   常時演出＝5秒周期。①光の点が 書類→チップ へ走り、チップの輪が一度光り、チップ→結果 へ走って
 *   ✓ の輪が一度光る。②半周期ずらして、光の点がケーブルを走り、**プラグの先で止まって**
 *   刃と胴の縁が 0.4 秒ともって消える（外へは出ない）。動くのは周期の約 1/3。
 *   InViewGate で画面内かつ前面タブのときだけ running。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset のみ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で正規化し、
 *   太さは vector-effect="non-scaling-stroke" で幅に依らず一定。輪は scale せず opacity で光らせる。
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示。
 */

const ARIA =
  "御社のパソコン本体を描いた図。書類が、パソコンの中にある AI の部品を通って結果になる。パソコンから外へ出るケーブルはプラグが抜けていて、境界の破線の先にある雲（外＝インターネット）の差し込み口にはつながっていない。通信は0件。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 常時演出の周期（秒） */
const CYCLE = 5;

/** 入場の時刻表（秒） */
const T = {
  case: 0,
  caseLabel: 0.12,
  chamber: 0.2,
  port: 0.5,
  foot: 0.55,
  power: 0.5,
  led: 0.58,
  groove: 0.62,
  sheet: 0.7,
  sheetStep: 0.08,
  fold: 0.9,
  docLabel: 0.9,
  docLine: 1.08,
  docLineStep: 0.05,
  chip: 1.15,
  leg: 1.4,
  legStep: 0.04,
  inner: 1.5,
  ai: 1.7,
  wire: 1.75,
  spark: 2.2,
  out: 2.5,
  paper: 2.95,
  resLabel: 3.0,
  paperFold: 3.15,
  title: 3.2,
  row: 3.28,
  rowStep: 0.08,
  check: 3.5,
  cable: 3.6,
  plug: 3.72,
  blade: 3.82,
  border: 3.7,
  cloud: 3.8,
  cord: 3.95,
  socket: 4.05,
  outTag: 4.05,
  zeroTag: 4.15,
};

/** ケーブルの組（光の点・プラグの縁）＝主の流れから半周期ずらす。初回は全部描き終わってから */
const T_CABLE = T.spark + CYCLE / 2;
/** ✓ の輪＝位相は主の流れと同じ。初回（✓ がまだ描かれていない）だけ 1 周期ぶん待つ */
const T_CHECK = T.spark + CYCLE;

/** 境界の破線＝dasharray は描線アニメに使うので、短い線分（長さ10・間隔8）の並びとして持つ（08-A と同じ） */
const dashV = (x: number, from: number, to: number, dash = 10, gap = 8) => {
  const out: string[] = [];
  for (let y = from; y + dash <= to; y += dash + gap) out.push(`M${x} ${y} V${y + dash}`);
  return out.join(" ");
};

const dashH = (y: number, from: number, to: number, dash = 10, gap = 8) => {
  const out: string[] = [];
  for (let x = from; x + dash <= to; x += dash + gap) out.push(`M${x} ${y} H${x + dash}`);
  return out.join(" ");
};

/* ==========================================================================
   PC（viewBox 1000×420）— 左→右へ流す。流れの軸は y=205
     箱（筐体） x  38→716 / y  60→350（角丸 10）。右の壁 y 291→309 が口（開いている）
     室         x  84→708 / y  68→342（角丸 4）＝壁の厚み 8・左の 46 が前面の帯
     足         y 356（x 64→104 ／ 650→690・2px）
     書類       x 136→256 / y 146→264（3枚・ずれ 12×20。手前の1枚 136→232 × 186→264）
     チップ     中心 (406,205)。外枠 96（358→454 × 157→253）・足 8・内枠 56（378→434 × 177→233）
     結果       x 556→656 / y 146→264
     ケーブル   口の端子 (701,300) → 732。プラグの胴 732→750・刃 750→762
     境界       縦の破線 x=780（y 44→368）＝08-A と同じ。刃の先 762｜18｜780｜18｜差し込み口 798
     差し込み口 x 798→816 / y 286→314。線は雲の底 (834,252) から垂れる
     雲         bbox x 792→968 / y 150→252（08-A と同じ）／外 (880,278)／通信 0件 (798,338)
   ========================================================================== */

/** 箱＝角丸 10。右の壁の口（y 291→309）で開いた1本の線 */
const PC_CASE =
  "M716 291 V70 A10 10 0 0 0 706 60 H48 A10 10 0 0 0 38 70 V340 A10 10 0 0 0 48 350 H706 A10 10 0 0 0 716 340 V309";
/** 室＝角丸 4。箱より 8 内側（左だけ 46＝前面の帯） */
const PC_CHAMBER =
  "M708 291 V72 A4 4 0 0 0 704 68 H88 A4 4 0 0 0 84 72 V338 A4 4 0 0 0 88 342 H704 A4 4 0 0 0 708 338 V309";
/** 壁の口＝外へ向いて開いたコの字（ケーブルの差し込み先） */
const PC_PORT = "M716 291 H694 V309 H716";
const PC_FEET = "M64 356 H104 M650 356 H690";
const PC_GROOVES = "M50 314 H72 M50 324 H72";

/** 書類＝3枚。後ろの2枚は「はみ出して見えている縁」だけを描く（並びは奥→手前＝描かれる順） */
const PC_SHEETS = [
  { d: "M160 166 V146 H242 L256 160 V224 H244", fold: "M242 146 V160 H256" },
  { d: "M148 186 V166 H230 L244 180 V244 H232", fold: "M230 166 V180 H244" },
  { d: "M136 186 H218 L232 200 V264 H136 Z", fold: "M218 186 V200 H232" },
] as const;
/** 手前の1枚の文字の線3本（長さがばらばら＝まだ整っていない） */
const PC_DOC_LINES = ["M148 212 h58", "M148 227 h44", "M148 242 h66"] as const;

/** 配線＝書類の右端（間隔 20）→ チップの左の足（間隔 16）。3本が並んだまま寄っていく。左→右の向きで描く */
const PC_WIRES = ["M256 214 H286 V189 H350", "M244 234 H302 V205 H350", "M232 254 H318 V221 H350"] as const;
const PC_PINS = [
  [256, 214],
  [244, 234],
  [232, 254],
] as const;
const PC_OUT = "M462 205 H556";

/** チップ＝外枠（左上の角だけ落とす＝向きの印）・内枠・四辺の足 */
const PC_CHIP = "M366 157 H454 V253 H358 V165 Z";
const PC_CHIP_INNER = "M378 177 H434 V233 H378 Z";
const PC_LEGS = [
  "M350 173 H358 M350 189 H358 M350 205 H358 M350 221 H358 M350 237 H358",
  "M374 149 V157 M390 149 V157 M406 149 V157 M422 149 V157 M438 149 V157",
  "M454 173 H462 M454 189 H462 M454 205 H462 M454 221 H462 M454 237 H462",
  "M374 253 V261 M390 253 V261 M406 253 V261 M422 253 V261 M438 253 V261",
] as const;

/** 結果＝紙1枚（角の折れ）＋題の線＋本文3本＋✓ */
const PC_PAPER = "M556 146 H640 L656 162 V264 H556 Z";
const PC_PAPER_FOLD = "M640 146 V162 H656";
const PC_TITLE = "M570 165 h46";
const PC_ROWS = ["M570 181 h72", "M570 197 h72", "M570 213 h54"] as const;
const PC_CHECK = "M622 240 L628 247 L641 231";

/** ケーブル（箱の口 → プラグ）。境界の手前で終わる＝つながっていない */
const PC_CABLE = "M704 300 H732";
const PC_PLUG = "M732 295 L737 287 H750 V313 H737 L732 305 Z";
const PC_BLADES = "M750 294 H762 M750 306 H762";
/** 光の点が走る線（口 → プラグの胴の先）と、そこでともる縁（胴の先＋刃2本） */
const PC_CABLE_RUN = "M704 300 H750";
const PC_BLOCK = "M750 287 V313 M750 294 H762 M750 306 H762";

const PC_BORDER = dashV(780, 44, 368);
/** 雲＝08-A と同じ輪郭（3つの円 C1(826,222)r34／C2(882,202)r52／C3(938,226)r30 と底辺 y=252） */
const PC_CLOUD =
  "M810 252 A34 34 0 0 1 831.78 188.5 A52 52 0 0 1 933.69 196.31 A30 30 0 0 1 952.97 252 Z";
/** 雲の底から垂れる線と、その先の差し込み口（左を向いた穴2つ＝刃と同じ高さ） */
const PC_CORD = "M834 252 V300 H816";
const PC_SOCKET = "M798 286 H816 V314 H798 V308 H808 V304 H798 V296 H808 V292 H798 Z";

/* ==========================================================================
   SP（viewBox 420×600＝縦に組み替え・境界は横の破線・雲は下）— 上→下へ流す。軸は x=210
     箱（筐体） x  14→406 / y  40→384（角丸 10）。下の壁 x 283→301 が口
     室         x  22→398 / y  72→376（角丸 4）＝上の 32 が前面の帯
     書類       3枚を横に並べる：x 44→136／164→256／284→376・y 106→162
     チップ     中心 (210,241)。外枠 84（168→252 × 199→283）・足 7・内枠 50（185→235 × 216→266）
     結果       x 150→270 / y 308→364
     ケーブル   口の端子 (292,373) → 398。プラグの胴 398→414・刃 414→424
     境界       横の破線 y=434（08-A と同じ）。刃の先 424｜10｜434｜10｜差し込み口 444
     差し込み口 x 278→306 / y 444→460。線は雲の肩 (292,500) から立ち上がる
     雲         bbox x 110→310 / y 452→562（08-A と同じ）／外 (210,586)／通信 0件 (318,458)
   ========================================================================== */

const SP_CASE =
  "M301 384 H396 A10 10 0 0 0 406 374 V50 A10 10 0 0 0 396 40 H24 A10 10 0 0 0 14 50 V374 A10 10 0 0 0 24 384 H283";
const SP_CHAMBER =
  "M301 376 H394 A4 4 0 0 0 398 372 V76 A4 4 0 0 0 394 72 H26 A4 4 0 0 0 22 76 V372 A4 4 0 0 0 26 376 H283";
const SP_PORT = "M283 384 V366 H301 V384";
const SP_GROOVES = "M356 52 H386 M356 60 H386";

/** 書類＝3枚を横に並べる（x0 は左端）。どれも角の折れた頁＋文字の線3本 */
const SP_SHEETS = [
  { x: 44, w: [56, 40, 62] },
  { x: 164, w: [44, 60, 50] },
  { x: 284, w: [60, 46, 38] },
] as const;
const spSheet = (x: number) => `M${x} 106 H${x + 78} L${x + 92} 120 V162 H${x} Z`;
const spFold = (x: number) => `M${x + 78} 106 V120 H${x + 92}`;
const SP_LINE_Y = [124, 136, 148] as const;

const SP_WIRES = ["M90 162 V172 H196 V192", "M210 162 V192", "M330 162 V172 H224 V192"] as const;
const SP_PINS = [
  [90, 162],
  [210, 162],
  [330, 162],
] as const;
const SP_OUT = "M210 290 V308";

const SP_CHIP = "M175 199 H252 V283 H168 V206 Z";
const SP_CHIP_INNER = "M185 216 H235 V266 H185 Z";
const SP_LEGS = [
  "M182 192 V199 M196 192 V199 M210 192 V199 M224 192 V199 M238 192 V199",
  "M161 213 H168 M161 227 H168 M161 241 H168 M161 255 H168 M161 269 H168",
  "M252 213 H259 M252 227 H259 M252 241 H259 M252 255 H259 M252 269 H259",
  "M182 283 V290 M196 283 V290 M210 283 V290 M224 283 V290 M238 283 V290",
] as const;

const SP_PAPER = "M150 308 H256 L270 322 V364 H150 Z";
const SP_PAPER_FOLD = "M256 308 V322 H270";
const SP_TITLE = "M162 320 h44";
const SP_ROWS = ["M162 332 h72", "M162 342 h72", "M162 352 h52"] as const;
const SP_CHECK = "M243 345 L248 351 L259 337";

const SP_CABLE = "M292 376 V398";
const SP_PLUG = "M287 398 L279 404 V414 H305 V404 L297 398 Z";
const SP_BLADES = "M286 414 V424 M298 414 V424";
const SP_CABLE_RUN = "M292 376 V414";
const SP_BLOCK = "M279 414 H305 M286 414 V424 M298 414 V424";

const SP_BORDER = dashH(434, 14, 406);
/** 雲＝08-A と同じ輪郭（C1(148,528)r38／C2(211,508)r56／C3(276,530)r34 と底辺 y=562） */
const SP_CLOUD =
  "M131.03 562 A38 38 0 0 1 157.57 491.23 A56 56 0 0 1 266.01 497.5 A34 34 0 0 1 287.49 562 Z";
/** 雲の右の肩（C3 の上・x=292 で y=500）から立ち上がる線と、上を向いた差し込み口 */
const SP_CORD = "M292 500 V460";
const SP_SOCKET = "M278 444 H284 V453 H288 V444 H296 V453 H300 V444 H306 V460 H278 Z";

export default function LocalAiDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  // 入場を仕込んでよいか。サーバーと reduced-motion では false＝CSS の既定（＝完成形）のまま静止。
  // effect 内の同期 setState を避けるため、共通フック（useSyncExternalStore）から読む
  const armed = useMotionAllowed();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!armed) return;

    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlaying(true);
          io.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);

  const stageClass = [styles.stage, armed ? styles.armed : "", playing ? styles.play : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={styles.fig} data-localai-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figNo} aria-hidden="true">
          FIG. 09-A
        </span>
        <span className={styles.figLabel}>AIも、御社のパソコンの中で動く</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      <div className={styles.frame}>
        {/* 常時演出（光の点）の器：画面内のあいだだけ running。className は不変にしておく
            （state 由来のクラスを同じ要素に載せると、再レンダーで .live が消える） */}
        <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
          <div ref={ref} className={stageClass}>
            {/* ===== PC ===== */}
            <svg
              className={styles.svgPc}
              viewBox="0 0 1000 420"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              {/* 四隅のトンボ */}
              <path
                className={styles.trim}
                d="M8 14 H20 M14 8 V20 M980 14 H992 M986 8 V20 M8 406 H20 M14 400 V412 M980 406 H992 M986 400 V412"
                aria-hidden="true"
              />

              {/* --- パソコン本体（箱＋室＋口＋足＋前面の帯） --- */}
              {/* ラベルは箱（上辺 y=60）の外側・上。線には一切重ねない */}
              <text className={`${styles.name} ${styles.fade}`} x={38} y={48} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.case}`}
                pathLength={100}
                style={at(T.case)}
                d={PC_CASE}
              />
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.chamber}`}
                pathLength={100}
                style={at(T.chamber)}
                d={PC_CHAMBER}
              />
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.chamber}`}
                  pathLength={100}
                  style={at(T.port)}
                  d={PC_PORT}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.foot}`}
                  pathLength={100}
                  style={at(T.foot)}
                  d={PC_FEET}
                />
                {/* 前面の帯：電源の丸＋灯＋横の溝2本 */}
                <circle className={`${styles.fade} ${styles.power}`} style={at(T.power)} cx={61} cy={90} r={7} />
                <circle className={`${styles.fade} ${styles.led}`} style={at(T.led)} cx={61} cy={111} r={1.8} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.groove}`}
                  pathLength={100}
                  style={at(T.groove)}
                  d={PC_GROOVES}
                />
              </g>

              {/* --- 書類：紙片3枚をずらして重ねる --- */}
              <text className={`${styles.name} ${styles.fade}`} x={160} y={138} style={at(T.docLabel)}>
                書類
              </text>
              <g aria-hidden="true">
                {PC_SHEETS.map((s, i) => (
                  <path
                    key={s.d}
                    className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                    pathLength={100}
                    style={at(T.sheet + i * T.sheetStep)}
                    d={s.d}
                  />
                ))}
                {PC_SHEETS.map((s, i) => (
                  <path
                    key={s.fold}
                    className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                    pathLength={100}
                    style={at(T.fold + i * T.sheetStep)}
                    d={s.fold}
                  />
                ))}
                {PC_DOC_LINES.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dFast} ${styles.data}`}
                    pathLength={100}
                    style={at(T.docLine + i * T.docLineStep)}
                    d={d}
                  />
                ))}
              </g>

              {/* --- 配線：書類3枚 → チップの左の足／チップの右の足 → 結果 --- */}
              <g aria-hidden="true">
                {PC_WIRES.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dSlow} ${styles.wire}`}
                    pathLength={100}
                    style={at(T.wire + i * 0.08)}
                    d={d}
                  />
                ))}
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wire}`}
                  pathLength={100}
                  style={at(T.out)}
                  d={PC_OUT}
                />
                {PC_PINS.map(([cx, cy], i) => (
                  <circle
                    key={cy}
                    className={`${styles.fade} ${styles.pin}`}
                    style={at(T.wire + i * 0.08)}
                    cx={cx}
                    cy={cy}
                    r={2.6}
                  />
                ))}

                {/* 光の点＝同じ線に重ねた短いダッシュを流す */}
                {PC_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={PC_OUT} />
              </g>

              {/* --- AI の部品：チップ（外枠→足→内枠→AI）。同心の輪は光る時だけ見える --- */}
              <g aria-hidden="true">
                <rect className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} x={344} y={143} width={124} height={124} rx={8} />
                <rect className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} x={336} y={135} width={140} height={140} rx={12} />
                <path
                  className={`${styles.d} ${styles.chipFrame}`}
                  pathLength={100}
                  style={at(T.chip)}
                  d={PC_CHIP}
                />
                {PC_LEGS.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dFast} ${styles.leg}`}
                    pathLength={100}
                    style={at(T.leg + i * T.legStep)}
                    d={d}
                  />
                ))}
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.chipInner}`}
                  pathLength={100}
                  style={at(T.inner)}
                  d={PC_CHIP_INNER}
                />
              </g>
              <text
                className={`${styles.chipText} ${styles.fade}`}
                x={407}
                y={211}
                textAnchor="middle"
                style={at(T.ai)}
              >
                AI
              </text>

              {/* --- 結果：紙1枚（題の線＋本文3本）と ✓ --- */}
              <text className={`${styles.name} ${styles.fade}`} x={556} y={138} style={at(T.resLabel)}>
                結果
              </text>
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.paper}`}
                  pathLength={100}
                  style={at(T.paper)}
                  d={PC_PAPER}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                  pathLength={100}
                  style={at(T.paperFold)}
                  d={PC_PAPER_FOLD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                  pathLength={100}
                  style={at(T.title)}
                  d={PC_TITLE}
                />
                {PC_ROWS.map((d, i) => (
                  <g key={d} className={styles.row} style={at(T.row + i * T.rowStep)}>
                    <path className={styles.cell} d={d} />
                  </g>
                ))}
                <circle className={`${styles.ring} ${styles.ringCheck}`} style={at(T_CHECK)} cx={631} cy={240} r={15} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.check}`}
                  pathLength={100}
                  style={at(T.check)}
                  d={PC_CHECK}
                />
              </g>

              {/* --- 外へのケーブル：箱の口から出て、境界の手前でプラグで終わる（抜けている） --- */}
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.cable)} cx={701} cy={300} r={2.6} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.cable}`}
                  pathLength={100}
                  style={at(T.cable)}
                  d={PC_CABLE}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.plug}`}
                  pathLength={100}
                  style={at(T.plug)}
                  d={PC_PLUG}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.blade}`}
                  pathLength={100}
                  style={at(T.blade)}
                  d={PC_BLADES}
                />
                <path
                  className={`${styles.spark} ${styles.sparkCable}`}
                  pathLength={100}
                  style={at(T_CABLE)}
                  d={PC_CABLE_RUN}
                />
                <path className={styles.block} style={at(T_CABLE)} d={PC_BLOCK} />

                {/* 境界・雲・雲から垂れる線と差し込み口 */}
                <path
                  className={`${styles.d} ${styles.dSlow} ${styles.border}`}
                  pathLength={100}
                  style={at(T.border)}
                  d={PC_BORDER}
                />
                <path
                  className={`${styles.d} ${styles.dCloud} ${styles.cloud}`}
                  pathLength={100}
                  style={at(T.cloud)}
                  d={PC_CLOUD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.cord}`}
                  pathLength={100}
                  style={at(T.cord)}
                  d={PC_CORD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.socket}`}
                  pathLength={100}
                  style={at(T.socket)}
                  d={PC_SOCKET}
                />
              </g>
              <text
                className={`${styles.name} ${styles.fade}`}
                x={880}
                y={278}
                textAnchor="middle"
                style={at(T.outTag)}
              >
                外
              </text>
              <text className={`${styles.name} ${styles.fade}`} x={798} y={338} style={at(T.zeroTag)}>
                通信 0件
              </text>
            </svg>

            {/* ===== SP ===== */}
            <svg
              className={styles.svgSp}
              viewBox="0 0 420 600"
              role="img"
              aria-label={ARIA}
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                className={styles.trim}
                d="M2 7 H12 M7 2 V12 M408 7 H418 M413 2 V12 M2 593 H12 M7 588 V598 M408 593 H418 M413 588 V598"
                aria-hidden="true"
              />

              {/* --- パソコン本体（箱＋室＋口＋前面の帯） --- */}
              <text className={`${styles.name} ${styles.fade}`} x={16} y={26} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.case}`}
                pathLength={100}
                style={at(T.case)}
                d={SP_CASE}
              />
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.chamber}`}
                pathLength={100}
                style={at(T.chamber)}
                d={SP_CHAMBER}
              />
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.chamber}`}
                  pathLength={100}
                  style={at(T.port)}
                  d={SP_PORT}
                />
                <circle className={`${styles.fade} ${styles.power}`} style={at(T.power)} cx={36} cy={56} r={6.5} />
                <circle className={`${styles.fade} ${styles.led}`} style={at(T.led)} cx={54} cy={56} r={1.8} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.groove}`}
                  pathLength={100}
                  style={at(T.groove)}
                  d={SP_GROOVES}
                />
              </g>

              {/* --- 書類：紙片3枚を横に並べる --- */}
              <text className={`${styles.name} ${styles.fade}`} x={44} y={98} style={at(T.docLabel)}>
                書類
              </text>
              <g aria-hidden="true">
                {SP_SHEETS.map((s, i) => (
                  <path
                    key={`p${s.x}`}
                    className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                    pathLength={100}
                    style={at(T.sheet + i * T.sheetStep)}
                    d={spSheet(s.x)}
                  />
                ))}
                {SP_SHEETS.map((s, i) => (
                  <path
                    key={`f${s.x}`}
                    className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                    pathLength={100}
                    style={at(T.fold + i * T.sheetStep)}
                    d={spFold(s.x)}
                  />
                ))}
                {SP_SHEETS.map((s, i) => (
                  <path
                    key={`l${s.x}`}
                    className={`${styles.d} ${styles.dFast} ${styles.data}`}
                    pathLength={100}
                    style={at(T.docLine + i * T.docLineStep)}
                    d={s.w.map((w, r) => `M${s.x + 10} ${SP_LINE_Y[r]} h${w}`).join(" ")}
                  />
                ))}
              </g>

              {/* --- 配線 --- */}
              <g aria-hidden="true">
                {SP_WIRES.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dSlow} ${styles.wire}`}
                    pathLength={100}
                    style={at(T.wire + i * 0.08)}
                    d={d}
                  />
                ))}
                <path className={`${styles.d} ${styles.dFast} ${styles.wire}`} pathLength={100} style={at(T.out)} d={SP_OUT} />
                {SP_PINS.map(([cx, cy], i) => (
                  <circle
                    key={cx}
                    className={`${styles.fade} ${styles.pin}`}
                    style={at(T.wire + i * 0.08)}
                    cx={cx}
                    cy={cy}
                    r={2.6}
                  />
                ))}

                {SP_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={SP_OUT} />
              </g>

              {/* --- AI の部品：チップ --- */}
              <g aria-hidden="true">
                <rect className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} x={156} y={187} width={108} height={108} rx={8} />
                <rect className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} x={149} y={180} width={122} height={122} rx={12} />
                <path
                  className={`${styles.d} ${styles.chipFrame}`}
                  pathLength={100}
                  style={at(T.chip)}
                  d={SP_CHIP}
                />
                {SP_LEGS.map((d, i) => (
                  <path
                    key={d}
                    className={`${styles.d} ${styles.dFast} ${styles.leg}`}
                    pathLength={100}
                    style={at(T.leg + i * T.legStep)}
                    d={d}
                  />
                ))}
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.chipInner}`}
                  pathLength={100}
                  style={at(T.inner)}
                  d={SP_CHIP_INNER}
                />
              </g>
              <text
                className={`${styles.chipText} ${styles.fade}`}
                x={211}
                y={248.5}
                textAnchor="middle"
                style={at(T.ai)}
              >
                AI
              </text>

              {/* --- 結果 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={284} y={343} style={at(T.resLabel)}>
                結果
              </text>
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.paper}`}
                  pathLength={100}
                  style={at(T.paper)}
                  d={SP_PAPER}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                  pathLength={100}
                  style={at(T.paperFold)}
                  d={SP_PAPER_FOLD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                  pathLength={100}
                  style={at(T.title)}
                  d={SP_TITLE}
                />
                {SP_ROWS.map((d, i) => (
                  <g key={d} className={styles.row} style={at(T.row + i * T.rowStep)}>
                    <path className={styles.cell} d={d} />
                  </g>
                ))}
                <circle className={`${styles.ring} ${styles.ringCheck}`} style={at(T_CHECK)} cx={251} cy={345} r={13} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.check}`}
                  pathLength={100}
                  style={at(T.check)}
                  d={SP_CHECK}
                />
              </g>

              {/* --- 外へのケーブル（SP は下へ）・境界（横の破線）・雲 --- */}
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.cable)} cx={292} cy={373} r={2.6} />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.cable}`}
                  pathLength={100}
                  style={at(T.cable)}
                  d={SP_CABLE}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.plug}`}
                  pathLength={100}
                  style={at(T.plug)}
                  d={SP_PLUG}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.blade}`}
                  pathLength={100}
                  style={at(T.blade)}
                  d={SP_BLADES}
                />
                <path
                  className={`${styles.spark} ${styles.sparkCable}`}
                  pathLength={100}
                  style={at(T_CABLE)}
                  d={SP_CABLE_RUN}
                />
                <path className={styles.block} style={at(T_CABLE)} d={SP_BLOCK} />

                <path
                  className={`${styles.d} ${styles.dSlow} ${styles.border}`}
                  pathLength={100}
                  style={at(T.border)}
                  d={SP_BORDER}
                />
                <path
                  className={`${styles.d} ${styles.dCloud} ${styles.cloud}`}
                  pathLength={100}
                  style={at(T.cloud)}
                  d={SP_CLOUD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.cord}`}
                  pathLength={100}
                  style={at(T.cord)}
                  d={SP_CORD}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.socket}`}
                  pathLength={100}
                  style={at(T.socket)}
                  d={SP_SOCKET}
                />
              </g>
              <text
                className={`${styles.name} ${styles.fade}`}
                x={210}
                y={586}
                textAnchor="middle"
                style={at(T.outTag)}
              >
                外
              </text>
              <text className={`${styles.name} ${styles.fade}`} x={318} y={458} style={at(T.zeroTag)}>
                通信 0件
              </text>
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
