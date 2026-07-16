import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toDateStr, addDays, fmtTime, fmtDatePretty, fmtCurrency, DAYS_LONG, KIND_LABEL, STATUS_LABEL, statusBadgeClass, kindBadgeClass } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentDashboard() {
  const { user } = useAuth();
  const today = new Date();
  const todayStr = toDateStr(today);

  const { data: me, isLoading: mL } = useQuery({
    queryKey: ["me-student", user.id],
    queryFn: async () => (await supabase.from("students").select("*").eq("user_id", user.id).maybeSingle()).data,
  });

  const { data: slots } = useQuery({
    enabled: !!me?.id,
    queryKey: ["me-slots", me?.id],
    queryFn: async () => (await supabase.from("schedule_slots").select("*").eq("student_id", me.id).order("day_of_week")).data || [],
  });

  const { data: sessions, isLoading: seL } = useQuery({
    enabled: !!me?.id,
    queryKey: ["me-sessions", me?.id],
    queryFn: async () => (await supabase.from("class_sessions").select("*")
      .eq("student_id", me.id)
      .gte("session_date", toDateStr(addDays(today, -60)))
      .lte("session_date", toDateStr(addDays(today, 60)))
      .order("session_date").order("start_time")).data || [],
  });

  const { data: payments } = useQuery({
    enabled: !!me?.id,
    queryKey: ["me-fee-records", me?.id],
    queryFn: async () => (await supabase.from("fee_records").select("*").eq("student_id", me.id).order("month", { ascending: false })).data || [],
  });

  if (mL) return <div className="p-8"><Skeleton className="h-40 w-full" /></div>;
  if (!me) {
    return (
      <div className="p-8">
        <Card className="p-8 rounded-md border border-border shadow-none text-center">
          <div className="font-display text-lg">Your student record isn't linked yet</div>
          <p className="text-sm text-muted-foreground mt-2">Ask your tutor to link your account so you can see your schedule and fees.</p>
        </Card>
      </div>
    );
  }

  const todays = (sessions || []).filter((s) => s.session_date === todayStr);
  const next = (sessions || []).find((s) => (s.session_date > todayStr || (s.session_date === todayStr && s.status === "scheduled")) && s.status === "scheduled");
  const upcomingTests = (sessions || []).filter((s) => s.kind === "test" && s.session_date >= todayStr);
  const past = (sessions || []).filter((s) => s.session_date < todayStr && ["present", "absent"].includes(s.status));
  const presentPct = past.length ? Math.round((past.filter((s) => s.status === "present").length / past.length) * 100) : 0;
  const paid = (payments || []).reduce((a, p) => a + Number(p.amount_paid || 0), 0);

  return (
    <div>
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Welcome</div>
        <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">{me.full_name}</h1>
        <div className="text-sm text-muted-foreground mt-1">{fmtDatePretty(today)}</div>
      </div>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 rounded-md border border-border shadow-none" data-testid="student-metric-next">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Next class</div>
            {next ? (
              <>
                <div className="font-display text-2xl font-bold mt-2 tracking-tight">{fmtTime(next.start_time)}</div>
                <div className="text-sm text-muted-foreground mt-1 font-mono">{next.session_date}</div>
                <Badge className={`${kindBadgeClass(next.kind)} rounded-sm border-0 mt-3`}>{KIND_LABEL[next.kind]}</Badge>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mt-3">No upcoming classes.</div>
            )}
          </Card>
          <Card className="p-5 rounded-md border border-border shadow-none" data-testid="student-metric-attendance">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Attendance</div>
            <div className="font-display text-2xl font-bold mt-2 tracking-tight">{presentPct}%</div>
            <div className="text-xs text-muted-foreground mt-1">over {past.length} past sessions</div>
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${presentPct}%` }} />
            </div>
          </Card>
          <Card className="p-5 rounded-md border border-border shadow-none" data-testid="student-metric-balance">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending balance</div>
            <div className="font-display text-2xl font-bold mt-2 tracking-tight tabular-nums">{fmtCurrency(me.pending_balance)}</div>
            <div className="text-xs text-muted-foreground mt-1">Due on the {me.due_day} of each month</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="rounded-md border border-border shadow-none">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recurring</div>
              <div className="font-display font-semibold">Weekly schedule</div>
            </div>
            <div className="divide-y divide-border">
              {(slots || []).length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No recurring slots yet.</div>
              ) : (slots || []).map((s) => (
                <div key={s.id} className="px-5 py-3 flex justify-between">
                  <div className="text-sm">{DAYS_LONG[s.day_of_week]}</div>
                  <div className="text-sm font-mono">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="rounded-md border border-border shadow-none">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</div>
              <div className="font-display font-semibold">Your classes</div>
            </div>
            <div className="divide-y divide-border">
              {seL ? (
                <div className="p-5 space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : todays.length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">Nothing scheduled today.</div>
              ) : todays.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="font-mono text-sm w-20">{fmtTime(s.start_time)}</div>
                  <div className="flex-1 text-sm">{s.topic || "Class"}</div>
                  <Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0`}>{STATUS_LABEL[s.status]}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="rounded-md border border-border shadow-none">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">History</div>
              <div className="font-display font-semibold">Payments (paid {fmtCurrency(paid)})</div>
            </div>
            <div className="divide-y divide-border">
              {(payments || []).length === 0 ? (
                <div className="p-8 text-sm text-muted-foreground text-center">No fee records yet.</div>
              ) : (payments || []).slice(0, 6).map((p) => {
                const label = new Date(p.month + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
                const bal = Math.max(0, Number(p.amount_due) - Number(p.amount_paid));
                return (
                  <div key={p.id} className="px-5 py-3 flex justify-between text-sm">
                    <div>
                      <div>{label}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.status === "paid" ? `Paid ${p.paid_date} · ${p.method || "—"}` : `Balance ${fmtCurrency(bal)}`}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono">{fmtCurrency(p.amount_paid)}</div>
                      <div className={`text-xs ${p.status === "paid" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>{p.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
