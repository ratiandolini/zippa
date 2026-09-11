"use client";

import useSWR from "swr";
import { jsonFetcher } from "@/lib/fetcher";
import { COMPANY } from "@/lib/company";
import { Printer } from "lucide-react";

interface CompanyProfile {
  legalName: string;
  taxId: string;
  contactPersonName: string;
  status: string;
  lastAcceptance: { contractVersion: string; acceptedAt: string } | null;
  activePricing: { pricingMode: string } | null;
}
interface Contract {
  version: string;
  title: string;
  clauses: { title: string; body: string }[];
}

// ბეჭდვა-ზე დაფუძნებული PDF — იმავე pattern-ის, რასაც /receipt/[id] იყენებს
// (browser-ის "შენახვა PDF-ად"), ცალკე PDF-გენერაციის დამატებითი დამოკიდებულების გარეშე.
export default function CompanyContractPdfPage() {
  const { data: profileData } = useSWR<{ profile: CompanyProfile | null }>("/api/company", jsonFetcher);
  const { data: contract } = useSWR<Contract>("/api/company/contract", jsonFetcher);
  const profile = profileData?.profile;

  if (!contract) return <p className="p-6 text-sm text-muted-foreground">იტვირთება…</p>;

  return (
    <div className="mx-auto max-w-2xl px-5 py-6">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#157a5a] px-4 py-2 text-sm font-medium text-white"
        >
          <Printer className="h-4 w-4" /> ბეჭდვა / PDF
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-800 print:border-0 print:p-0">
        <div className="mb-6 flex items-start justify-between border-b border-dashed border-gray-300 pb-4">
          <div>
            <div className="text-xl font-bold">{COMPANY.brand}</div>
            <div className="mt-1 text-xs text-gray-500">
              {COMPANY.name} · ს/კ {COMPANY.taxId}
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>{contract.title}</div>
            <div>ვერსია {contract.version}</div>
          </div>
        </div>

        {profile && (
          <div className="mb-6 space-y-1 text-xs text-gray-600">
            <div>პარტნიორი: {profile.legalName}</div>
            <div>ს/კ: {profile.taxId}</div>
            <div>წარმომადგენელი: {profile.contactPersonName}</div>
            {profile.lastAcceptance && (
              <div>
                თანხმობის თარიღი: {new Date(profile.lastAcceptance.acceptedAt).toLocaleString("ka-GE")} (ვერსია{" "}
                {profile.lastAcceptance.contractVersion})
              </div>
            )}
            {profile.status === "APPROVED" && (
              <div>ტარიფი: {profile.activePricing ? "ინდივიდუალური (დამტკიცებული)" : "საჯარო (default)"}</div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {contract.clauses.map((c) => (
            <div key={c.title}>
              <p className="font-medium">{c.title}</p>
              <p className="mt-1 text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-xs text-gray-400">
          გენერირებულია: {new Date().toLocaleString("ka-GE")}
        </div>
      </div>
    </div>
  );
}
