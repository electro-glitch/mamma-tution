import { supabase } from "@/lib/supabase";

/** Log an activity row. Best-effort — never throws to caller. */
export async function logActivity({ tutorId, actorId, actorRole = "tutor", entityType, entityId, action, description, meta = {} }) {
  try {
    await supabase.from("activity_log").insert({
      tutor_id: tutorId, actor_id: actorId, actor_role: actorRole,
      entity_type: entityType, entity_id: entityId, action, description, meta,
    });
  } catch (e) { /* noop */ }
}

export async function fetchStudents({ tutorId, status, search } = {}) {
  let q = supabase.from("students").select("*").order("full_name");
  if (tutorId) q = q.eq("tutor_id", tutorId);
  if (status) q = q.eq("status", status);
  if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,notes.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchStudent(id) {
  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchSlots(studentId) {
  const { data, error } = await supabase.from("schedule_slots").select("*").eq("student_id", studentId).order("day_of_week");
  if (error) throw error;
  return data || [];
}

export async function fetchSessionsRange({ tutorId, studentId, from, to } = {}) {
  let q = supabase.from("class_sessions").select("*, students(full_name)").order("session_date").order("start_time");
  if (tutorId) q = q.eq("tutor_id", tutorId);
  if (studentId) q = q.eq("student_id", studentId);
  if (from) q = q.gte("session_date", from);
  if (to) q = q.lte("session_date", to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchPayments({ tutorId, studentId } = {}) {
  let q = supabase.from("payments").select("*, students(full_name)").order("payment_date", { ascending: false });
  if (tutorId) q = q.eq("tutor_id", tutorId);
  if (studentId) q = q.eq("student_id", studentId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchActivity({ tutorId, limit = 50 } = {}) {
  let q = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (tutorId) q = q.eq("tutor_id", tutorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
