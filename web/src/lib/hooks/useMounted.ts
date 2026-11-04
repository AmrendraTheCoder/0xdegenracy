"use client";

import { useEffect, useState } from "react";

/** False during SSR and the first client render; use it to avoid hydration mismatches with wallet state. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
