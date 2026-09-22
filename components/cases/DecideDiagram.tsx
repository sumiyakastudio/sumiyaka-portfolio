"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import InViewGate from "@/components/animation/InViewGate";
import { useMotionAllowed } from "@/lib/useMediaQuery";
import styles from "./DecideDiagram.module.css";

/**
 * 「機械が出し、人が決める」の図（/cases「人が決めるところ」）— v2（2026-09-22）
 *
 * ◆ v1 からの作り直し（憲法 §9-0・§9-D）
 *   v1 は駅が「小さな四角」だけで、線と文字しか無く意味が読めなかった。
 *   v2 は駅をすべて**見て分かる具体物**に置き換え、部品は FIG. 03-A
 *   （components/service/UnifyDiagram.tsx）の紙片・升目・配線・管理表から流用している。
 *
 * ◆ 静止画だけで読めること
 *   集める＝紙が3枚ずれて重なる（中身の行はばらばらの長さ＝まだ揃っていない）
 *   揃える＝升目の表（4列×3行・どの桁も同じ長さで揃っている）
 *   出す  ＝上に太い見出し線のある紙（＝出来上がった書類）
 *   ここまでの3つに細い括弧線を掛け、mono で「機械」。
 *   人が決める＝角丸の印（2px・この図でいちばん強い線）の中に「✓」。
 *              その上に人のピクトグラム（頭＝円 r=8／肩＝半円弧 幅32・1px）。
 *   使う  ＝ブラウザの窓（上の帯＋丸3つ＋中に箱1つ）。
 *
 * ◆ 動き（憲法 §9-D）
 *   入場では、印の枠のすぐあと（T=2.52s）に「✓」が描かれ、**そのまま残る**。
 *   ＝いつ見ても印の中には✓があり、印が空に見えることはない。
 *   常時演出では、光の点が 集める→揃える→出す と区間ごとに走り（間の物の中では
 *   見えない＝通過中）、印の手前で止まる。そこで**同心の輪が一度ふっと明るくなるだけ**
 *   （既に描かれている✓の上で光る＝✓は消さない・描き直さない）。そのあと点が
 *   「使う」へ進んで消える。周期 5.5 秒（動くのは前半だけ＝残りは休む）。
 *   SP は折り返しの配線が長いので、その区間だけ長い尺で走らせ、輪と退出は
 *   インラインの animation-delay を 0.63 秒ずらして位相を合わせている（keyframes は共通）。
 *
 * ◆ 文字は6語だけ（集める／揃える／出す／機械／人が決める／使う）。いずれも節の既存語。
 *   社名・金額・日付・道具名は描かない。数字も置かない（数字は「測り方」の図の担当）。
 *
 * ◆ 色は /cases の紙のトークンだけ（--cs-ink / --cs-ink-2 / --cs-ink-3 /
 *   --cs-line / --cs-line-strong / --cs-paper）。朱 --cs-seal は「実測」の印だけの
 *   決まりなので、この図では使わない。器は MeasureDiagram と同じ紙の板＋罫の枠。
 *
 * ◆ 互換：動かすのは transform(2D)・opacity・stroke-dashoffset だけ。
 *   filter / backdrop-filter のアニメ・mix-blend-mode・3D transform・SMIL・
 *   offset-path・複雑な clip-path・vw フォントは使わない。線は pathLength={100} で
 *   正規化し、太さは vector-effect: non-scaling-stroke で拡大率に依らず一定。
 *   輪は scale ではなく opacity で光らせる（WebKit で線が太るため）。
 *   丸（ブラウザの操作丸）は pathLength を使わず opacity で出す（WebKit 対策）。
 *
 * ◆ 既定（クラス無し・SSR・JS 無し・prefers-reduced-motion: reduce）＝完成形の静止。
 *   「✓」も描かれた状態で止まる。JS が載って useMotionAllowed() が true のときだけ
 *   .armed（初期状態）を被せ、画面に 18% 入ったら .play。常時演出は InViewGate の
 *   .live が付いているあいだだけ running（CSS の既定は animation-play-state: paused）。
 *
 * ◆ ScrollReveal では包まない（自前の入場を持つ＝transform の二重掛けを避ける）。
 */

const ARIA =
  "集める・揃える・出すの3つは機械が受け持ち、その結果を使うかどうかは人が決める、という流れの図。";

/** アニメーションの開始時刻（秒）を渡す。インライン style は CSS より強いので遅延だけ上書きできる */
const at = (sec: number): CSSProperties => ({ animationDelay: `${sec}s` });

/** 線分の並び（[開始x, 長さ]）を1本のパスへ。表の「桁」を表す（FIG. 03-A と同じ作法） */
const seg = (y: number, list: readonly (readonly [number, number])[]) =>
  list.map(([x, w]) => `M${x} ${y} h${w}`).join(" ");

/**
 * 入場の時刻表（秒）。左→右に、物が描かれてから配線が伸びる。総尺 約3.7秒。
 * cycle 以降は常時演出（光の点・輪・✓）の基準時刻。
 */
const T = {
  /* 集める＝3枚の紙 */
  sheet3: 0,
  sheet2: 0.12,
  sheet1: 0.24,
  sheetLine: 0.46,
  lb1: 0.62,
  w1: 0.52,
  /* 揃える＝升目の表 */
  table: 0.74,
  tableGrid: 0.92,
  tableHead: 1.04,
  tableRow: 1.14,
  rowStep: 0.1,
  lb2: 1.26,
  w2: 1.22,
  /* 出す＝見出し線のある紙 */
  doc: 1.44,
  docTitle: 1.62,
  docBody: 1.72,
  lb3: 1.88,
  /* 機械の括弧線 */
  brace: 1.94,
  tag: 2.06,
  /* 人が決める＝人＋印 */
  w3: 1.96,
  person: 2.18,
  seal: 2.36,
  /** 「✓」は入場で描き、そのまま残す（＝いつ見ても印の中に✓がある） */
  check: 2.52,
  lb4: 2.58,
  /* 使う＝ブラウザの窓 */
  w4: 2.64,
  win: 2.82,
  winBar: 2.98,
  winDot: 3.06,
  winBox: 3.14,
  lb5: 3.3,
  /** 常時演出の基準時刻 */
  cycle: 3.5,
  /** 区間ごとに光の点をずらす間隔（物の中を通っているあいだの「溜め」を含む） */
  gap: 0.66,
  /** SP は折り返しが長いので、輪・✓・退出をこのぶん後ろへずらして位相を合わせる */
  spFold: 0.63,
} as const;

type Label = { x: number; y: number; s: string; t: number };

/* ==========================================================================
   PC（viewBox 800×220）— 横一列。配線の高さは y=115
   x：集める 42–122／揃える 190–300／出す 368–442／印 510–576／使う 644–758
   ========================================================================== */

/** 機械の受け持ちを囲う括弧線（左の3つの上） */
const PC_BRACE = "M34 54 V44 H450 V54";

/** 集める＝紙が3枚ずれて重なる。後ろの2枚は「はみ出して見えている縁」だけを描く */
const PC_SHEET3 = "M60 84 V75 H122 V137 H113";
const PC_SHEET2 = "M51 93 V84 H113 V146 H104";
const PC_SHEET1 = "M42 93 H104 V155 H42 Z";
/** 中身＝長さのそろわない行（＝まだ揃っていない） */
const PC_SHEET_LINES = "M52 110 h42 M52 126 h34 M52 142 h44";

/** 揃える＝升目の表（4列×3行） */
const PC_TABLE = "M190 79 H300 V151 H190 Z";
const PC_TABLE_GRID =
  "M217 79 V151 M245 79 V151 M273 79 V151 M190 103 H300 M190 127 H300";
const PC_TICK_X = [196, 223, 251, 279] as const;
const pcTicks = (y: number) => seg(y, PC_TICK_X.map((x) => [x, 15] as const));
const PC_TABLE_ROW_Y = [115, 139] as const;

/** 出す＝上に太い見出し線のある紙 */
const PC_DOC = "M368 79 H442 V151 H368 Z";
const PC_DOC_TITLE = "M376 93 h54";
const PC_DOC_RULE = "M368 105 H442";
const PC_DOC_BODY = "M376 118 h58 M376 130 h58 M376 142 h40";

/** 人が決める＝人のピクトグラム（頭 r=8・肩 半円弧 幅32）＋角丸の印＋✓ */
const PC_HEAD = "M535 34 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0";
const PC_SHOULDER = "M527 63 A16 16 0 0 1 559 63";
const PC_SEAL =
  "M518 90 H568 A8 8 0 0 1 576 98 V132 A8 8 0 0 1 568 140 H518 A8 8 0 0 1 510 132 V98 A8 8 0 0 1 518 90 Z";
/** ✓＝印の中央に、印の幅の約55%（36）×高さの約45%（22）。中心 (543,115) */
const PC_CHECK = "M525 115 L536 126 L561 104";

/** 使う＝ブラウザの窓（帯＋丸3つ＋箱1つ） */
const PC_WIN = "M644 79 H758 V151 H644 Z";
const PC_WIN_BAR = "M644 99 H758";
const PC_WIN_DOT_X = [655, 667, 679] as const;
const PC_WIN_BOX = "M658 112 H744 V139 H658 Z";

/** 配線（物と物のあいだだけを結ぶ） */
const PC_WIRES: readonly { d: string; t: number }[] = [
  { d: "M122 115 H190", t: T.w1 },
  { d: "M300 115 H368", t: T.w2 },
  { d: "M442 115 H510", t: T.w3 },
  { d: "M576 115 H644", t: T.w4 },
];

/** 光の点が走る区間（印の手前まで）。印から先は PC_EXIT */
const PC_RUNS = ["M122 115 H190", "M300 115 H368", "M442 115 H510"] as const;
const PC_EXIT = "M576 115 H644";

const PC_LABELS: readonly Label[] = [
  { x: 82, y: 184, s: "集める", t: T.lb1 },
  { x: 245, y: 184, s: "揃える", t: T.lb2 },
  { x: 405, y: 184, s: "出す", t: T.lb3 },
  { x: 701, y: 184, s: "使う", t: T.lb5 },
];

/* ==========================================================================
   SP（viewBox 420×320）— 2段に組み替える（縮小ではなく並べ替え）
   上段＝機械の3つ（配線の高さ y=78）／下段＝印と窓（y=239）
   人は SP の縮尺（約0.75倍）に合わせて頭 r=10・肩 幅40（＝PC の 1.25〜1.35 倍）
   ========================================================================== */

const SP_BRACE = "M10 42 V34 H328 V42";

const SP_SHEET3 = "M28 56 V50 H78 V94 H72";
const SP_SHEET2 = "M22 62 V56 H72 V100 H66";
const SP_SHEET1 = "M16 62 H66 V106 H16 Z";
const SP_SHEET_LINES = "M23 74 h32 M23 86 h24 M23 98 h34";

const SP_TABLE = "M112 50 H222 V106 H112 Z";
const SP_TABLE_GRID =
  "M139 50 V106 M167 50 V106 M194 50 V106 M112 69 H222 M112 88 H222";
const SP_TICK_X = [118, 145, 173, 200] as const;
const spTicks = (y: number) => seg(y, SP_TICK_X.map((x) => [x, 15] as const));
const SP_TABLE_ROW_Y = [78, 97] as const;

const SP_DOC = "M256 50 H322 V106 H256 Z";
const SP_DOC_TITLE = "M263 63 h48";
const SP_DOC_RULE = "M256 73 H322";
const SP_DOC_BODY = "M263 85 h50 M263 96 h34";

const SP_HEAD = "M100 160 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0";
const SP_SHOULDER = "M90 195 A20 20 0 0 1 130 195";
const SP_SEAL =
  "M82 212 H138 A8 8 0 0 1 146 220 V258 A8 8 0 0 1 138 266 H82 A8 8 0 0 1 74 258 V220 A8 8 0 0 1 82 212 Z";
/** ✓＝PC と同じ比率（印 72×54 の約55%×45%＝40×24）。中心 (110,239) */
const SP_CHECK = "M90 239 L102 251 L130 227";

const SP_WIN = "M244 212 H372 V266 H244 Z";
const SP_WIN_BAR = "M244 228 H372";
const SP_WIN_DOT_X = [254, 265, 276] as const;
const SP_WIN_BOX = "M256 238 H360 V258 H256 Z";

/** 折り返し＝上段の右端から下段の左へ回り込む（ラベルと人の頭を避けた高さを通る） */
const SP_FOLD = "M322 78 H366 V142 H40 V239 H74";

const SP_WIRES: readonly { d: string; t: number; slow?: boolean }[] = [
  { d: "M78 78 H112", t: T.w1 },
  { d: "M222 78 H256", t: T.w2 },
  { d: SP_FOLD, t: T.w3, slow: true },
  { d: "M146 239 H244", t: T.w4 },
];

const SP_RUNS = ["M78 78 H112", "M222 78 H256"] as const;
const SP_EXIT = "M146 239 H244";

const SP_LABELS: readonly Label[] = [
  { x: 47, y: 128, s: "集める", t: T.lb1 },
  { x: 167, y: 128, s: "揃える", t: T.lb2 },
  { x: 289, y: 128, s: "出す", t: T.lb3 },
  { x: 308, y: 296, s: "使う", t: T.lb5 },
];

export default function DecideDiagram() {
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
    <figure className={styles.fig} data-decide-diagram>
      <figcaption className={styles.head}>
        <span className={styles.figLabel}>機械が出し、人が決める</span>
        <span className={styles.rule} aria-hidden="true" />
      </figcaption>

      {/* 常時演出（光の点・輪・✓）の器：画面内かつ前面タブのあいだだけ running。
          className は不変にしておく（state 由来のクラスを同じ要素に載せると、
          再レンダーで .live が消える） */}
      <InViewGate className={styles.gate} activeClassName={styles.live} threshold={0.1}>
        <div ref={ref} className={stageClass}>
          {/* ===================== PC ===================== */}
          <svg
            className={styles.svgPc}
            viewBox="0 0 800 220"
            role="img"
            aria-label={ARIA}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* --- 機械の受け持ち（括弧線＋mono の見出し） --- */}
            <text className={`${styles.tag} ${styles.fade}`} x={242} y={38} style={at(T.tag)}>
              機械
            </text>
            <path
              className={`${styles.d} ${styles.dFast} ${styles.brace}`}
              pathLength={100}
              style={at(T.brace)}
              d={PC_BRACE}
              aria-hidden="true"
            />

            {/* --- 配線 --- */}
            <g aria-hidden="true">
              {PC_WIRES.map((w) => (
                <path
                  key={w.d}
                  className={`${styles.d} ${styles.dFast} ${styles.wire}`}
                  pathLength={100}
                  style={at(w.t)}
                  d={w.d}
                />
              ))}
            </g>

            {/* --- 集める＝紙が3枚ずれて重なる --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet3)}
                d={PC_SHEET3}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet2)}
                d={PC_SHEET2}
              />
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet1)}
                d={PC_SHEET1}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.sheetLine)}
                d={PC_SHEET_LINES}
              />
            </g>

            {/* --- 揃える＝升目の表（4列×3行） --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d={PC_TABLE}
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.tableGrid)}
                d={PC_TABLE_GRID}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={pcTicks(91)}
              />
              {PC_TABLE_ROW_Y.map((y, i) => (
                <path
                  key={y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.tableRow + i * T.rowStep)}
                  d={pcTicks(y)}
                />
              ))}
            </g>

            {/* --- 出す＝上に太い見出し線のある紙 --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.doc)}
                d={PC_DOC}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.docTitle)}
                d={PC_DOC_TITLE}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.docTitle + 0.08)}
                d={PC_DOC_RULE}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.docBody)}
                d={PC_DOC_BODY}
              />
            </g>

            {/* --- 人が決める＝人＋角丸の印＋✓ --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.dFast} ${styles.person}`}
                pathLength={100}
                style={at(T.person)}
                d={PC_HEAD}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.person}`}
                pathLength={100}
                style={at(T.person + 0.12)}
                d={PC_SHOULDER}
              />
              <rect
                className={`${styles.ring} ${styles.ring1}`}
                style={at(T.cycle)}
                x={502}
                y={82}
                width={82}
                height={66}
                rx={12}
              />
              <rect
                className={`${styles.ring} ${styles.ring2}`}
                style={at(T.cycle)}
                x={494}
                y={74}
                width={98}
                height={82}
                rx={16}
              />
              <path
                className={`${styles.d} ${styles.seal}`}
                pathLength={100}
                style={at(T.seal)}
                d={PC_SEAL}
              />
              <path className={styles.check} pathLength={100} style={at(T.check)} d={PC_CHECK} />
            </g>
            <text className={`${styles.nodeName} ${styles.fade}`} x={543} y={184} style={at(T.lb4)}>
              人が決める
            </text>

            {/* --- 使う＝ブラウザの窓 --- */}
            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.win)}
                d={PC_WIN}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.winBar)}
                d={PC_WIN_BAR}
              />
              {PC_WIN_DOT_X.map((x, i) => (
                <circle
                  key={x}
                  className={`${styles.fade} ${styles.pin}`}
                  style={at(T.winDot + i * 0.06)}
                  cx={x}
                  cy={89}
                  r={3}
                />
              ))}
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.winBox)}
                d={PC_WIN_BOX}
              />
            </g>

            {/* --- 駅の名前 --- */}
            {PC_LABELS.map((l) => (
              <text key={l.s} className={`${styles.st} ${styles.fade}`} x={l.x} y={l.y} style={at(l.t)}>
                {l.s}
              </text>
            ))}

            {/* --- 光の点（常時演出）。区間ごとに 0.66 秒ずらして走らせる --- */}
            <g aria-hidden="true">
              {PC_RUNS.map((d, i) => (
                <path
                  key={`run${d}`}
                  className={`${styles.spark} ${styles.sparkRun}`}
                  pathLength={100}
                  style={at(T.cycle + i * T.gap)}
                  d={d}
                />
              ))}
              <path
                className={`${styles.spark} ${styles.sparkExit}`}
                pathLength={100}
                style={at(T.cycle)}
                d={PC_EXIT}
              />
            </g>
          </svg>

          {/* ===================== SP ===================== */}
          <svg
            className={styles.svgSp}
            viewBox="0 0 420 320"
            role="img"
            aria-label={ARIA}
            preserveAspectRatio="xMidYMid meet"
          >
            <text className={`${styles.tag} ${styles.fade}`} x={167} y={26} style={at(T.tag)}>
              機械
            </text>
            <path
              className={`${styles.d} ${styles.dFast} ${styles.brace}`}
              pathLength={100}
              style={at(T.brace)}
              d={SP_BRACE}
              aria-hidden="true"
            />

            <g aria-hidden="true">
              {SP_WIRES.map((w) => (
                <path
                  key={w.d}
                  className={`${styles.d} ${w.slow ? styles.dSlow : styles.dFast} ${styles.wire}`}
                  pathLength={100}
                  style={at(w.t)}
                  d={w.d}
                />
              ))}
            </g>

            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet3)}
                d={SP_SHEET3}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet2)}
                d={SP_SHEET2}
              />
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.sheet1)}
                d={SP_SHEET1}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.sheetLine)}
                d={SP_SHEET_LINES}
              />
            </g>

            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.table)}
                d={SP_TABLE}
              />
              <path
                className={`${styles.d} ${styles.grid}`}
                pathLength={100}
                style={at(T.tableGrid)}
                d={SP_TABLE_GRID}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.tableHead)}
                d={spTicks(60)}
              />
              {SP_TABLE_ROW_Y.map((y, i) => (
                <path
                  key={y}
                  className={`${styles.d} ${styles.dFast} ${styles.data}`}
                  pathLength={100}
                  style={at(T.tableRow + i * T.rowStep)}
                  d={spTicks(y)}
                />
              ))}
            </g>

            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.doc)}
                d={SP_DOC}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.dataStrong}`}
                pathLength={100}
                style={at(T.docTitle)}
                d={SP_DOC_TITLE}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.docTitle + 0.08)}
                d={SP_DOC_RULE}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.data}`}
                pathLength={100}
                style={at(T.docBody)}
                d={SP_DOC_BODY}
              />
            </g>

            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.dFast} ${styles.person}`}
                pathLength={100}
                style={at(T.person)}
                d={SP_HEAD}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.person}`}
                pathLength={100}
                style={at(T.person + 0.12)}
                d={SP_SHOULDER}
              />
              <rect
                className={`${styles.ring} ${styles.ring1}`}
                style={at(T.cycle + T.spFold)}
                x={69}
                y={207}
                width={82}
                height={64}
                rx={10}
              />
              <rect
                className={`${styles.ring} ${styles.ring2}`}
                style={at(T.cycle + T.spFold)}
                x={64}
                y={202}
                width={92}
                height={74}
                rx={14}
              />
              <path
                className={`${styles.d} ${styles.seal}`}
                pathLength={100}
                style={at(T.seal)}
                d={SP_SEAL}
              />
              <path className={styles.check} pathLength={100} style={at(T.check)} d={SP_CHECK} />
            </g>
            <text className={`${styles.nodeName} ${styles.fade}`} x={110} y={296} style={at(T.lb4)}>
              人が決める
            </text>

            <g aria-hidden="true">
              <path
                className={`${styles.d} ${styles.paper}`}
                pathLength={100}
                style={at(T.win)}
                d={SP_WIN}
              />
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.winBar)}
                d={SP_WIN_BAR}
              />
              {SP_WIN_DOT_X.map((x, i) => (
                <circle
                  key={x}
                  className={`${styles.fade} ${styles.pin}`}
                  style={at(T.winDot + i * 0.06)}
                  cx={x}
                  cy={220}
                  r={3}
                />
              ))}
              <path
                className={`${styles.d} ${styles.dFast} ${styles.grid}`}
                pathLength={100}
                style={at(T.winBox)}
                d={SP_WIN_BOX}
              />
            </g>

            {SP_LABELS.map((l) => (
              <text key={l.s} className={`${styles.st} ${styles.fade}`} x={l.x} y={l.y} style={at(l.t)}>
                {l.s}
              </text>
            ))}

            <g aria-hidden="true">
              {SP_RUNS.map((d, i) => (
                <path
                  key={`run${d}`}
                  className={`${styles.spark} ${styles.sparkRun}`}
                  pathLength={100}
                  style={at(T.cycle + i * T.gap)}
                  d={d}
                />
              ))}
              {/* 折り返しは道のりが長いので、この区間だけ長い尺で走らせる */}
              <path
                className={`${styles.spark} ${styles.sparkLong}`}
                pathLength={100}
                style={at(T.cycle + 2 * T.gap)}
                d={SP_FOLD}
              />
              <path
                className={`${styles.spark} ${styles.sparkExit}`}
                pathLength={100}
                style={at(T.cycle + T.spFold)}
                d={SP_EXIT}
              />
            </g>
          </svg>
        </div>
      </InViewGate>
    </figure>
  );
}
