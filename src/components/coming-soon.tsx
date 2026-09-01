import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent className="grid place-items-center gap-2 p-16 text-center">
          <span className="text-sm font-medium">მალე</span>
          <p className="max-w-sm text-sm text-muted-foreground">{note}</p>
        </CardContent>
      </Card>
    </>
  );
}
