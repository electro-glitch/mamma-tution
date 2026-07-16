import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toDateStr, addDays, startOfWeek, fmtTime, fmtDatePretty, fmtCurrency, KIND_LABEL, STATUS_LABEL, statusBadgeClass, kindBadgeClass, DAYS } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Users, WarningCircle, CurrencyInr, CalendarBlank } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";

function PageHeader({ title, sub }) {
  return (
    <div className="border-b border-border bg-card px-8 py-6">
      <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">{title}</h1>
      {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function Metric({ label, value, sub, icon: Icon, testId }) {
  return (
    <Card className="p-5 rounded-md border border-border shadow-none" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <Icon size={16} weight="duotone" className="text-muted-foreground" />
      </div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

export default function TutorDashboard() {
  const { user } = useAuth();
  const today = new Date();
  const todayStr = toDateStr(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const monthAhead = addDays(today, 30);

  const { data: students, isLoading: sL } = useQuery({
    queryKey: ["students", user.id],
    queryFn: async () => (await supabase.from("students").select("*").eq("tutor_id", user.id)).data || [],
  });

  const { data: sessions, isLoading: seL } = useQuery({
    queryKey: ["dashboard-sessions", user.id],
    queryFn: async () => (await supabase.from("class_sessions")
      .select("*, students(full_name)")
      .eq("tutor_id", user.id)
      .gte("session_date", toDateStr(addDays(today, -30)))
      .lte("session_date", toDateStr(monthAhead))
      .order("session_date").order("start_time")).data || [],
  });

  const { data: feeRecords } = useQuery({
    queryKey: ["dashboard-fee-records", user.id],
    queryFn: async () => (await supabase.from("fee_records").select("student_id, amount_due, amount_paid, status, month, paid_date")
      .eq("tutor_id", user.id)).data || [],
  });

  const { data: activity } = useQuery({
    queryKey: ["dashboard-activity", user.id],
    queryFn: async () => (await supabase.from("activity_log").select("*")
      .eq("tutor_id", user.id).order("created_at", { ascending: false }).limit(10)).data || [],
  });

  const activeStudents = students?.filter((s) => s.status === "active") || [];
  const todaysClasses = (sessions || []).filter((s) => s.session_date === todayStr && s.kind !== "test");
  const upcomingClasses = (sessions || []).filter((s) => s.session_date > todayStr && s.status === "scheduled").slice(0, 8);
  const absentToday = todaysClasses.filter((s) => s.status === "absent");
  const pendingRecords = (feeRecords || []).filter((r) => r.status !== "paid");
  const pendingTotal = pendingRecords.reduce((a, r) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);
  const pendingStudentIds = new Set(pendingRecords.map((r) => r.student_id));

  const weekSessions = (sessions || []).filter((s) => s.session_date >= toDateStr(weekStart) && s.session_date <= toDateStr(weekEnd));
  const load = Array.from({ length: 7 }, (_, i) => {
    const d = toDateStr(addDays(weekStart, i));
    const count = weekSessions.filter((s) => s.session_date === d).length;
    return { day: DAYS[(weekStart.getDay() + i) % 7], count };
  });

  const attendance = (sessions || []).filter((s) => s.session_date < todayStr && ["present", "absent"].includes(s.status));
  const presentPct = attendance.length ? Math.round((attendance.filter((s) => s.status === "present").length / attendance.length) * 100) : 0;

  const loading = sL || seL;
  return (
    <div>
      <PageHeader title="Dashboard" sub={fmtDatePretty(today)} />
      <div className="p-8 space-y-6">
        {/* Metric strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Metric testId="metric-todays-classes" label="Today's classes" value={loading ? "—" : todaysClasses.length} sub={loading ? "\u00A0" : `${activeStudents.length} active students`} icon={CalendarBlank} />
          <Metric testId="metric-absent-today" label="Absent today" value={loading ? "—" : absentToday.length} sub={loading ? "\u00A0" : "Marked as absent"} icon={WarningCircle} />
          <Metric testId="metric-pending-payments" label="Pending payments" value={loading ? "—" : fmtCurrency(pendingTotal)} sub={loading ? "\u00A0" : `${pendingStudentIds.size} students`} icon={CurrencyInr} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Today's schedule */}
          <Card className="lg:col-span-3 rounded-md shadow-none border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</div>
                <div className="font-display font-semibold">Schedule</div>
              </div>
              <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">Open calendar →</Link>
            </div>
            <div className="divide-y divide-border" data-testid="todays-schedule">
              {seL ? (
                <div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : todaysClasses.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No classes scheduled today.</div>
              ) : todaysClasses.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center gap-4 hover:bg-accent/40">
                  <div className="w-20 font-mono text-sm tabular-nums">{fmtTime(s.start_time)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.students?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                  </div>
                  <Badge className={`${kindBadgeClass(s.kind)} rounded-sm border-0 font-normal`}>{KIND_LABEL[s.kind]}</Badge>
                  <Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0 font-normal`}>{STATUS_LABEL[s.status]}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent activity */}
          <Card className="lg:col-span-2 rounded-md shadow-none border border-border">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recent</div>
              <div className="font-display font-semibold">Activity</div>
            </div>
            <div className="divide-y divide-border" data-testid="recent-activity">
              {(activity || []).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No activity yet.</div>
              ) : (activity || []).slice(0, 8).map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="text-sm">{a.description}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-md shadow-none border border-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">This week</div>
                <div className="font-display font-semibold">Teaching load</div>
              </div>
              <div className="font-mono text-sm text-muted-foreground">{weekSessions.length} sessions</div>
            </div>
            <div className="mt-4" style={{ width: "100%", height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={load}>
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--accent))" }}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="rounded-md shadow-none border border-border p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Attendance (past)</div>
            <div className="font-display font-semibold">Present rate</div>
            <div className="mt-4 flex items-end gap-3">
              <div className="font-display text-5xl font-bold tabular-nums">{presentPct}<span className="text-xl text-muted-foreground">%</span></div>
              <div className="text-xs text-muted-foreground pb-2">over {attendance.length} sessions</div>
            </div>
            <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${presentPct}%` }} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Upcoming</div>
                <div className="font-mono text-lg mt-1">{upcomingClasses.length}</div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Absent today</div>
                <div className="font-mono text-lg mt-1">{absentToday.length}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
