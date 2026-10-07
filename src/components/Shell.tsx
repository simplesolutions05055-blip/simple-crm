"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import { sb } from "@/lib/supabase/browser";
import type { Row } from "@/lib/crm";

const SETTINGS_SUB = [
  { href: "/settings/business", label: "פרטי העסק" },
  { href: "/settings/quotes", label: "תבניות הצעת מחיר" },
  { href: "/settings/connections", label: "חיבורים וקשר" },
  { href: "/settings/automations", label: "אוטומציות" },
];

const NAV = [
  { href: "/", label: "לוח בקרה", icon: "home" },
  { href: "/leads", label: "לידים", icon: "target" },
  { href: "/clients", label: "לקוחות", icon: "brief" },
  { href: "/quotes", label: "הצעות מחיר", icon: "file" },
  { href: "/tasks", label: "משימות", icon: "tasks", count: true },
  { href: "/calendar", label: "יומן", icon: "cal" },
  { href: "/settings", label: "הגדרות", icon: "sliders" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { email, counts, orgs, biz, switchOrg } = useApp();
  const others = orgs.filter((o) => o.id !== biz.id);
  const b = biz.brand;
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const router = useRouter();
  // after an email link (e.g. password reset) land on the page that sent it
  useEffect(() => {
    try {
      const next = localStorage.getItem("sscrm_next");
      if (next && path === "/") { localStorage.removeItem("sscrm_next"); router.replace(next); }
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="app" style={brandVars(b)}>
      <aside className="side">
        <div className="brand">
          {b.logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img className="logo-full" src={b.logo} alt={biz.name} />
          ) : (
            <div className="biz-word">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.mark ? <img src={b.mark} alt="" /> : null}
              <div><b>{b.short || biz.name}</b><small>CRM</small></div>
            </div>
          )}
          {others.map((o) => (
            <button key={o.id} className="biz-sw" onClick={() => switchOrg(o.id)} title={"מעבר ל-" + (o.brand.short || o.name)}>
              <span className="lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.brand.mark ? <img src={o.brand.mark} alt="" /> : <b>{(o.brand.short || o.name).slice(0, 1)}</b>}
              </span>
              <span className="t"><span>מעבר ל-</span><b>{o.brand.short || o.name}</b></span>
              <Icon n="swap" s={17} />
            </button>
          ))}
        </div>
        <div>
          <div className="navlbl">ניהול</div>
          <nav className="nav">
            {NAV.map((n) => (
              <div key={n.href} style={{ display: "contents" }}>
                <Link href={n.href === "/settings" ? "/settings/business" : n.href} className={"navbtn" + (on(n.href) ? " on" : "")}>
                  <Icon n={n.icon} />
                  {n.label}
                  {n.count && counts.tasksDue > 0 ? <span className="cnt">{counts.tasksDue}</span> : null}
                </Link>
                {n.href === "/settings" && on("/settings") ? (
                  <div className="subnav">
                    {SETTINGS_SUB.map((s) => (
                      <Link key={s.href} href={s.href} className={path.startsWith(s.href) ? "on" : ""}>{s.label}</Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </nav>
        </div>
        <div className="me">
          <span className="av me-av">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.png" alt="" style={{ width: 18, height: "auto" }} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b style={{ display: "block", fontSize: 13 }}>מאור עטייה</b>
            <small className="sub" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{email}</small>
          </div>
          <button className="btn icon sm ghost" title="יציאה" onClick={async () => { await sb().auth.signOut(); location.href = "/login"; }}>
            <Icon n="x" s={16} />
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function Top({ title, sub, crumb, right }: { title: string; sub?: React.ReactNode; crumb?: { href: string; label: string }; right?: React.ReactNode }) {
  const { orgs, biz } = useApp();
  return (
    <header className="top">
      <div className="grow">
        {crumb ? (
          <div className="crumb">
            <Link href={crumb.href}>{crumb.label}</Link>
            <Icon n="chev" s={14} />
          </div>
        ) : null}
        <h1>{title}{orgs.length > 1 ? <span className="biz-pill"><i />{biz.brand.short || biz.name}</span> : null}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {right}
      <Search />
    </header>
  );
}

/* a business's colors repaint the shell: accent, primary buttons and the thin gradient band */
function brandVars(b: Row): React.CSSProperties {
  const v: Record<string, string> = {};
  if (b.accent) v["--gold"] = b.accent;
  if (b.accent_hi) v["--gold-2"] = b.accent_hi;
  if (b.navy) v["--navy"] = b.navy;
  if (b.navy_hi) v["--navy-hi"] = b.navy_hi;
  if (b.grad) v["--grad"] = b.grad;
  return v as React.CSSProperties;
}

function Search() {
  const { biz } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ href: string; t: string; s: string; icon: string }[]>([]);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes([]); return; }
    const h = setTimeout(async () => {
      const like = "%" + term.replace(/[%,()]/g, "") + "%";
      const [l, c] = await Promise.all([
        sb().from("crm_leads").select("id,name,biz,phone,stage").is("archived_at", null).or(`name.ilike.${like},biz.ilike.${like},phone.ilike.${like}`).limit(6),
        sb().from("crm_clients").select("id,biz,contact,phone,status").is("archived_at", null).or(`biz.ilike.${like},contact.ilike.${like},phone.ilike.${like}`).limit(6),
      ]);
      setRes([
        ...(c.data || []).map((r: Row) => ({ href: "/clients/" + r.id, t: r.biz, s: "לקוח · " + (r.contact || "") , icon: "brief" })),
        ...(l.data || []).map((r: Row) => ({ href: "/leads/" + r.id, t: r.name + (r.biz ? " · " + r.biz : ""), s: "ליד · " + r.stage, icon: "target" })),
      ]);
    }, 220);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setRes([]); };
    document.addEventListener("click", f);
    return () => document.removeEventListener("click", f);
  }, []);
  return (
    <div className="search" ref={box}>
      <Icon n="search" s={16} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={"חיפוש ב-" + (biz.brand.short || biz.name)} />
      {res.length ? (
        <div className="results">
          {res.map((r) => (
            <button key={r.href} onClick={() => { setRes([]); setQ(""); router.push(r.href); }}>
              <Icon n={r.icon} s={16} />
              <span className="grow"><b>{r.t}</b><span className="sub">{r.s}</span></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Panel({ icon, title, right, children, className }: { icon?: string; title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={"panel" + (className ? " " + className : "")}>
      {title ? (
        <div className="phd">
          <h2>{icon ? <span className="hi"><Icon n={icon} s={16} /></span> : null}{title}</h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Modal({ title, icon, onClose, children, wide }: { title: string; icon?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  // portal to <body>: a modal opened from the sticky header would otherwise be trapped inside it
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box" style={wide ? { width: 720 } : undefined}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2>{icon ? <span className="hi"><Icon n={icon} s={16} /></span> : null}{title}</h2>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="סגירה"><Icon n="x" s={16} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function St({ cls, children }: { cls?: string; children: React.ReactNode }) {
  return <span className={"st" + (cls ? " " + cls : "")}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><Icon n="inbox" s={16} />{children}</div>;
}
