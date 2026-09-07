/**
 * OP の時計（第1幕 ↔ 第2幕の共有）
 *
 * 描画面をひとつにするため、OP の絵は転記ステージ（TenkiStage）の canvas が描く。
 * 時計そのものは OpeningLite が持ち（`openingDone` を返す責務があるため）、
 * ここを介してステージへ渡す。モジュール実体はクライアントバンドルで 1 つ。
 */

export interface OpState {
  /** OP の経過（秒）。マウントから */
  t: number;
  /** 第2幕へ渡した（openingDone 相当） */
  done: boolean;
  /** 軽量経路（短縮版） */
  light: boolean;
  /** OP を再生しない（reduced-motion / canvas 不可） */
  skipped: boolean;
  /** 時計が動いている（OpeningLite がマウント済み） */
  live: boolean;
}

const state: OpState = { t: 0, done: false, light: false, skipped: false, live: false };

export function getOpState(): OpState {
  return state;
}

export function setOpState(next: Partial<OpState>): void {
  Object.assign(state, next);
}

export function resetOpState(light: boolean): void {
  state.t = 0;
  state.done = false;
  state.light = light;
  state.skipped = false;
  state.live = true;
}
