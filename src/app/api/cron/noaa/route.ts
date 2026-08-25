// Daily NOAA rainfall sync — triggered by Vercel Cron (see vercel.json).
// Pulls the rolling precipitation window for GHCND:USC00111436 into the DB,
// then records the sync in the audit ledger as an [M] observation.

import { NextResponse, type NextRequest } from "next/server";
import { syncNoaaPrecip, NOAA_STATION } from "@/lib/noaa";
import { appendEntry } from "@/lib/ledger";

// Never cached / prerendered — it mutates the DB.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Reject anything else.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncNoaaPrecip(10);
    await appendEntry({
      entry_type: "observation",
      tag: "M",
      subject: `noaa:precip:${NOAA_STATION}`,
      payload: result,
      actor: "cron:noaa",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
