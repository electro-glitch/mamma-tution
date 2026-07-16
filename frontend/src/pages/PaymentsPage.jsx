import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCurrency, toDateStr } from "@/lib/dates";
import { computeDelay, ensureFeeRecordsRange, monthStart, monthLabel, FEE_DUE_DAY } from "@/lib/fees";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { DownloadSimple } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

const METHODS = ["Cash", "ICICI", "UTK"];

function groupByMonth(records) {
  const g = {};
  for (const r of records) { (g[r.month] = g[r.month] || []).push(r); }
  return Object.keys(g).sort((a, b) => b.localeCompare(a)).map((k) => ({ month: k, rows: g[k] }));
}

export default function PaymentsPage() {
  const { user, profile } = useAuth();
  const isTutor = profile?.role === "tutor";
  const qc = useQueryClient();
  const [scope, setScope] = useState("all");

  const { data: students } = useQuery({
    enabled: isTutor,
    queryKey: ["fee-students", user.id],
    queryFn: async () => (await supabase.from("students").select("*").eq("tutor_id", user.id).eq("status", "active").order("full_name")).data || [],
  });

  useEffect(() => {
    if (!isTutor || !user?.id) return;
    const now = new Date();
    // Only generate the current month's records.
    // When a new month begins and this page is opened, that month's record
    // gets created automatically — no pre-generation of future months.
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    ensureFeeRecordsRange(user.id, start, start).then(() => qc.invalidateQueries({ queryKey: ["fee-records"] }));
  }, [isTutor, user?.id, students?.length, qc]);

  const { data: records, refetch } = useQuery({
    queryKey: ["fee-records", user.id, isTutor],
    queryFn: async () => {
      let q = supabase.from("fee_records")
        .select("*, students(id, full_name, phone, created_at)")
        .order("month", { ascending: false });
      if (isTutor) q = q.eq("tutor_id", user.id);
      const raw = (await q).data || [];
      // Never show a fee record for a month before the student joined.
      return raw.filter(r => {
        if (!r.students?.created_at) return true; // keep if no join date available
        const joinDate = new Date(r.students.created_at);
        const joinMonthStr = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, "0")}-01`;
        return r.month >= joinMonthStr;
      });
    },
  });

  function refreshAll() {
    refetch();
    qc.invalidateQueries({ queryKey: ["fee-students"] });
    qc.invalidateQueries({ queryKey: ["outstanding-months"] });
  }

  const filtered = (records || []).filter((r) => {
    if (scope === "pending") return r.status !== "paid";
    if (scope === "paid") return r.status === "paid";
    return true;
  });
  const groups = groupByMonth(filtered);

  const totals = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = toDateStr(monthStart(now));
    
    const paidCurrent = (records || []).filter((r) => r.month === currentMonthPrefix && r.status === "paid").reduce((a, r) => a + Number(r.amount_paid || 0), 0);
    const pendingOverall = (records || []).filter((r) => r.status !== "paid").reduce((a, r) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);
    const pendingCurrent = (records || []).filter((r) => r.month === currentMonthPrefix && r.status !== "paid").reduce((a, r) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);
    
    // Top 3 delayed: rank by oldest unpaid month (i.e. how long ago they first went unpaid).
    // This works even before the due date has passed — whoever has the oldest unpaid
    // record is ranked highest. Among ties, break by total accumulated overdue days.
    const studentUnpaid = {};
    const todayMs = new Date().setHours(0,0,0,0);
    (records || []).filter(r => r.status !== "paid").forEach(r => {
      const monthMs = new Date(r.month + "T00:00:00").getTime();
      if (!studentUnpaid[r.student_id]) {
        studentUnpaid[r.student_id] = {
          name: r.students?.full_name,
          oldestMonthMs: monthMs,
          totalDelay: 0,
        };
      }
      // Track the oldest unpaid month
      if (monthMs < studentUnpaid[r.student_id].oldestMonthMs) {
        studentUnpaid[r.student_id].oldestMonthMs = monthMs;
      }
      // Add overdue days (null means not yet due → treat as 0)
      studentUnpaid[r.student_id].totalDelay += (computeDelay(r) ?? 0);
    });
    const topDelayed = Object.values(studentUnpaid)
      .filter(s => s.name) // skip records without student name
      .sort((a, b) => a.oldestMonthMs - b.oldestMonthMs || b.totalDelay - a.totalDelay)
      .slice(0, 3)
      .map(s => ({
        name: s.name,
        delay: s.totalDelay,
        monthsUnpaid: Math.round((todayMs - s.oldestMonthMs) / (1000 * 60 * 60 * 24 * 30)),
      }));

    return { paidCurrent, pendingOverall, pendingCurrent, topDelayed };
  }, [records]);

  async function togglePaid(record, isChecked) {
    const queryKey = ["fee-records", user.id, isTutor];
    const today = toDateStr(new Date());
    const updates = {
      status: isChecked ? "paid" : "unpaid",
      amount_paid: isChecked ? record.amount_due : 0,
      paid_date: isChecked ? (record.paid_date || today) : null,
      method: isChecked ? (record.method || null) : null,
    };

    // ── Optimistic update: flip the UI instantly ──
    const previous = qc.getQueryData(queryKey);
    qc.setQueryData(queryKey, (old) =>
      (old || []).map((r) => r.id === record.id ? { ...r, ...updates } : r)
    );

    try {
      const { error } = await supabase.from("fee_records").update(updates).eq("id", record.id);
      if (error) throw error;

      // Fire-and-forget background updates (don't await — don't block UI)
      supabase.from("fee_records")
        .select("amount_due, amount_paid")
        .eq("student_id", record.student_id)
        .neq("status", "paid")
        .then(({ data: freshOut }) => {
          const pending = (freshOut || []).reduce((a, r) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);
          supabase.from("students").update({ pending_balance: pending }).eq("id", record.student_id);
        });

      if (isChecked) {
        supabase.from("activity_log").insert({
          actor_id: user.id, actor_role: "tutor", tutor_id: user.id,
          entity_type: "fee_record", action: "payment.recorded",
          description: `Received ${fmtCurrency(record.amount_due)} from ${record.students?.full_name} for ${monthLabel(new Date(record.month + "T00:00:00"))}`,
        });
      }

      toast.success(isChecked ? "Marked as paid" : "Marked as unpaid");
      // Background refresh to sync any derived data
      qc.invalidateQueries({ queryKey: ["fee-students"] });
      qc.invalidateQueries({ queryKey: ["outstanding-months"] });
    } catch(e) {
      // Roll back on failure
      qc.setQueryData(queryKey, previous);
      toast.error("Failed to update: " + (e?.message || e));
    }
  }

  async function updateRecordField(id, field, value) {
    const queryKey = ["fee-records", user.id, isTutor];
    const previous = qc.getQueryData(queryKey);
    // Optimistic update
    qc.setQueryData(queryKey, (old) =>
      (old || []).map((r) => r.id === id ? { ...r, [field]: value } : r)
    );
    try {
      const { error } = await supabase.from("fee_records").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    } catch(e) {
      qc.setQueryData(queryKey, previous);
      toast.error("Failed to save");
    }
  }

  function exportExcel() {
    if (!(records || []).length) { toast.error("Nothing to export"); return; }
    const rows = records.map((r) => ({
      Student: r.students?.full_name,
      Phone: r.students?.phone,
      Month: monthLabel(new Date(r.month + "T00:00:00")),
      "Due (₹)": Number(r.amount_due),
      "Paid (₹)": Number(r.amount_paid),
      "Balance (₹)": Math.max(0, Number(r.amount_due) - Number(r.amount_paid)),
      "Paid on": r.paid_date || "",
      "Method": r.method || "",
      "Days delayed": computeDelay(r),
      "Status": r.status,
      "Notes": r.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fee records");
    const fname = `fees_${toDateStr(new Date())}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast.success(`Exported ${fname}`);
  }

  return (
    <div>
      <div className="border-b border-border bg-card px-4 md:px-8 py-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fees</div>
          <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">Payments</h1>
          <p className="text-xs text-muted-foreground mt-1">Fees are due on the <span className="font-mono">{FEE_DUE_DAY}th</span> of every month.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={scope} onValueChange={setScope}>
            <TabsList>
              <TabsTrigger value="all" data-testid="scope-all">All</TabsTrigger>
              <TabsTrigger value="pending" data-testid="scope-pending">Pending</TabsTrigger>
              <TabsTrigger value="paid" data-testid="scope-paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
          {isTutor && (
            <Button variant="outline" onClick={exportExcel} data-testid="export-excel">
              <DownloadSimple size={14} className="mr-1.5" /> Export Excel
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        {isTutor && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-5 rounded-md border border-border shadow-none">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Collected (Current)</div>
              <div className="font-display text-2xl font-bold mt-2 tabular-nums text-emerald-600 dark:text-emerald-400">{fmtCurrency(totals.paidCurrent)}</div>
            </Card>
            <Card className="p-5 rounded-md border border-border shadow-none">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending (Current)</div>
              <div className="font-display text-2xl font-bold mt-2 tabular-nums text-amber-600 dark:text-amber-400">{fmtCurrency(totals.pendingCurrent)}</div>
            </Card>
            <Card className="p-5 rounded-md border border-border shadow-none">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending (Overall)</div>
              <div className="font-display text-2xl font-bold mt-2 tabular-nums text-red-600 dark:text-red-400">{fmtCurrency(totals.pendingOverall)}</div>
            </Card>
            <Card className="p-4 rounded-md border border-border shadow-none flex flex-col justify-center">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Latest to Pay</div>
              {totals.topDelayed.length === 0 ? (
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="text-emerald-500">✓</span> All caught up
                </div>
              ) : (
                <div className="space-y-2">
                  {totals.topDelayed.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        i === 0 ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : i === 1 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-muted text-muted-foreground"
                      }`}>#{i + 1}</span>
                      <span className="text-sm font-medium truncate flex-1">{t.name}</span>
                      {t.delay > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-mono text-xs shrink-0">{t.delay}d late</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {groups.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground border border-border shadow-none">No fee records yet.</Card>
        ) : groups.map((g) => {
          const totalFees = g.rows.reduce((a, r) => a + Number(r.amount_due || 0), 0);
          const totalReceived = g.rows.reduce((a, r) => a + Number(r.amount_paid || 0), 0);
          return (
          <Card key={g.month} className="rounded-md border border-border shadow-none overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-accent/40">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Month</div>
                <div className="font-display font-semibold">{monthLabel(new Date(g.month + "T00:00:00"))}</div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Due</div>
                  <div className="font-mono font-semibold text-sm">{fmtCurrency(totalFees)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Due 15th</div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {new Date(g.month + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground bg-accent/20">
                    <th className="px-4 py-3 font-medium border-r border-border">Name</th>
                    <th className="px-4 py-3 font-medium border-r border-border">Fees</th>
                    <th className="px-4 py-3 font-medium border-r border-border text-center">Fees Received</th>
                    <th className="px-4 py-3 font-medium border-r border-border">Date Received</th>
                    <th className="px-4 py-3 font-medium border-r border-border">Mode of Payment</th>
                    <th className="px-4 py-3 font-medium">Days Delayed</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const isPaid = r.status === "paid";
                    const rowClass = isPaid ? "fee-row-paid" : "fee-row-unpaid";
                    const delay = computeDelay(r);
                    return (
                       <tr key={r.id} className={`border-b border-border last:border-0 ${rowClass}`}>
                         <td className="px-4 py-2 border-r border-border font-medium text-sm bg-background/50">
                           {isTutor ? <Link to={`/students/${r.student_id}`} className="hover:underline">{r.students?.full_name}</Link> : r.students?.full_name}
                         </td>
                         <td className="px-4 py-2 border-r border-border font-mono text-sm bg-background/50">{fmtCurrency(r.amount_due)}</td>
                         <td className="px-4 py-2 border-r border-border text-center">
                           {isTutor ? (
                             <div className="flex items-center justify-center">
                               <Checkbox 
                                 checked={isPaid} 
                                 onCheckedChange={(checked) => togglePaid(r, checked)} 
                                 className="w-5 h-5 rounded-sm border-foreground/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                               />
                             </div>
                           ) : (
                             isPaid ? "✅" : "❌"
                           )}
                         </td>
                         <td className="px-2 py-2 border-r border-border">
                           {isTutor ? (
                             <Input 
                               type="date" 
                               className="h-8 text-xs bg-transparent border-none shadow-none text-foreground/80" 
                               value={r.paid_date || ""} 
                               onChange={(e) => updateRecordField(r.id, "paid_date", e.target.value)}
                             />
                           ) : (
                             <span className="font-mono text-xs px-2">{r.paid_date || ""}</span>
                           )}
                         </td>
                         <td className="px-2 py-2 border-r border-border">
                           {isTutor ? (
                             <Select value={r.method || ""} onValueChange={(val) => updateRecordField(r.id, "method", val)}>
                               <SelectTrigger className={`h-8 text-xs border-none shadow-none ${r.method ? 'method-' + r.method.toLowerCase() : 'bg-transparent text-foreground/60'}`}>
                                 <SelectValue placeholder="Select..." />
                               </SelectTrigger>
                               <SelectContent>
                                 {METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                               </SelectContent>
                             </Select>
                           ) : (
                             <span className="text-sm px-2">{r.method || "—"}</span>
                           )}
                         </td>
                         <td className="px-4 py-2 font-mono text-sm bg-background/50">
                           {delay === null ? (
                             <span className="text-muted-foreground/50">—</span>
                           ) : delay === 0 ? (
                             <span className="text-emerald-600 dark:text-emerald-400">0</span>
                           ) : (
                             <span className="text-red-600 dark:text-red-400 font-semibold">{delay}d</span>
                           )}
                         </td>
                       </tr>
                    )
                  })}
                  <tr className="bg-accent/10 border-t-2 border-border font-semibold text-sm">
                     <td className="px-4 py-3 border-r border-border uppercase tracking-widest text-[10px]">Total Fees</td>
                     <td className="px-4 py-3 border-r border-border font-mono">{fmtCurrency(totalFees)}</td>
                     <td className="px-4 py-3 border-r border-border text-center text-[10px] uppercase text-muted-foreground tracking-widest">Total Received</td>
                     <td className="px-4 py-3 border-r border-border font-mono">{fmtCurrency(totalReceived)}</td>
                     <td colSpan={2} className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )})}
      </div>
    </div>
  );
}
