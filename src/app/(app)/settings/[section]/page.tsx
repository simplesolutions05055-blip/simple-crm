"use client";
import { useParams } from "next/navigation";
import { SettingsSection } from "../sections";

export default function SettingsPage() {
  const { section } = useParams<{ section: string }>();
  return <SettingsSection slug={section} />;
}
