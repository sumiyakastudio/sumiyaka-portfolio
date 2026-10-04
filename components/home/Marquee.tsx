import InViewGate from "@/components/animation/InViewGate";
import styles from "./Marquee.module.css";

interface MarqueeProps {
  text?: string;
  items?: string[];
  reverse?: boolean;
  className?: string;
  variant?: "default" | "code" | "washi";
}

export default function Marquee({
  text,
  items: itemsProp,
  reverse = false,
  className = "",
  variant = "default",
}: MarqueeProps) {
  const isCode = variant === "code";
  const isWashi = variant === "washi";
  const itemClass = isWashi
    ? styles.washiItem
    : isCode
      ? styles.codeItem
      : styles.item;
  const sepClass = isWashi
    ? styles.washiSeparator
    : isCode
      ? styles.codeSeparator
      : styles.separator;
  const sepChar = isWashi ? "" : isCode ? "·" : "●";

  const renderSet = (prefix: string) => {
    if (itemsProp) {
      const repeated = [...itemsProp, ...itemsProp, ...itemsProp];
      return repeated.map((item, i) => (
        <span
          key={`${prefix}${i}`}
          className={itemClass}
          aria-hidden={prefix !== "a" || i > 0}
        >
          {item}
          <span className={sepClass}>{sepChar}</span>
        </span>
      ));
    }
    return Array.from({ length: 6 }, (_, i) => (
      <span
        key={`${prefix}${i}`}
        className={itemClass}
        aria-hidden={prefix !== "a" || i > 0}
      >
        {text}
        <span className={sepClass}>{sepChar}</span>
      </span>
    ));
  };

  const ariaLabel = itemsProp ? itemsProp.join(` ${sepChar} `) : text;

  // 流れる帯（常時の CSS アニメ）は画面に入っている間だけ回す（.live の時だけ running）
  return (
    <InViewGate activeClassName={styles.live} threshold={0}>
      <div
        className={`${styles.marquee} ${isCode ? styles.codeMarquee : ""} ${isWashi ? styles.washiMarquee : ""} ${className}`}
        aria-label={ariaLabel}
      >
        <div
          className={`${styles.track} ${isWashi ? styles.washiTrack : ""} ${reverse ? styles.reverse : ""}`}
        >
          {renderSet("a")}
          {renderSet("b")}
        </div>
      </div>
    </InViewGate>
  );
}
