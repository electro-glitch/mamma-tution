/**
 * Cleanup script: removes all pre-generated future fee records beyond next month.
 * Run from: frontend/ directory
 *   node src/scripts/cleanup_future_fees.js
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://cgiaoswhlnjihwzlnhod.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnaWFvc3dobG5qaWh3emxuaG9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE4NDM1NSwiZXhwIjoyMDk5NzYwMzU1fQ.MkCGb6_rV5weS39ar9x5VQ-pIu6fHaRgE3kGKFpU9gk";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const now = new Date();
  // Keep current month + next month. Delete anything after that.
  const cutoff = new Date(now.getFullYear(), now.getMonth() + 2, 1); // first day of month AFTER next month
  const cutoffStr = cutoff.toISOString().slice(0, 10); // e.g. "2026-09-01"

  console.log(`Current month: ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  console.log(`Keeping up to: ${new Date(now.getFullYear(), now.getMonth()+1, 1).toISOString().slice(0,7)}`);
  console.log(`Deleting all UNPAID fee records from ${cutoffStr} onwards...\n`);

  const { data: toDelete, error: fetchErr } = await sb
    .from("fee_records")
    .select("id, month, status")
    .gte("month", cutoffStr)
    .neq("status", "paid"); // never delete paid records

  if (fetchErr) {
    console.error("Failed to fetch:", fetchErr.message);
    process.exit(1);
  }

  console.log(`Found ${toDelete.length} future unpaid records to delete.`);

  if (toDelete.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const ids = toDelete.map(r => r.id);
  const { error: delErr } = await sb.from("fee_records").delete().in("id", ids);

  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }

  console.log(`✓ Deleted ${ids.length} future records.`);
  console.log("\nDone! The Payments page will now only show current and next month.");
}

run().catch(console.error);
