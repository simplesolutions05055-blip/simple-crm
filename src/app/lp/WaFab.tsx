"use client";
/* the floating WhatsApp button shows only after the hero, so it never covers the form */
import { useEffect, useState } from "react";

export default function WaFab({ href }: { href: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(scrollY > innerHeight * 0.9);
    f(); addEventListener("scroll", f, { passive: true });
    return () => removeEventListener("scroll", f);
  }, []);
  return on ? <a className="lp-fab" href={href}>וואטסאפ</a> : null;
}
