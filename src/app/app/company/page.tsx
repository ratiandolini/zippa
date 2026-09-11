"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { api, jsonFetcher, HttpError } from "@/lib/fetcher";

interface CompanyProfile {
  id: string;
  legalName: string;
  taxId: string;
  legalAddress: string;
  contactPersonName: string;
  contactEmail: string;
  contactPhone: string;
  billingEmail: string | null;
  status: "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectionReason: string | null;
  changesRequestedMessage: string | null;
  editable: boolean;
  lastAcceptance: { contractVersion: string; acceptedAt: string } | null;
}

interface Contract {
  version: string;
  title: string;
  clauses: { title: string; body: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "მონახაზი",
  SUBMITTED: "გადამოწმებაშია",
  CHANGES_REQUESTED: "საჭიროა შესწორება",
  APPROVED: "დამტკიცებული",
  REJECTED: "უარყოფილი",
  SUSPENDED: "შეჩერებული",
};

export default function CompanyProfilePage() {
  const { data, mutate } = useSWR<{ profile: CompanyProfile | null }>("/api/company", jsonFetcher);
  const { data: contractData } = useSWR<Contract>("/api/company/contract", jsonFetcher);
  const profile = data?.profile ?? null;

  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setLegalName(profile.legalName);
    setTaxId(profile.taxId);
    setLegalAddress(profile.legalAddress);
    setContactPersonName(profile.contactPersonName);
    setContactEmail(profile.contactEmail);
    setContactPhone(profile.contactPhone);
    setBillingEmail(profile.billingEmail ?? "");
  }, [profile]);

  const readOnly = !!profile && !profile.editable;

  async function saveDraft() {
    setError("");
    setSaving(true);
    try {
      await api("/api/company", "POST", {
        legalName,
        taxId,
        legalAddress,
        contactPersonName,
        contactEmail,
        contactPhone,
        billingEmail: billingEmail || undefined,
      });
      setSavedOk(true);
      await mutate();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setError("");
    if (!agree) {
      setError("გთხოვთ, დაეთანხმოთ პარტნიორობის ხელშეკრულებას");
      return;
    }
    if (!contractData) return;
    setSaving(true);
    try {
      await saveDraft();
      await api("/api/company/submit", "POST", {
        agreeToContract: true,
        contractVersion: contractData.version,
      });
      await mutate();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : "შეცდომა");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="კომპანიის პროფილი" description="არჩევითი — პარტნიორობა ინდივიდუალურ ტარიფზე" />

      {profile && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <p className="font-medium">
              სტატუსი: <span className="text-accent">{STATUS_LABEL[profile.status]}</span>
            </p>
            {profile.status === "CHANGES_REQUESTED" && profile.changesRequestedMessage && (
              <p className="mt-1 text-sm text-muted-foreground">
                დისპეჩერის შენიშვნა: {profile.changesRequestedMessage}
              </p>
            )}
            {profile.status === "REJECTED" && profile.rejectionReason && (
              <p className="mt-1 text-sm text-destructive">მიზეზი: {profile.rejectionReason}</p>
            )}
            {profile.status === "APPROVED" && (
              <p className="mt-1 text-sm text-muted-foreground">ტარიფი: პარტნიორი კომპანიის ტარიფი</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. კომპანიის მონაცემები</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="იურიდიული დასახელება">
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="საიდენტიფიკაციო კოდი (ს/კ)">
              <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="იურიდიული მისამართი">
              <Input value={legalAddress} onChange={(e) => setLegalAddress(e.target.value)} disabled={readOnly} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. საკონტაქტო პირი</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="სახელი, გვარი">
              <Input value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="ელფოსტა">
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="ტელეფონი">
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={readOnly} />
            </Field>
            <Field label="ბილინგის ელფოსტა (არჩევითი)">
              <Input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} disabled={readOnly} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. პარტნიორობის ხელშეკრულება</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!contractData && <p className="text-sm text-muted-foreground">იტვირთება…</p>}
            {contractData && (
              <>
                <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border border-border p-4 text-sm">
                  {contractData.clauses.map((c) => (
                    <div key={c.title}>
                      <p className="font-medium">{c.title}</p>
                      <p className="mt-1 text-muted-foreground">{c.body}</p>
                    </div>
                  ))}
                </div>
                <a
                  href="/app/company/contract-pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-accent hover:underline"
                >
                  ხელშეკრულების ჩამოტვირთვა (PDF) →
                </a>
                <p className="text-xs text-muted-foreground">ვერსია {contractData.version}</p>
                {profile?.lastAcceptance && (
                  <p className="text-xs text-muted-foreground">
                    თანხმობა მიღებულია: ვერსია {profile.lastAcceptance.contractVersion},{" "}
                    {new Date(profile.lastAcceptance.acceptedAt).toLocaleString("ka-GE")}
                  </p>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    disabled={readOnly}
                  />
                  წავიკითხე და ვეთანხმები პარტნიორობის ხელშეკრულებას
                </label>
              </>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {savedOk && !error && <p className="text-sm text-accent">შენახულია.</p>}

        {!readOnly && (
          <div className="flex gap-3">
            <Button variant="outline" disabled={saving} onClick={saveDraft}>
              მონახაზის შენახვა
            </Button>
            <Button disabled={saving} onClick={submit}>
              განაცხადის გაგზავნა
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
