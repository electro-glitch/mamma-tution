export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const pad = (n) => String(n).padStart(2, "0");

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfWeek(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  x.setDate(x.getDate() + diff);
  return x;
}
export function endOfWeek(d = new Date()) {
  const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); return e;
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth(), 1); return x; }
export function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

export function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${pad(m)} ${ampm}`;
}
export function fmtDatePretty(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function fmtDateFull(d) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
export function fmtCurrency(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export const STATUS_LABEL = {
  scheduled: "Scheduled",
  present: "Present",
  absent: "Absent",
  tutor_cancelled: "Tutor cancelled",
  student_cancelled: "Student cancelled",
  completed: "Completed",
};
export const KIND_LABEL = { regular: "Regular", extra: "Extra", test: "Test" };
export const COMP_LABEL = {
  none: "No compensation",
  pending: "Compensation pending",
  scheduled: "Compensation scheduled",
  completed: "Compensation completed",
  declined: "Compensation declined",
};

export function statusBadgeClass(status) {
  switch (status) {
    case "present": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "absent": return "bg-red-500/10 text-red-600 dark:text-red-400";
    case "tutor_cancelled": return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "student_cancelled": return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
    case "completed": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    default: return "bg-muted text-muted-foreground";
  }
}
export function kindBadgeClass(k) {
  switch (k) {
    case "extra": return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "test": return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
    default: return "bg-foreground/5 text-foreground/70";
  }
}
