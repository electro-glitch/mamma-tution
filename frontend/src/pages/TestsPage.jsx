import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toDateStr, fmtTime, addDays, statusBadgeClass, STATUS_LABEL } from "@/lib/dates";

export default function TestsPage() {
  const { user, profile } = useAuth();
  const isTutor = profile?.role === "tutor";
  const today = toDateStr(new Date());
  const far = toDateStr(addDays(new Date(), 180));
  const past = toDateStr(addDays(new Date(), -365));

  const { data: upcoming } = useQuery({
    queryKey: ["tests-upcoming", user.id],
    queryFn: async () => {
      let q = supabase.from("class_sessions").select("*, students(full_name)")
        .eq("kind", "test").gte("session_date", today).lte("session_date", far)
        .order("session_date");
      if (isTutor) q = q.eq("tutor_id", user.id);
      return (await q).data || [];
    },
  });
  const { data: pastTests } = useQuery({
    queryKey: ["tests-past", user.id],
    queryFn: async () => {
      let q = supabase.from("class_sessions").select("*, students(full_name)")
        .eq("kind", "test").gte("session_date", past).lt("session_date", today)
        .order("session_date", { ascending: false });
      if (isTutor) q = q.eq("tutor_id", user.id);
      return (await q).data || [];
    },
  });

  const Row = ({ t }) => (
    <div className="grid grid-cols-[130px_140px_1fr_160px] items-center border-b last:border-b-0 border-border px-5 py-3">
      <div className="font-mono text-sm">{t.session_date}</div>
      <div className="font-mono text-xs text-muted-foreground">{fmtTime(t.start_time)}</div>
      <div className="text-sm truncate">
        <span className="font-medium">{t.students?.full_name}</span>
        {t.topic && <span className="text-muted-foreground"> · {t.topic}</span>}
      </div>
      <div><Badge className={`${statusBadgeClass(t.status)} rounded-sm border-0`}>{STATUS_LABEL[t.status]}</Badge></div>
    </div>
  );

  return (
    <div>
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Assessments</div>
        <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">Tests</h1>
      </div>
      <div className="p-8">
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming" data-testid="tests-upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="past" data-testid="tests-past">Past</TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="pt-6">
            <Card className="rounded-md border border-border shadow-none overflow-hidden">
              <div className="grid grid-cols-[130px_140px_1fr_160px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border px-5 py-2.5">
                <div>Date</div><div>Time</div><div>Student · Topic</div><div>Status</div>
              </div>
              {(upcoming || []).length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No upcoming tests.</div>
              ) : (upcoming || []).map((t) => <Row t={t} key={t.id} />)}
            </Card>
          </TabsContent>
          <TabsContent value="past" className="pt-6">
            <Card className="rounded-md border border-border shadow-none overflow-hidden">
              <div className="grid grid-cols-[130px_140px_1fr_160px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border px-5 py-2.5">
                <div>Date</div><div>Time</div><div>Student · Topic</div><div>Status</div>
              </div>
              {(pastTests || []).length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No past tests.</div>
              ) : (pastTests || []).map((t) => <Row t={t} key={t.id} />)}
            </Card>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground mt-4">Create tests from the Calendar → New class → Kind: Test.</p>
      </div>
    </div>
  );
}
