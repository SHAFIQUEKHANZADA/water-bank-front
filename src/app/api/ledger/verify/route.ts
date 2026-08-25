// Re-derive every hash in the chain and report the first break (if any).
// This is the "don't trust the DB, verify it" endpoint.

import { NextResponse } from "next/server";
import { verifyChain } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await verifyChain();
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
