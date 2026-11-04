import type { SVGProps } from "react";

/**
 * One consistent stroke icon set (24px grid, round caps) used everywhere instead of emoji or
 * Unicode symbols, so icons look the same on every OS and scale with text.
 */
const PATHS = {
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 6h2.5a1.5 1.5 0 0 1 0 3H17M7 6H4.5a1.5 1.5 0 0 0 0 3H7",
  wallet: "M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2M3 7.5V17a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7.5h16a1 1 0 0 1 1 1V11m0 4h-3.5a2 2 0 0 1 0-4H20m0 4v-4",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  volume: "M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  volumeOff: "M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6",
  pause: "M8 5v14M16 5v14",
  play: "M7 4.5v15l12-7.5-12-7.5Z",
  restart: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8",
  share: "M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  x: "M6 6l12 12M18 6 6 18",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  arrowRight: "M4 12h16M14 6l6 6-6 6",
  arrowDown: "M12 4v16M6 14l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  trendUp: "M3 17l6-6 4 4 8-8M15 7h6v6",
  trendDown: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.5v.5",
  alert: "M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5v.5",
  circleCheck: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.5l2.5 2.5L16 9.5",
  circleX: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6",
  circle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  gamepad: "M7 8h10a5 5 0 0 1 4.8 6.4l-.6 2a2.8 2.8 0 0 1-4.6 1.2L14.5 15.5h-5L7.4 17.6a2.8 2.8 0 0 1-4.6-1.2l-.6-2A5 5 0 0 1 7 8ZM7.5 10.5v3M6 12h3M15.5 11.5v.01M17.5 13.5v.01",
  keyboard: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10",
  coins: "M9 14a6 3 0 1 0 0-6 6 3 0 0 0 0 6ZM3 11v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4M15 9.3c3.4.2 6 1.5 6 3v4c0 1.6-2.6 3-6 3",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5 5-2Z",
} as const;

export type IconName = keyof typeof PATHS;

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: IconName;
  /** Pixel size (width = height). Defaults to 1em so it follows the surrounding text. */
  size?: number | string;
  /** When set, the icon is announced with this label; otherwise it is decorative (aria-hidden). */
  label?: string;
};

export function Icon({ name, size = "1em", label, strokeWidth = 2.25, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={className ? `inline-block shrink-0 ${className}` : "inline-block shrink-0"}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
