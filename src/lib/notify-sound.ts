"use client";

// მოკლე "დინგი" Web Audio API-თ — ფაილის გარეშე, ოფლაინაც მუშაობს.

const KEY = "zippa_notify_sound";

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null;

export function playDing() {
  if (typeof window === "undefined" || !soundEnabled()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.25, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
    };

    tone(880, 0, 0.18); // A5
    tone(1174.66, 0.12, 0.28); // D6
  } catch {
    /* ignore */
  }
}
