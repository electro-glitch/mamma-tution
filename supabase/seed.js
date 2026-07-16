/* eslint-disable */
// One-shot seed script. Requires Node 18+ (global fetch).
// Usage: node /app/supabase/seed.js
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(Boolean).filter((l) => !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  })
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const phoneToEmail = (p) => `${String(p).replace(/\D/g, "")}@phone.tutor.app`;

async function ensureUser(phone, password, fullName, role) {
  const email = phoneToEmail(phone);
  // Try find existing
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  let user;
  if (found) {
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    user = found;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName, phone, role },
    });
    if (error) throw error;
    user = data.user;
  }
  await admin.from("profiles").upsert({
    id: user.id, role, full_name: fullName, phone,
    timezone: "Asia/Kolkata",
  }, { onConflict: "id" });
  return user;
}

function daysFromMonday(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff + offset);
  return d;
}
const fmtDate = (d) => d.toISOString().slice(0, 10);

async function run() {
  console.log("Seeding tutor...");
  const tutor = await ensureUser("9999999999", "tutor123", "Aditi Sharma", "tutor");

  // Clean prior seed rows for this tutor
  await admin.from("class_sessions").delete().eq("tutor_id", tutor.id);
  await admin.from("payments").delete().eq("tutor_id", tutor.id);
  await admin.from("activity_log").delete().eq("tutor_id", tutor.id);
  await admin.from("students").delete().eq("tutor_id", tutor.id);

  const studentsDef = [
    { name: "Rohan Verma", phone: "9111100001", fee: 4500, dueDay: 5, slots: [[1, "17:00", "18:00"], [4, "17:00", "18:00"]] },
    { name: "Ishita Nair", phone: "9111100002", fee: 5000, dueDay: 1, slots: [[2, "18:30", "19:30"], [5, "18:30", "19:30"]] },
    { name: "Kabir Mehta", phone: "9111100003", fee: 3500, dueDay: 10, slots: [[3, "16:00", "17:00"]] },
    { name: "Ananya Rao", phone: "9111100004", fee: 6000, dueDay: 15, slots: [[0, "10:00", "11:30"], [6, "10:00", "11:30"]] },
  ];

  for (const s of studentsDef) {
    console.log("  Creating student:", s.name);
    const studentUser = await ensureUser(s.phone, "student123", s.name, "student");
    const { data: student, error: se } = await admin.from("students").insert({
      tutor_id: tutor.id, user_id: studentUser.id, full_name: s.name, phone: s.phone,
      fee_amount: s.fee, due_day: s.dueDay, pending_balance: s.fee,
      status: "active",
      notes: "Auto-seeded record",
    }).select().single();
    if (se) { console.error(se); continue; }

    const slotIds = [];
    for (const [dow, st, et] of s.slots) {
      const { data: slot } = await admin.from("schedule_slots").insert({
        student_id: student.id, day_of_week: dow, start_time: st, end_time: et,
      }).select().single();
      slotIds.push({ id: slot.id, dow, st, et });
    }

    // Materialise past 2 weeks + next 4 weeks of sessions
    for (let w = -2; w <= 4; w++) {
      for (const slot of slotIds) {
        const d = daysFromMonday((slot.dow === 0 ? 6 : slot.dow - 1) + w * 7);
        const isPast = d < new Date(new Date().setHours(0, 0, 0, 0));
        let status = "scheduled";
        if (isPast) {
          const r = Math.random();
          if (r < 0.7) status = "present";
          else if (r < 0.85) status = "absent";
          else status = "student_cancelled";
        }
        await admin.from("class_sessions").insert({
          tutor_id: tutor.id, student_id: student.id,
          session_date: fmtDate(d), start_time: slot.st, end_time: slot.et,
          kind: "regular", status, source_slot_id: slot.id,
          compensation_status: status === "student_cancelled" ? "pending" : "none",
        });
      }
    }

    // One upcoming test
    const testDate = daysFromMonday(7 + Math.floor(Math.random() * 5));
    await admin.from("class_sessions").insert({
      tutor_id: tutor.id, student_id: student.id,
      session_date: fmtDate(testDate), start_time: "16:00", end_time: "17:00",
      kind: "test", status: "scheduled",
      topic: "Chapter Review Test",
    });

    // One recent payment
    await admin.from("payments").insert({
      tutor_id: tutor.id, student_id: student.id,
      amount: Math.floor(s.fee / 2), payment_date: fmtDate(daysFromMonday(-10)),
      method: "UPI", notes: "Partial payment",
    });
    await admin.from("students").update({
      pending_balance: s.fee - Math.floor(s.fee / 2),
    }).eq("id", student.id);

    await admin.from("activity_log").insert({
      actor_id: tutor.id, actor_role: "tutor", tutor_id: tutor.id,
      entity_type: "student", entity_id: student.id,
      action: "student.created", description: `Created student ${s.name}`,
    });
  }

  console.log("\nSeed complete.");
  console.log("Tutor login:  9999999999 / tutor123");
  console.log("Students login: 9111100001..04 / student123");
}

run().catch((e) => { console.error(e); process.exit(1); });
