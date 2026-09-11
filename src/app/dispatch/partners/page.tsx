"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jsonFetcher } from "@/lib/fetcher";

interface PartnerRow {
  id: string;
  legalName: string;
  taxId: string;
  contactPersonName: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "მონახაზი",
  SUBMITTED: "გადამოწმებაშია",
  CHANGES_REQUESTED: "საჭიროა შესწორება",
  APPROVED: "დამტკიცებული",
  REJECTED: "უარყოფილი",
  SUSPENDED: "შეჩერებული",
};
const STATUS_TONE: Record<string, "green" | "accent" | "neutral" | "red"> = {
  SUBMITTED: "accent",
  CHANGES_REQUESTED: "accent",
  APPROVED: "green",
  REJECTED: "red",
  SUSPENDED: "red",
  DRAFT: "neutral",
};

const TABS = ["SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as const;

export default function PartnersPage() {
  const [tab, setTab] = useState<string>("SUBMITTED");
  const { data } = useSWR<{ partners: PartnerRow[] }>(
    `/api/dispatch/partners?status=${tab}`,
    jsonFetcher,
  );
  const partners = data?.partners ?? [];

  return (
    <>
      <PageHeader title="პარტნიორები" description="კომპანიების განაცხადები და დამტკიცება" />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "rounded-full px-4 py-1.5 text-sm " +
              (tab === t ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")
            }
          >
            {STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {partners.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">ამ ფილტრში განაცხადი არ არის.</p>
          )}
          {partners.map((p) => (
            <Link
              key={p.id}
              href={`/dispatch/partners/${p.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted/40"
            >
              <div>
                <div className="font-medium">{p.legalName}</div>
                <div className="text-xs text-muted-foreground">
                  ს/კ {p.taxId} · {p.contactPersonName}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {new Date(p.submittedAt ?? p.createdAt).toLocaleDateString("ka-GE")}
                </span>
                <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
