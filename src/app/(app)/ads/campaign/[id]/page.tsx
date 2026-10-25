"use client";
/* one campaign opened from the CRM (Simple Ads) */
import { useParams } from "next/navigation";
import { Top } from "@/components/Shell";
import { CampaignManage } from "@/components/AdsManage";

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <Top title="ניהול קמפיין" sub="קבוצות מודעות, מודעות, מצב עבודה ויומן פעולות" crumb={{ href: "/ads", label: "מודעות" }} />
      <div className="content"><CampaignManage id={decodeURIComponent(id)} /></div>
    </>
  );
}
