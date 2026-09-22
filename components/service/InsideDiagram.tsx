"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./InsideDiagram.module.css";

/**
 * FIG. 08-A ＝「データは、御社のパソコンの中だけ」境界図
 * v2（2026-09-22・図解の憲法 §9-0／§9-C）＝ v1 の差し戻し（①左上が欠ける ②パソコンに見えない）を直した版。
 * v2.1（同日・あおきさん確認）＝右側の「境界・雲・外」がはっきり読めるよう階調と寸法を上げた版。
 *
 * /service の世界観（重＝線と図面）に合わせ、線画（ストローク）だけで描く。
 * 同じページの FIG. 03-A（UnifyDiagram）と同じ作法＝図題・枠・トンボ・色変数・時刻表・
 * armed/play・InViewGate の .live・reduced-motion。窓の中は 03-A の縮小版をそのまま流用する。
 *
 *   器＝ディスプレイ：画面（角丸4の矩形）を**ベゼル**（画面より 10px 大きい角丸矩形）で囲み、
 *       下に**スタンド**（首＝短い台形／台＝幅の広い 2px の横線）を付ける。
 *       ラベル「御社のパソコン」は**ベゼルの外側・上**（線に重ねない＝v1 の左上の欠けを断つ）。
 *   画面の中＝「ブラウザ」の窓（上辺に細い帯＋小さな丸3つ）
 *   窓の中＝CSV／Excel／PDF の紙片 → 配線 → 節点 → 「管理表」（FIG. 03-A の縮小版）
 *   境界＝ベゼルの右（SP は下）に破線。その先に**雲**（実線 1px・下辺が平らで上に大小3つの丸い山）
 *        ＝インターネット側。雲の下に「外」。雲の中には何も描かない。
 *
 * 動き（画面に入ったら1回・総尺 約4.8秒）：
 *   ①ベゼル → ②画面 → ③スタンド → ④ブラウザの窓と帯 → ⑤紙片（CSV/Excel/PDF）→ ⑥配線 →
 *   ⑦節点 → ⑧管理表の行が埋まる → ⑨境界の破線 → ⑩雲が描かれ「外」が出る
 *   以後の常時演出＝5秒周期。前半で紙片→節点→管理表へ光の点が流れ、続けて管理表から外へ
 *   向かう点が**画面の右端（ベゼルの内側）で止まり**、縁に短い光が 0.4 秒ともって消える。
 *   雲側には何も届かない。動くのは周期の約 1/3（残りは休む）。
 *   InViewGate で画面内かつ前面タブのときだけ running。
 *
 * 互換：動かすのは transform(2D)・opacity・stroke-dashoffset のみ。
 *   filter / blend / 3D / SMIL / offset-path は使わない。線は pathLength="100" で正規化し、
 *   太さは vector-effect="non-scaling-stroke" で幅に依らず一定（1px と 2px の二段だけ）。
 *   JS 無し・prefers-reduced-motion: reduce ＝ 完成形の静止表示。
 */

const ARIA =
  "御社のパソコンのディスプレイを描いた図。画面の中のブラウザだけで、CSV・Excel・PDF が1つの管理表にまとまる。管理表から外へ向かった光は画面の端で止まり、境界の破線の先にある雲（外＝インターネット）へは出ない。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 常時演出の周期（秒）。境界へ向かう組は 1 周期ぶん遅らせる＝位相は同じで、初回だけ描き終わりを待つ */
const CYCLE = 5;

/** 入場の時刻表（秒） */
const T = {
  bezel: 0,
  caseLabel: 0.15,
  screen: 0.3,
  stand: 0.5,
  base: 0.6,
  win: 0.72,
  band: 0.95,
  chip: 1.08,
  winTag: 1.12,
  csvTag: 1.22,
  csvFrame: 1.26,
  csvRow: 1.44,
  csvStep: 0.06,
  xlsTag: 1.34,
  xlsFrame: 1.38,
  xlsGrid: 1.56,
  xlsTick: 1.7,
  pdfTag: 1.46,
  pdfFrame: 1.5,
  pdfLine: 1.78,
  wire: 2.0,
  spark: 2.55,
  node: 2.7,
  out: 2.8,
  table: 3.1,
  tableName: 3.15,
  tableHead: 3.38,
  row: 3.52,
  rowStep: 0.13,
  border: 3.85,
  cloud: 4.15,
  esc: 4.2,
  outTag: 4.45,
};

/** 線分の並び（[開始x, 長さ]）を1本のパスへ。桁の抽象を表す */
const seg = (y: number, list: readonly (readonly [number, number])[]) =>
  list.map(([x, w]) => `M${x} ${y} h${w}`).join(" ");

/** 破線の境界＝dasharray は描線アニメに使うので、短い線分（長さ10・間隔8）の並びとして持つ */
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
   PC（viewBox 1000×420）
     ベゼル   x  38→746 / y  44→364（角丸 10）
     画面     x  48→736 / y  54→354（角丸 4・ベゼルより 10px 内側）
     スタンド 首 y 364→392（台形）／台 y 398（x 292→492・2px）
     窓       x  62→722 / y  68→340（帯 y=96）
     境界     縦の破線 x=780（y 44→360）
     雲       bbox x 792→968（幅176）/ y 150→252（高さ102）・中心 x=880
              ＝ベゼル右端 746｜34｜破線 780｜12｜雲 792 … 968｜12｜トンボ 980（左右対称）
     外       (880, 278) Noto 13px
   ========================================================================== */

/** 画面＝角丸 4 の矩形 */
const PC_SCREEN =
  "M52 54 H732 A4 4 0 0 1 736 58 V350 A4 4 0 0 1 732 354 H52 A4 4 0 0 1 48 350 V58 A4 4 0 0 1 52 54 Z";
/** ベゼル＝画面より 10px 大きい角丸矩形 */
const PC_BEZEL =
  "M48 44 H736 A10 10 0 0 1 746 54 V354 A10 10 0 0 1 736 364 H48 A10 10 0 0 1 38 354 V54 A10 10 0 0 1 48 44 Z";
/** スタンドの首＝短い台形（上辺はベゼルの下辺と重ねない） */
const PC_STAND = "M358 364 L344 392 H440 L426 364";
/** スタンドの台＝幅の広い 2px の横線 */
const PC_BASE = "M292 398 H492";

/** CSV の紙片＝桁の位置がそろっていないカンマ区切り */
const PC_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 147, s: [[84, 18], [108, 10], [124, 14], [146, 20]] },
  { y: 158, s: [[84, 12], [102, 22], [130, 16], [152, 16]] },
  { y: 169, s: [[84, 20], [110, 12], [128, 20], [154, 14]] },
];

const PC_XLS_TICKS = [
  seg(227, [[82, 12], [108, 14], [160, 12]]),
  seg(243, [[82, 14], [134, 12], [160, 14]]),
].join(" ");

/** 配線（左→右の向きで描く＝描線も光もこの向きに進む） */
const PC_WIRES = ["M180 158 H252 V226 H312", "M180 226 H312", "M180 294 H252 V226 H312"] as const;
const PC_OUT = "M336 226 H400";
/** 管理表 → 外へ向かう線。画面の右端（x=736＝ベゼルの内側）の手前で終わる＝出ない */
const PC_ESC = "M708 226 H734";
/** 画面の右端でともる短い光（0.4s） */
const PC_BLOCK = "M736 206 V246";
/** 境界の破線（ベゼルの右） */
const PC_BORDER = dashV(780, 44, 368);
/**
 * 雲＝インターネット側（実線 1px）。下辺が平らで、上に大小3つの丸い山。
 * 3つの円 C1(826,222)r34 ／ C2(882,202)r52 ／ C3(938,226)r30 と底辺 y=252 の和集合の輪郭を
 * 交点から算出した円弧3本＋底辺の閉じたパス（山の頂＝(826,188)／(882,150)／(938,196)）。
 */
const PC_CLOUD =
  "M810 252 A34 34 0 0 1 831.78 188.5 A52 52 0 0 1 933.69 196.31 A30 30 0 0 1 952.97 252 Z";

const PC_COL_X = [410, 487, 564, 641] as const;
const PC_ROW_Y = [192, 240, 288] as const;
const PC_ROW_W: readonly (readonly number[])[] = [
  [52, 34, 56, 36],
  [44, 40, 48, 32],
  [56, 30, 58, 36],
];

/* ==========================================================================
   SP（viewBox 420×600＝縦に組み替え・境界は横の破線・雲は下）
     ベゼル   x  14→406 / y  40→392（角丸 10）
     画面     x  24→396 / y  50→382（角丸 4）
     スタンド 首 y 392→410 ／台 y 416（x 150→270・2px）
     窓       x  32→388 / y  60→372（帯 y=88）
     境界     横の破線 y=434（x 14→402）
     雲       bbox x 110→310（幅200）/ y 452→562（高さ110）・中心 x=210
     外       (210, 586) Noto 16.5px
   ========================================================================== */

const SP_SCREEN =
  "M28 50 H392 A4 4 0 0 1 396 54 V378 A4 4 0 0 1 392 382 H28 A4 4 0 0 1 24 378 V54 A4 4 0 0 1 28 50 Z";
const SP_BEZEL =
  "M24 40 H396 A10 10 0 0 1 406 50 V382 A10 10 0 0 1 396 392 H24 A10 10 0 0 1 14 382 V50 A10 10 0 0 1 24 40 Z";
const SP_STAND = "M186 392 L177 410 H243 L234 392";
const SP_BASE = "M150 416 H270";

const SP_CSV: readonly { y: number; s: readonly (readonly [number, number])[] }[] = [
  { y: 128, s: [[50, 22], [78, 12], [96, 18], [120, 14]] },
  { y: 139, s: [[50, 14], [70, 26], [102, 20], [128, 12]] },
  { y: 150, s: [[50, 24], [80, 14], [100, 22], [128, 12]] },
];

const SP_XLS_TICKS = [
  seg(141, [[164, 16], [190, 14], [242, 16]]),
  seg(157, [[164, 14], [216, 16], [242, 14]]),
].join(" ");

const SP_WIRES = ["M94 162 V184 H210 V194", "M210 162 V194", "M328 162 V184 H210 V194"] as const;
const SP_OUT = "M210 218 V234";
/** 管理表 → 外へ向かう線。画面の下端（y=382）の手前で終わる＝出ない */
const SP_ESC = "M210 360 V380";
const SP_BLOCK = "M186 382 H234";
const SP_BORDER = dashH(434, 14, 406);
/** 雲＝C1(148,528)r38 ／ C2(211,508)r56 ／ C3(276,530)r34 と底辺 y=562 の和集合（山の頂 490／452／496） */
const SP_CLOUD =
  "M131.03 562 A38 38 0 0 1 157.57 491.23 A56 56 0 0 1 266.01 497.5 A34 34 0 0 1 287.49 562 Z";

const SP_COL_X = [50, 135, 220, 305] as const;
const SP_ROW_Y = [277, 310, 344] as const;
const SP_ROW_W: readonly (readonly number[])[] = [
  [58, 40, 62, 42],
  [50, 46, 54, 38],
  [62, 36, 64, 42],
];

export default function InsideDiagram() {
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
    <figure className={styles.fig} data-inside-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figNo} aria-hidden="true">
          FIG. 08-A
        </span>
        <span className={styles.figLabel}>データは、御社のパソコンの中だけ</span>
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

              {/* --- ディスプレイ（ベゼル＋画面＋スタンド） --- */}
              {/* ラベルはベゼル（上辺 y=44）の外側・上。線には一切重ねない */}
              <text className={`${styles.name} ${styles.fade}`} x={38} y={32} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.bezel}`}
                pathLength={100}
                style={at(T.bezel)}
                d={PC_BEZEL}
              />
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.screen}`}
                pathLength={100}
                style={at(T.screen)}
                d={PC_SCREEN}
              />
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.stand}`}
                  pathLength={100}
                  style={at(T.stand)}
                  d={PC_STAND}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.base}`}
                  pathLength={100}
                  style={at(T.base)}
                  d={PC_BASE}
                />
              </g>

              {/* --- 画面の中：ブラウザの窓（上辺の帯＋小さな丸3つ） --- */}
              <path
                className={`${styles.d} ${styles.win}`}
                pathLength={100}
                style={at(T.win)}
                d="M62 68 H722 V340 H62 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.band}`}
                pathLength={100}
                style={at(T.band)}
                d="M62 96 H722"
              />
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip)} cx={78} cy={82} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.06)} cx={90} cy={82} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.12)} cx={102} cy={82} r={3} />
              </g>
              <text className={`${styles.tag} ${styles.tagJa}`} x={118} y={86} style={at(T.winTag)}>
                ブラウザ
              </text>

              {/* --- 窓の中 01：CSV の紙片 --- */}
              <text className={styles.tag} x={76} y={129} style={at(T.csvTag)}>
                CSV
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.csvFrame)}
                d="M76 135 H180 V181 H76 Z"
              />
              {PC_CSV.map((r, i) => (
                <path
                  key={r.y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.csvRow + i * T.csvStep)}
                  d={seg(r.y, r.s)}
                />
              ))}

              {/* --- 窓の中 02：Excel の紙片（升目） --- */}
              <text className={styles.tag} x={76} y={197} style={at(T.xlsTag)}>
                Excel
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.xlsFrame)}
                d="M76 203 H180 V249 H76 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M102 203 V249 M128 203 V249 M154 203 V249 M76 218 H180 M76 234 H180"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={seg(212, [[82, 14], [108, 12], [134, 14], [160, 12]])}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick + 0.1)}
                d={PC_XLS_TICKS}
              />

              {/* --- 窓の中 03：PDF の紙片（角の折れた頁） --- */}
              <text className={styles.tag} x={76} y={265} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M76 271 H164 L180 287 V317 H76 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.22)}
                d="M164 271 V287 H180"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M84 282 h50"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d="M84 295 h78 M84 307 h62"
              />

              {/* --- 配線：3本が節点へ集まり、1本になって管理表へ --- */}
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
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={180} cy={158} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={180} cy={226} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={180} cy={294} r={2.6} />

                {/* 光の点＝同じ線に重ねた短いダッシュを流す */}
                {PC_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={PC_OUT} />

                {/* 節点 */}
                <g transform="translate(324 226)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={12} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={18} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -8 L8 0 L0 8 L-8 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.4} />
                </g>
              </g>

              {/* --- 窓の中 04：小さな管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={400} y={133} style={at(T.tableName)}>
                管理表
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d="M400 141 H708 V311 H400 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M477 141 V311 M554 141 V311 M631 141 V311 M400 216 H708 M400 264 H708"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.24)}
                d="M400 169 H708"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(160, [[410, 46], [487, 34], [564, 46], [641, 34]])}
              />
              {PC_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, PC_COL_X.map((x, c) => [x, PC_ROW_W[i][c]] as const))} />
                </g>
              ))}

              {/* --- 境界：ここから先へは出ない --- */}
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wireDim}`}
                  pathLength={100}
                  style={at(T.esc)}
                  d={PC_ESC}
                />
                <path
                  className={`${styles.spark} ${styles.sparkEsc}`}
                  pathLength={100}
                  style={at(T.spark + CYCLE)}
                  d={PC_ESC}
                />
                <path className={styles.block} style={at(T.spark + CYCLE)} d={PC_BLOCK} />
                <path
                  className={`${styles.d} ${styles.dSlow} ${styles.border}`}
                  pathLength={100}
                  style={at(T.border)}
                  d={PC_BORDER}
                />
                {/* 雲＝インターネット側（実線・描線で出る。中には何も描かない） */}
                <path
                  className={`${styles.d} ${styles.dCloud} ${styles.cloud}`}
                  pathLength={100}
                  style={at(T.cloud)}
                  d={PC_CLOUD}
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

              {/* --- ディスプレイ（ベゼル＋画面＋スタンド） --- */}
              <text className={`${styles.name} ${styles.fade}`} x={16} y={26} style={at(T.caseLabel)}>
                御社のパソコン
              </text>
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.bezel}`}
                pathLength={100}
                style={at(T.bezel)}
                d={SP_BEZEL}
              />
              <path
                className={`${styles.d} ${styles.dSlow} ${styles.screen}`}
                pathLength={100}
                style={at(T.screen)}
                d={SP_SCREEN}
              />
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.stand}`}
                  pathLength={100}
                  style={at(T.stand)}
                  d={SP_STAND}
                />
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.base}`}
                  pathLength={100}
                  style={at(T.base)}
                  d={SP_BASE}
                />
              </g>

              {/* --- 画面の中：ブラウザの窓 --- */}
              <path className={`${styles.d} ${styles.win}`} pathLength={100} style={at(T.win)} d="M32 60 H388 V372 H32 Z" />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.band}`}
                pathLength={100}
                style={at(T.band)}
                d="M32 88 H388"
              />
              <g aria-hidden="true">
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip)} cx={48} cy={74} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.06)} cx={60} cy={74} r={3} />
                <circle className={`${styles.fade} ${styles.chip}`} style={at(T.chip + 0.12)} cx={72} cy={74} r={3} />
              </g>
              <text className={`${styles.tag} ${styles.tagJa}`} x={88} y={79} style={at(T.winTag)}>
                ブラウザ
              </text>

              {/* --- 窓の中 01：CSV --- */}
              <text className={styles.tag} x={42} y={110} style={at(T.csvTag)}>
                CSV
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.csvFrame)}
                d="M42 116 H146 V162 H42 Z"
              />
              {SP_CSV.map((r, i) => (
                <path
                  key={r.y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.csvRow + i * T.csvStep)}
                  d={seg(r.y, r.s)}
                />
              ))}

              {/* --- 窓の中 02：Excel --- */}
              <text className={styles.tag} x={158} y={110} style={at(T.xlsTag)}>
                Excel
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.xlsFrame)}
                d="M158 116 H262 V162 H158 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.xlsGrid)}
                d="M184 116 V162 M210 116 V162 M236 116 V162 M158 131 H262 M158 147 H262"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.xlsTick)}
                d={seg(126, [[164, 14], [190, 16], [216, 14], [242, 14]])}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.xlsTick + 0.1)}
                d={SP_XLS_TICKS}
              />

              {/* --- 窓の中 03：PDF --- */}
              <text className={styles.tag} x={274} y={110} style={at(T.pdfTag)}>
                PDF
              </text>
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.pdfFrame)}
                d="M274 116 H366 L382 132 V162 H274 Z"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.pdfFrame + 0.22)}
                d="M366 116 V132 H382"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.pdfLine)}
                d="M282 126 h44"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.pdfLine + 0.12)}
                d="M282 140 h84 M282 152 h66"
              />

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
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire)} cx={94} cy={162} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.08)} cx={210} cy={162} r={2.6} />
                <circle className={`${styles.fade} ${styles.pin}`} style={at(T.wire + 0.16)} cx={328} cy={162} r={2.6} />

                {SP_WIRES.map((d) => (
                  <path key={`s${d}`} className={`${styles.spark} ${styles.sparkIn}`} pathLength={100} style={at(T.spark)} d={d} />
                ))}
                <path className={`${styles.spark} ${styles.sparkOut}`} pathLength={100} style={at(T.spark)} d={SP_OUT} />

                <g transform="translate(210 206)">
                  <circle className={`${styles.ring} ${styles.ring1}`} style={at(T.spark)} cx={0} cy={0} r={12} />
                  <circle className={`${styles.ring} ${styles.ring2}`} style={at(T.spark)} cx={0} cy={0} r={18} />
                  <path
                    className={`${styles.d} ${styles.dFast} ${styles.node}`}
                    pathLength={100}
                    style={at(T.node)}
                    d="M0 -8 L8 0 L0 8 L-8 0 Z"
                  />
                  <circle className={`${styles.fade} ${styles.dot}`} style={at(T.node + 0.18)} cx={0} cy={0} r={2.4} />
                </g>
              </g>

              {/* --- 窓の中 04：小さな管理表 --- */}
              <text className={`${styles.name} ${styles.fade}`} x={40} y={227} style={at(T.tableName)}>
                管理表
              </text>
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d="M40 234 H380 V360 H40 Z"
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.table + 0.16)}
                d="M125 234 V360 M210 234 V360 M295 234 V360 M40 293 H380 M40 327 H380"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.headRule}`}
                pathLength={100}
                style={at(T.table + 0.24)}
                d="M40 260 H380"
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={seg(251, [[50, 58], [135, 44], [220, 58], [305, 44]])}
              />
              {SP_ROW_Y.map((y, i) => (
                <g key={y} className={styles.row} style={at(T.row + i * T.rowStep)}>
                  <path className={styles.cell} d={seg(y, SP_COL_X.map((x, c) => [x, SP_ROW_W[i][c]] as const))} />
                </g>
              ))}

              {/* --- 境界（SP は横の破線・雲は下） --- */}
              <g aria-hidden="true">
                <path
                  className={`${styles.d} ${styles.dFast} ${styles.wireDim}`}
                  pathLength={100}
                  style={at(T.esc)}
                  d={SP_ESC}
                />
                <path
                  className={`${styles.spark} ${styles.sparkEsc}`}
                  pathLength={100}
                  style={at(T.spark + CYCLE)}
                  d={SP_ESC}
                />
                <path className={styles.block} style={at(T.spark + CYCLE)} d={SP_BLOCK} />
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
            </svg>
          </div>
        </InViewGate>
      </div>
    </figure>
  );
}
