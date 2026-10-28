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
  return on ? <a className="lp-wa lp-fab" href={href}><ChatIcon />וואטסאפ</a> : null;
}

/* a plain chat bubble with a handset, drawn here (not the WhatsApp logo) */
export function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.4a8.4 8.4 0 1 1 15.5-4.5z" />
      <path d="M9 9.2c0 2.9 2.4 5.3 5.3 5.3l1-1.2-1.6-.8-.8.7a3.8 3.8 0 0 1-2.4-2.4l.7-.8-.8-1.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}
