// Audit ledger API.
//   GET  /api/ledger        → latest entries (persisted, never resets)
//   POST /api/ledger        → append a new entry (observation/calculation/…)
//
// Chain verification lives at GET /api/ledger/verify.

import { NextResponse, type NextRequest } from "next/server";
import { appendEntry, getLedger, type NewEntry, type Tag, type EntryType } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await getLedger();
  return NextResponse.json({ entries });
}

const TAGS: Tag[] = ["M", "C", "E", "R", "V"];
const TYPES: EntryType[] = ["observation", "calculation", "recommendation", "review", "correction"];

export async function POST(request: NextRequest) {
  let body: Partial<NewEntry>;
  try {
    body = (await request.json()) as Partial<NewEntry>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { entry_type, tag, subject, payload, actor, references_hash } = body;
  if (!entry_type || !TYPES.includes(entry_type))
    return NextResponse.json({ error: "invalid entry_type" }, { status: 400 });
  if (!tag || !TAGS.includes(tag))
    return NextResponse.json({ error: "invalid tag" }, { status: 400 });
  if (!subject || !actor || payload === undefined)
    return NextResponse.json({ error: "subject, actor, payload are required" }, { status: 400 });

  const entry = await appendEntry({
    entry_type,
    tag,
    subject,
    payload,
    actor,
    references_hash: references_hash ?? null,
  });
  return NextResponse.json({ entry }, { status: 201 });
}
