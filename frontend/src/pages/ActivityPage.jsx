import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";

export default function ActivityPage() {
  const { user } = useAuth();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["activity-full", user.id],
    queryFn: async () => (await supabase.from("activity_log").select("*")
      .eq("tutor_id", user.id).order("created_at", { ascending: false }).limit(300)).data || [],
  });

  const groups = (rows || []).reduce((acc, r) => {
    const day = new Date(r.created_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    (acc[day] = acc[day] || []).push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Immutable</div>
        <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">Activity log</h1>
      </div>
      <div className="p-8 max-w-3xl">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : Object.keys(groups).length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground border border-border shadow-none">No activity yet.</Card>
        ) : Object.entries(groups).map(([day, items]) => (
          <div key={day} className="mb-8">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground pb-2 border-b border-border">{day}</div>
            <div className="divide-y divide-border">
              {items.map((r) => (
                <div key={r.id} className="py-3 flex gap-4">
                  <div className="font-mono text-xs text-muted-foreground w-16 shrink-0 pt-0.5">{new Date(r.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="flex-1">
                    <div className="text-sm">{r.description}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
