"use client";
/* pieces of a task shared by the tasks page and the task window: link to a lead/client with search,
   and attachments (links, uploaded files, documents of the lead/client) that open in one click */
import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import Icon from "./Icon";
import { useApp } from "./AppCtx";
import type { Row, TaskAttachment } from "@/lib/crm";

export type LinkOpt = { v: string; l: string; kind: "לקוח" | "ליד" };
let cache: LinkOpt[] | null = null;
export function useLinkOptions() {
  const [opts, setOpts] = useState<LinkOpt[]>(cache || []);
  useEffect(() => {
    if (cache) return;
    (async () => {
      const [l, c] = await Promise.all([
        sb().from("crm_leads").select("id,name,biz").is("archived_at", null).neq("stage", "לקוח").order("name"),
        sb().from("crm_clients").select("id,biz,contact").is("archived_at", null).order("biz"),
      ]);
      cache = [
        ...(c.data || []).map((x: Row) => ({ v: "c:" + x.id, l: x.biz + (x.contact && x.contact !== x.biz ? " · " + x.contact : ""), kind: "לקוח" as const })),
        ...(l.data || []).map((x: Row) => ({ v: "l:" + x.id, l: x.name + (x.biz ? " · " + x.biz : ""), kind: "ליד" as const })),
      ];
      setOpts(cache);
    })();
  }, []);
  return opts;
}

/* a search box over clients and leads; picking one calls onPick("c:<id>" | "l:<id>" | "") */
export function LinkPicker({ value, onPick, autoFocus }: { value: string; onPick: (v: string) => void; autoFocus?: boolean }) {
  const opts = useLinkOptions();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!!autoFocus);
  const cur = opts.find((o) => o.v === value);
  const list = useMemo(() => {
    const t = q.trim();
    return (t ? opts.filter((o) => o.l.includes(t)) : opts).slice(0, 30);
  }, [opts, q]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  return (
    <div className="lpick" ref={box}>
      <input className="inp sm" autoFocus={autoFocus} placeholder={cur ? cur.kind + " · " + cur.l : "חיפוש לקוח או ליד לפי שם"} value={q}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {open ? (
        <div className="lpick-list">
          {value ? <button type="button" onClick={() => { onPick(""); setQ(""); setOpen(false); }}><span className="meta">ללא שיוך</span></button> : null}
          {list.map((o) => (
            <button type="button" key={o.v} className={o.v === value ? "on" : ""} onClick={() => { onPick(o.v); setQ(""); setOpen(false); }}>
              <span className={"st " + (o.kind === "לקוח" ? "ok" : "warn")}>{o.kind}</span>{o.l}
            </button>
          ))}
          {!list.length ? <span className="meta" style={{ padding: 8 }}>לא נמצא</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export async function openAttachment(a: TaskAttachment, toast: (m: string, bad?: boolean) => void, link?: { lead_id?: string | null; client_id?: string | null }) {
  if (a.t === "link") { window.open(/^https?:/.test(a.url) ? a.url : "https://" + a.url, "_blank", "noopener"); return; }
  let path = a.t === "file" ? a.path : "";
  if (a.t === "doc") {
    const { data } = await sb().from("crm_documents").select("path,kind,client_id,lead_id").eq("id", a.doc_id).maybeSingle();
    if (!data) return toast("המסמך לא נמצא. אולי נמחק", true);
    if (!data.path) { // an intake form or another document without a file: open the card where it lives
      const to = data.client_id || link?.client_id ? "/clients/" + (data.client_id || link?.client_id) : data.lead_id || link?.lead_id ? "/leads/" + (data.lead_id || link?.lead_id) : "";
      if (to) window.open(to, "_blank");
      return;
    }
    path = data.path;
  }
  const { data, error } = await sb().storage.from("crm-docs").createSignedUrl(path, 300);
  if (error || !data) return toast("הקובץ לא נפתח", true);
  window.open(data.signedUrl, "_blank", "noopener");
}

export function AttachmentChips({ list, task, onRemove }: { list: TaskAttachment[]; task?: Row; onRemove?: (i: number) => void }) {
  const { toast } = useApp();
  if (!list.length) return null;
  return (
    <div className="tatt">
      {list.map((a, i) => (
        <span key={i} className="tatt-c">
          <button type="button" onClick={(e) => { e.stopPropagation(); openAttachment(a, toast, task); }} title={a.t === "link" ? "פתיחה" : "צפייה"}>
            <Icon n={a.t === "link" ? "link" : "file"} s={13} />{a.name}
          </button>
          {onRemove ? <button type="button" className="x" aria-label="הסרה" onClick={() => onRemove(i)}>×</button> : null}
        </span>
      ))}
    </div>
  );
}
