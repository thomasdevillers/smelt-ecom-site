interface StarMarkProps {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

export default function StarMark({
  className,
  size = 14,
  style,
}: StarMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <line x1="8" y1="1.5" x2="8" y2="14.5" />
      <line x1="1.5" y1="8" x2="14.5" y2="8" />
      <line x1="3.4" y1="3.4" x2="12.6" y2="12.6" />
      <line x1="3.4" y1="12.6" x2="12.6" y2="3.4" />
    </svg>
  );
}
