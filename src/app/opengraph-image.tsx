import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Zippa — courier service across Georgia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#0f1c17",
          backgroundImage:
            "radial-gradient(circle at 85% 15%, #178f68 0%, rgba(23,143,104,0) 45%)",
          padding: "90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="96" height="96" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="112" fill="#178f68" />
            <g
              fill="none"
              stroke="#ffffff"
              strokeWidth="34"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M116 168h178v150H116z" />
              <path d="M294 216h74l52 52v50H294" />
              <circle cx="180" cy="360" r="30" />
              <circle cx="352" cy="360" r="30" />
            </g>
          </svg>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#ffffff", letterSpacing: -1 }}>
            Zippa
          </div>
        </div>
        <div style={{ marginTop: 40, fontSize: 40, color: "#cfe8df", maxWidth: 900 }}>
          Courier service across Georgia — fast, tracked, reliable.
        </div>
        <div style={{ marginTop: 24, fontSize: 28, color: "#7fb3a1" }}>zippa-eosin.vercel.app</div>
      </div>
    ),
    { ...size },
  );
}
