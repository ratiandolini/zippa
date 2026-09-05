export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, (data as { error?: string }).error || "შეცდომა");
  return data as T;
}

export async function api<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; issues?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
    // ვალიდაციის კონკრეტული შეტყობინება (რომელი ველია არასწორი) წინ უსწრებს
    // ზოგად "ვალიდაციის შეცდომა"-ს, რომელსაც სერვერი ყოველთვის აბრუნებს ZodError-ზე
    const fieldMsg = d.issues?.fieldErrors
      ? Object.values(d.issues.fieldErrors).flat()[0]
      : undefined;
    throw new HttpError(res.status, fieldMsg || d.issues?.formErrors?.[0] || d.error || "შეცდომა");
  }
  return data as T;
}
