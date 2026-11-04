import { cn } from "@/components/ui";

/** Deterministic avatar for a wallet: two hues and an angle derived from the address. */
export function AddressAvatar({ address, size = 36, className }: { address: string; size?: number; className?: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(12, "0");
  const h1 = parseInt(hex.slice(0, 4), 16) % 360;
  const h2 = (h1 + 60 + (parseInt(hex.slice(4, 8), 16) % 180)) % 360;
  const angle = parseInt(hex.slice(8, 12), 16) % 360;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full border-2 border-ink", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from ${angle}deg, hsl(${h1} 85% 62%), hsl(${h2} 80% 55%), hsl(${h1} 85% 62%))`,
      }}
    />
  );
}

/** Coin thumbnail: the game's uploaded face. */
export function CoinAvatar({ src, size = 44, className }: { src: string; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0 rounded-xl border-2 border-ink bg-paper object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
