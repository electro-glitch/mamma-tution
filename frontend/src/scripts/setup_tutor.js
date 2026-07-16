/**
 * Setup script: clears all demo data and creates the real tutor account.
 * Run from: frontend/ directory
 *   node src/scripts/setup_tutor.js
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://cgiaoswhlnjihwzlnhod.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnaWFvc3dobG5qaWh3emxuaG9kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE4NDM1NSwiZXhwIjoyMDk5NzYwMzU1fQ.MkCGb6_rV5weS39ar9x5VQ-pIu6fHaRgE3kGKFpU9gk";

const TUTOR_PHONE = "9836373806";
const TUTOR_PASS  = "tanayandshruti@28297905";
const TUTOR_EMAIL = `${TUTOR_PHONE}@phone.tutor.app`;
const TUTOR_NAME  = "Tutor";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("=== Tutor Setup Script ===\n");

  // ── 1. Wipe all application data ──────────────────────────────────────────
  console.log("Deleting all application data...");

  const tables = [
    "fee_records",
    "class_sessions",
    "schedule_slots",
    "activity_log",
    "students",
    "profiles",
  ];

  for (const table of tables) {
    // Delete every row — match on a column that is always non-null
    const { error } = await sb.from(table).delete().gte("created_at", "2000-01-01");
    if (error && error.code !== "42P01" /* table doesn't exist */) {
      console.error(`  ✗ ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ cleared ${table}`);
    }
  }

  // ── 2. Delete all existing auth users ─────────────────────────────────────
  console.log("\nDeleting all existing auth users...");
  const { data: users, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) {
    console.error("  ✗ Could not list users:", listErr.message);
  } else {
    for (const u of users.users) {
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id);
      if (delErr) console.error(`  ✗ ${u.email}: ${delErr.message}`);
      else console.log(`  ✓ deleted user ${u.email}`);
    }
  }

  // ── 3. Create the tutor auth user ─────────────────────────────────────────
  console.log(`\nCreating tutor user: ${TUTOR_EMAIL}`);
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: TUTOR_EMAIL,
    password: TUTOR_PASS,
    email_confirm: true,
    user_metadata: { full_name: TUTOR_NAME, role: "tutor" },
  });

  if (createErr) {
    console.error("  ✗ Failed to create user:", createErr.message);
    process.exit(1);
  }

  const userId = created.user.id;
  console.log(`  ✓ Auth user created: ${userId}`);

  // ── 4. Create the profile row (role = tutor) ───────────────────────────────
  console.log("\nCreating profiles row...");
  const { error: profErr } = await sb.from("profiles").upsert({
    id: userId,
    full_name: TUTOR_NAME,
    role: "tutor",
    phone: TUTOR_PHONE,
  });

  if (profErr) {
    console.error("  ✗ profiles:", profErr.message);
  } else {
    console.log("  ✓ Profile created (role=tutor)");
  }

  console.log("\n=== Done! ===");
  console.log(`Phone:    ${TUTOR_PHONE}`);
  console.log(`Password: ${TUTOR_PASS}`);
  console.log("You can now log in at http://localhost:3000/auth\n");
}

run().catch(console.error);
