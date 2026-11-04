"use client";

import { useEffect, useState } from "react";

/** Whether the element with `id` is at least partly on screen. */
export function useInView(id: string, rootMargin = "0px") {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [id, rootMargin]);
  return inView;
}
