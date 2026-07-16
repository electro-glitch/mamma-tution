import { supabase } from "@/lib/supabase";
import { toDateStr } from "@/lib/dates";

/**
 * Fee model
 * - fee_records: one row per (student, month). month = first day of month.
 * - Due date each month is the 15th.
 * - days_delayed:
 *     if paid → paid_date - due_date  (0 if paid on/before due)
 *     if unpaid and month is current or past → today - due_date  (0 if before due)
 */
export const FEE_DUE_DAY = 15;

export function monthStart(dateOrStr) {
  const d = typeof dateOrStr === "string" ? new Date(`${dateOrStr}T00:00:00`) : dateOrStr;
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function monthLabel(d) { return d.toLocaleDateString(undefined, { month: "long", year: "numeric" }); }

export function dueDateOf(monthStartDate) {
  const d = new Date(monthStartDate); d.setDate(FEE_DUE_DAY); d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(a, b) {
  return Math.round((a.getTime() - b.getTime()) / (24 * 3600 * 1000));
}

/**
 * Returns the delay in days for a fee record:
 *   - paid:          days between paid_date and due_date (0 if on time)
 *   - unpaid, overdue: days since due_date (> 0)
 *   - unpaid, not yet due: null  (use this to render "—" in the UI)
 */
export function computeDelay(record) {
  const mStart = new Date(`${record.month}T00:00:00`);
  const due = dueDateOf(mStart);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (record.status === "paid" && record.paid_date) {
    const paid = new Date(`${record.paid_date}T00:00:00`);
    return Math.max(0, diffDays(paid, due));
  }
  if (record.status !== "paid") {
    if (today > due) return Math.max(1, diffDays(today, due));
    // Due date hasn't arrived yet — not delayed
    return null;
  }
  return 0;
}

/** True when an unpaid record is past its due date */
export function isOverdue(record) {
  if (record.status === "paid") return false;
  const mStart = new Date(`${record.month}T00:00:00`);
  const due = dueDateOf(mStart);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return today > due;
}

/**
 * Ensure the fee_records table has a row for every active student for the
 * given (start, end) month range. Only creates MISSING rows (idempotent).
 * 
 * IMPORTANT: startMonthDate should be the CURRENT month, not a past month.
 * Past months are historical and should not retroactively receive new students.
 */
export async function ensureFeeRecordsRange(tutorId, startMonthDate, endMonthDate) {
  const months = [];
  let cur = new Date(startMonthDate);
  cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const end = new Date(endMonthDate);
  while (cur <= end) {
    months.push(toDateStr(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  await Promise.all(months.map((m) => supabase.rpc("ensure_fee_records_for_month", { _tutor: tutorId, _month: m })));
}

/**
 * Create a fee record for a single newly-added student for the current month only.
 * Used when adding a new student so only the current month gets their record,
 * not any past months.
 */
export async function ensureFeeRecordForStudent(tutorId, studentId, feeAmount, dueDay) {
  const now = new Date();
  const monthStr = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  // Insert only if no record exists yet for this student+month
  const { data: existing } = await supabase
    .from("fee_records")
    .select("id")
    .eq("student_id", studentId)
    .eq("month", monthStr)
    .maybeSingle();
  if (existing) return; // already exists
  await supabase.from("fee_records").insert({
    tutor_id: tutorId,
    student_id: studentId,
    month: monthStr,
    amount_due: feeAmount,
    amount_paid: 0,
    status: "unpaid",
    due_day: dueDay ?? 15,
  });
}
