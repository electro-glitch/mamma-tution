/**
 * Cleanup: removes fee records for months BEFORE a student was created.
 * A student added in July 2026 should have no record for June 2026 or earlier.
 * 
 * Run from: frontend/ directory
 *   node src/scripts/cleanup_old_fees.js
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://cgiaoswhlnjihwzlnhod.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnaWFvc3dobG5qaWh3emxuaG9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE4NDM1NSwiZXhwIjoyMDk5NzYwMzU1fQ.MkCGb6_rV5weS39ar9x5VQ-pIu6fHaRgE3kGKFpU9gk";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("=== Cleanup: removing pre-join fee records ===\n");

  // Get all students with their creation date
  const { data: students, error: sErr } = await sb
    .from("students")
    .select("id, full_name, created_at");

  if (sErr) { console.error("Failed to fetch students:", sErr.message); process.exit(1); }
  console.log(`Found ${students.length} student(s).\n`);

  let totalDeleted = 0;

  for (const student of students) {
    // The month the student was created (first day of that month)
    const joinDate = new Date(student.created_at);
    const joinMonthStr = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, "0")}-01`;

    // Find all UNPAID fee records for this student before their join month
    const { data: stale, error: fErr } = await sb
      .from("fee_records")
      .select("id, month")
      .eq("student_id", student.id)
      .lt("month", joinMonthStr)   // month < join month
      .neq("status", "paid");      // never delete paid records

    if (fErr) {
      console.error(`  ✗ ${student.full_name}: ${fErr.message}`);
      continue;
    }

    if (!stale || stale.length === 0) {
      console.log(`  ✓ ${student.full_name}: no stale records`);
      continue;
    }

    const ids = stale.map(r => r.id);
    const months = stale.map(r => r.month).join(", ");
    const { error: dErr } = await sb.from("fee_records").delete().in("id", ids);

    if (dErr) {
      console.error(`  ✗ ${student.full_name}: delete failed: ${dErr.message}`);
    } else {
      console.log(`  ✓ ${student.full_name}: deleted ${ids.length} stale record(s) [${months}]`);
      totalDeleted += ids.length;
    }
  }

  console.log(`\nDone. Total records deleted: ${totalDeleted}`);
}

run().catch(console.error);
