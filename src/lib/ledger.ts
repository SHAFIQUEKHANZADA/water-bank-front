// Server-side audit ledger: append-only, SHA-256 hash-chained.
//
// The chain: each entry's hash = sha256(prev_hash + canonical(body)). The first
// entry chains from GENESIS. Corrections are NEW append entries that carry
// `references_hash` pointing at the entry they supersede — the prior entry is
// never amended (the DB triggers block UPDATE/DELETE too).
//
// This is what makes "the ledger resets on refresh" impossible: it lives in
// Postgres and is verified, not rebuilt client-side.

import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";

export const GENESIS_HASH = "0".repeat(64);

export type Tag = "M" | "C" | "E" | "R" | "V";
export type EntryType =
  | "observation"
  | "calculation"
  | "recommendation"
  | "review"
  | "correction";

export interface LedgerEntry {
  seq: number;
  entry_id: string;
  ts: string;
  entry_type: EntryType;
  tag: Tag;
  subject: string;
  payload: unknown;
  actor: string;
  references_hash: string | null;
  prev_hash: string;
  hash: string;
}

export interface NewEntry {
  entry_type: EntryType;
  tag: Tag;
  subject: string;
  payload: unknown;
  actor: string;
  references_hash?: string | null;
}

// Deterministic JSON: sorted keys so the same logical body always hashes the
// same, regardless of property insertion order.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

// The body that gets hashed. `ts` and `seq` are DB-assigned metadata and are
// deliberately EXCLUDED — `timestamptz` round-trips through postgres.js as a
// Date, not the exact text used at write time, which would make the hash
// unverifiable. `entry_id` (a unique UUID) already guarantees each entry hashes
// distinctly, so the chain integrity does not need the timestamp.
function entryHash(prevHash: string, e: NewEntry, entryId: string): string {
  const body = canonical({
    entry_id: entryId,
    entry_type: e.entry_type,
    tag: e.tag,
    subject: e.subject,
    payload: e.payload,
    actor: e.actor,
    references_hash: e.references_hash ?? null,
  });
  return createHash("sha256").update(prevHash + body).digest("hex");
}

// Append one entry. Runs in a transaction and locks the latest row so two
// concurrent appends can't fork the chain off the same prev_hash.
export async function appendEntry(entry: NewEntry): Promise<LedgerEntry> {
  return sql.begin(async (tx) => {
    const [last] = await tx<{ hash: string }[]>`
      select hash from ledger order by seq desc limit 1 for update
    `;
    const prevHash = last?.hash ?? GENESIS_HASH;

    const [{ entry_id }] = await tx<{ entry_id: string }[]>`
      select gen_random_uuid() as entry_id
    `;
    const hash = entryHash(prevHash, entry, entry_id);

    const [row] = await tx<LedgerEntry[]>`
      insert into ledger
        (entry_id, entry_type, tag, subject, payload, actor, references_hash, prev_hash, hash)
      values
        (${entry_id}, ${entry.entry_type}, ${entry.tag}, ${entry.subject},
         ${tx.json(entry.payload as never)}, ${entry.actor},
         ${entry.references_hash ?? null}, ${prevHash}, ${hash})
      returning *
    `;
    return row;
  });
}

// Record a correction: a new entry that supersedes an earlier one by hash.
export async function appendCorrection(
  supersedesHash: string,
  entry: Omit<NewEntry, "entry_type" | "references_hash">
): Promise<LedgerEntry> {
  return appendEntry({ ...entry, entry_type: "correction", references_hash: supersedesHash });
}

export async function getLedger(limit = 500): Promise<LedgerEntry[]> {
  return sql<LedgerEntry[]>`
    select * from ledger order by seq desc limit ${limit}
  `;
}

// Walk the whole chain oldest→newest and re-derive every hash. Returns the
// first break found, or ok:true. This is the "trust but verify" endpoint.
export async function verifyChain(): Promise<
  { ok: true; count: number } | { ok: false; brokenAtSeq: number; reason: string }
> {
  const rows = await sql<LedgerEntry[]>`select * from ledger order by seq asc`;
  let prevHash = GENESIS_HASH;
  for (const r of rows) {
    if (r.prev_hash !== prevHash) {
      return { ok: false, brokenAtSeq: Number(r.seq), reason: "prev_hash does not match chain" };
    }
    const expected = entryHash(
      prevHash,
      {
        entry_type: r.entry_type,
        tag: r.tag,
        subject: r.subject,
        payload: r.payload,
        actor: r.actor,
        references_hash: r.references_hash,
      },
      r.entry_id
    );
    if (expected !== r.hash) {
      return { ok: false, brokenAtSeq: Number(r.seq), reason: "hash does not match content" };
    }
    prevHash = r.hash;
  }
  return { ok: true, count: rows.length };
}
