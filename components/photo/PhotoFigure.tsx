import Image from "next/image";
import type { SitePhoto } from "@/data/photos";
import styles from "./PhotoFigure.module.css";

/**
 * PhotoFigure — 本人写真の額（2026-09-22・ロードマップ 4-13）。
 *
 * トップ 01（Who）・04（Person）の額と同じ作法＝オフセットの細い罫（右下へ 14px）＋
 * 縁を地色へ沈める（dark のみ）＋小さなキャプション（左下）。
 * 写真の文言・寸法は data/photos.ts（契約ファイル）から渡す。ここに文言を直書きしない。
 *
 * - 動きは持たない。入場は外側で <ScrollReveal> に包む（この figure に transform を書かない）。
 * - 写真はモノクロを焼き込み済み＝CSS filter は当てない（iOS/WebKit の滲み事故を踏まない）。
 * - 原比率のまま（width/height 指定・object-fit で切り抜かない）。
 * - 地色はページ側が custom property で渡す（PhotoFigure.module.css の冒頭を参照）。
 *
 * tone:
 *   "dark"  … 暖黒の地（トップ・/about・/service）。縁を --photo-ground へ沈める
 *   "paper" … 紙の地（/cases）。沈めずに、写真の白が紙へ溶けないよう髪の毛ほどの縁を持つ
 */
type Props = {
  photo: SitePhoto;
  /** 実表示幅（next/image の sizes）。置き場所ごとに実測で書く */
  sizes: string;
  tone?: "dark" | "paper";
  captionAlign?: "left" | "right";
  /** 外側の figure に足すクラス（幅・グリッド配置はページ側の CSS で決める） */
  className?: string;
  priority?: boolean;
};

export default function PhotoFigure({
  photo,
  sizes,
  tone = "dark",
  captionAlign = "left",
  className,
  priority,
}: Props) {
  const figureClass = [styles.figure, tone === "paper" ? styles.paper : styles.dark, className]
    .filter(Boolean)
    .join(" ");
  const captionClass = [styles.caption, captionAlign === "right" ? styles.captionRight : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <figure className={figureClass}>
      <span className={styles.frame}>
        <Image
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          sizes={sizes}
          priority={priority}
          className={styles.img}
        />
      </span>
      <figcaption className={captionClass}>{photo.caption}</figcaption>
    </figure>
  );
}
