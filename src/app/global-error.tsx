"use client";

export default function GlobalError() {
  return (
    <html lang="ka">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: ".5rem" }}>რაღაც შეფერხდა</h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          გვერდის ჩატვირთვისას მოხდა შეცდომა. სცადე თავიდან.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#157a5a",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: ".6rem 1.2rem",
            fontSize: ".9rem",
            cursor: "pointer",
          }}
        >
          გვერდის განახლება
        </button>
      </body>
    </html>
  );
}
