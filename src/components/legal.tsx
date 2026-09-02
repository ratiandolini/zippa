export function LegalDoc({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">ბოლო განახლება: {updated}</p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <strong>შენიშვნა:</strong> დოკუმენტი მომზადებულია შაბლონის საფუძველზე.
        რეკომენდებულია იურისტთან გადამოწმება.
      </div>

      <div className="space-y-5 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </article>
  );
}

export function Sec({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function L({ children }: { children: React.ReactNode }) {
  return <ul className="ml-5 list-disc space-y-1">{children}</ul>;
}
