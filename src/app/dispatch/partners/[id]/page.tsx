"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, jsonFetcher, HttpError } from "@/lib/fetcher";

interface Detail {
  profile: {
    id: string;
    legalName: string;
    taxId: string;
    legalAddress: string;
    contactPersonName: string;
    contactEmail: string;
    contactPhone: string;
    billingEmail: string | null;
    status: string;
    rejectionReason: string | null;
    changesRequestedMessage: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewedByName: string | null;
    ownerAccount: { email: string; phone: string; name: string };
  };
  contractAcceptances: { contractVersion: string; acceptedAt: string; acceptedIp: string | null }[];
  currentContractVersion: string;
  acceptedCurrentVersion: boolean;
  auditEvents: { action: string; message: string | null; createdAt: string }[];
  legalReviewClauses: string[];
  retailMarkupGel: number;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "მონახაზი",
  SUBMITTED: "გადამოწმებაშია",
  CHANGES_REQUESTED: "საჭიროა შესწორება",
  APPROVED: "დამტკიცებული",
  REJECTED: "უარყოფილი",
  SUSPENDED: "შეჩერებული",
};

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate } = useSWR<Detail>(`/api/dispatch/partners/${id}`, jsonFetcher);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <p className="p-6 text-sm text-muted-foreground">იტვირთება…</p>;
  const { profile } = data;

  async function review(action: "APPROVE" | "CHANGES_REQUESTED" | "REJECT" | "SUSPEND") {
    setError("");
    setBusy(true);
    try {
      await api(`/api/dispatch/partners/${id}/review`, "POST", { action, message: message || undefined });
      await mutate();
      setMessage("");
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={profile.legalName} description={`ს/კ ${profile.taxId}`} />

      <div className="mb-4">
        <Badge tone={profile.status === "APPROVED" ? "green" : profile.status === "REJECTED" || profile.status === "SUSPENDED" ? "red" : "accent"}>
          {STATUS_LABEL[profile.status]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>კომპანიის პროფილი</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row l="იურიდიული მისამართი" v={profile.legalAddress} />
            <Row l="საკონტაქტო პირი" v={profile.contactPersonName} />
            <Row l="ელფოსტა" v={profile.contactEmail} />
            <Row l="ტელეფონი" v={profile.contactPhone} />
            <Row l="ბილინგის ელფოსტა" v={profile.billingEmail ?? "—"} />
            <Row l="ანგარიშის ელფოსტა" v={profile.ownerAccount.email} />
            <Row l="გაგზავნის თარიღი" v={profile.submittedAt ? new Date(profile.submittedAt).toLocaleString("ka-GE") : "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ხელშეკრულება</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row l="მოქმედი ვერსია" v={data.currentContractVersion} />
            <Row
              l="თანხმობა მიმდინარე ვერსიაზე"
              v={data.acceptedCurrentVersion ? "დადასტურდა ✓" : "არ არსებობს/ძველი ვერსია ⚠"}
            />
            {data.contractAcceptances.map((a, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                {a.contractVersion} — {new Date(a.acceptedAt).toLocaleString("ka-GE")}
                {a.acceptedIp ? ` (${a.acceptedIp})` : ""}
              </div>
            ))}
            <a
              href={`/app/company/contract-pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-accent hover:underline"
            >
              PDF ნახვა →
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ტარიფი</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row l="კომპანიის ტარიფი" v="მოქმედი საბაზო ტარიფი" />
            <Row l="ჩვეულებრივი მომხმარებლის ფასი" v={`კომპანიის ტარიფი +${data.retailMarkupGel} ₾`} />
            <p className="pt-1 text-xs text-muted-foreground">
              დამტკიცების შემდეგ ეს კომპანია ავტომატურად იღებს მოქმედ საბაზო ტარიფს (markup-ის გარეშე) —
              ინდივიდუალური ფასდაკლება/custom ტარიფი ამ ეტაპზე არ გამოიყენება.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audit history</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {data.auditEvents.length === 0 && <p>ჯერ არაფერია.</p>}
            {data.auditEvents.map((e, i) => (
              <div key={i}>
                {new Date(e.createdAt).toLocaleString("ka-GE")} — {e.action}
                {e.message ? `: ${e.message}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Review-ქმედება</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(profile.status === "CHANGES_REQUESTED" || profile.status === "REJECTED" || profile.status === "SUSPENDED") && (
            <p className="text-sm text-muted-foreground">
              {profile.changesRequestedMessage || profile.rejectionReason}
            </p>
          )}
          <textarea
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={2}
            placeholder="კომენტარი (ცვლილება/უარყოფა/შეჩერების მიზეზი)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => review("APPROVE")}>დამტკიცება</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("CHANGES_REQUESTED")}>ცვლილების მოთხოვნა</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("REJECT")}>უარყოფა</Button>
            <Button variant="outline" disabled={busy} onClick={() => review("SUSPEND")}>შეჩერება</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{l}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
