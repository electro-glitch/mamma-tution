import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtCurrency, DAYS_LONG, fmtTime, toDateStr, KIND_LABEL, STATUS_LABEL, kindBadgeClass, statusBadgeClass, COMP_LABEL } from "@/lib/dates";
import { computeDelay, monthLabel, ensureFeeRecordsRange, FEE_DUE_DAY } from "@/lib/fees";
import { toast } from "sonner";
import { CaretLeft, Plus, Trash } from "@phosphor-icons/react";

export default function StudentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: student, refetch: refetchStudent } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => (await supabase.from("students").select("*").eq("id", id).maybeSingle()).data,
  });
  const { data: slots, refetch: refetchSlots } = useQuery({
    queryKey: ["student-slots", id],
    queryFn: async () => (await supabase.from("schedule_slots").select("*").eq("student_id", id).order("day_of_week")).data || [],
  });
  const { data: sessions } = useQuery({
    queryKey: ["student-sessions", id],
    queryFn: async () => (await supabase.from("class_sessions").select("*").eq("student_id", id).order("session_date", { ascending: false }).limit(60)).data || [],
  });
  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["student-fee-records", id],
    queryFn: async () => (await supabase.from("fee_records").select("*").eq("student_id", id).order("month", { ascending: false })).data || [],
  });

  const [slotForm, setSlotForm] = useState({ day_of_week: "1", start_time: "17:00", end_time: "18:00" });
  const [payForm, setPayForm] = useState({ month: "", amount: "", method: "UPI", notes: "", paid_date: toDateStr(new Date()) });
  const [editing, setEditing] = useState(false);
  const [studentForm, setStudentForm] = useState({});
  React.useEffect(() => { if (student) setStudentForm(student); }, [student]);

  // Ensure this student has fee_records for a rolling window
  React.useEffect(() => {
    if (!student || !user?.id) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 3, 1);
    ensureFeeRecordsRange(user.id, start, end).then(() => refetchPayments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, user?.id]);

  if (!student) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  async function addSlot() {
    const { error } = await supabase.from("schedule_slots").insert({
      student_id: id, day_of_week: Number(slotForm.day_of_week),
      start_time: slotForm.start_time, end_time: slotForm.end_time,
    });
    if (error) return toast.error(error.message);
    toast.success("Slot added"); refetchSlots();
  }
  async function delSlot(sid) {
    await supabase.from("schedule_slots").delete().eq("id", sid);
    refetchSlots();
  }
  async function addPayment() {
    if (!payForm.month) return toast.error("Choose a month");
    const target = (payments || []).find((r) => r.month === payForm.month);
    if (!target) return toast.error("Fee record not found for that month");
    const paid = Number(payForm.amount);
    if (!(paid > 0)) return toast.error("Enter a valid amount");
    const newPaid = Math.min(Number(target.amount_due), Number(target.amount_paid) + paid);
    const isFull = newPaid >= Number(target.amount_due) - 0.01;
    await supabase.from("fee_records").update({
      amount_paid: Number(newPaid.toFixed(2)),
      paid_date: isFull ? payForm.paid_date : target.paid_date,
      method: payForm.method,
      notes: payForm.notes || target.notes,
      status: isFull ? "paid" : "partial",
    }).eq("id", target.id);
    // Update student's pending balance
    const { data: fresh } = await supabase.from("fee_records").select("amount_due, amount_paid").eq("student_id", id).neq("status", "paid");
    const pending = (fresh || []).reduce((a, r) => a + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);
    await supabase.from("students").update({ pending_balance: pending }).eq("id", id);
    await supabase.from("activity_log").insert({
      actor_id: user.id, actor_role: "tutor", tutor_id: user.id,
      entity_type: "fee_record", action: "payment.recorded",
      description: `Received ${fmtCurrency(paid)} from ${student.full_name} · ${monthLabel(new Date(target.month + "T00:00:00"))}`,
    });
    setPayForm({ month: "", amount: "", method: "UPI", notes: "", paid_date: toDateStr(new Date()) });
    toast.success("Payment recorded");
    refetchPayments(); refetchStudent(); qc.invalidateQueries({ queryKey: ["dashboard-activity"] }); qc.invalidateQueries({ queryKey: ["fee-records"] });
  }
  async function saveEdit() {
    await supabase.from("students").update({
      full_name: studentForm.full_name, phone: studentForm.phone,
      fee_amount: Number(studentForm.fee_amount), due_day: Number(studentForm.due_day),
      pending_balance: Number(studentForm.pending_balance),
      extra_classes: Number(studentForm.extra_classes || 0),
      notes: studentForm.notes,
    }).eq("id", id);
    
    const now = new Date();
    const currentMonthPrefix = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const { data: futureRecords } = await supabase.from("fee_records")
      .select("id")
      .eq("student_id", id)
      .gte("month", currentMonthPrefix)
      .neq("status", "paid");
      
    if (futureRecords && futureRecords.length > 0) {
      const updates = futureRecords.map(r => supabase.from("fee_records").update({ amount_due: Number(studentForm.fee_amount) }).eq("id", r.id));
      await Promise.all(updates);
    }
    
    await supabase.from("activity_log").insert({
      actor_id: user.id, actor_role: "tutor", tutor_id: user.id, entity_type: "student", entity_id: id,
      action: "student.updated", description: `Updated ${studentForm.full_name}`,
    });
    toast.success("Saved"); setEditing(false); refetchStudent(); refetchPayments(); qc.invalidateQueries({ queryKey: ["fee-records"] });
  }

  return (
    <div>
      <div className="border-b border-border bg-card px-4 md:px-8 py-6">
        <Link to="/students" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><CaretLeft size={12} /> All students</Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">{student.full_name}</h1>
            <div className="text-sm text-muted-foreground font-mono mt-1">{student.phone}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="rounded-sm border-0 bg-muted text-foreground/70">{student.status}</Badge>
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogTrigger asChild><Button variant="outline" data-testid="edit-student">Edit</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit student</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2"><Label>Name</Label><Input value={studentForm.full_name || ""} onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Phone</Label><Input value={studentForm.phone || ""} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Due day</Label><Input type="number" value={studentForm.due_day || 1} onChange={(e) => setStudentForm({ ...studentForm, due_day: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Monthly fee</Label><Input type="number" value={studentForm.fee_amount || 0} onChange={(e) => setStudentForm({ ...studentForm, fee_amount: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Pending balance</Label><Input type="number" value={studentForm.pending_balance || 0} onChange={(e) => setStudentForm({ ...studentForm, pending_balance: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Due day</Label><Input type="number" value={studentForm.due_day || 1} onChange={(e) => setStudentForm({ ...studentForm, due_day: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Extra classes given</Label><Input type="number" min={0} value={studentForm.extra_classes || 0} onChange={(e) => setStudentForm({ ...studentForm, extra_classes: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Input value={studentForm.notes || ""} onChange={(e) => setStudentForm({ ...studentForm, notes: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={saveEdit} data-testid="save-student">Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Monthly fee</div>
            <div className="font-mono text-lg mt-1">{fmtCurrency(student.fee_amount)}</div>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pending</div>
            <div className={`font-mono text-lg mt-1 ${Number(student.pending_balance) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{fmtCurrency(student.pending_balance)}</div>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Due day</div>
            <div className="font-mono text-lg mt-1">{student.due_day}</div>
          </div>
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Weekly slots</div>
            <div className="font-mono text-lg mt-1">{(slots || []).length}</div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8">
        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule" data-testid="tab-schedule">Weekly schedule</TabsTrigger>
            <TabsTrigger value="attendance" data-testid="tab-attendance">Attendance history</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              <Card className="rounded-md border border-border shadow-none">
                <div className="divide-y divide-border">
                  {(slots || []).length === 0 ? (
                    <div className="p-10 text-center text-sm text-muted-foreground">No recurring slots.</div>
                  ) : (slots || []).map((s) => (
                    <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{DAYS_LONG[s.day_of_week]}</div>
                        <div className="text-xs text-muted-foreground font-mono">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => delSlot(s.id)}><Trash size={14} /></Button>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="rounded-md border border-border shadow-none p-5 space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Add slot</div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select value={slotForm.day_of_week} onValueChange={(v) => setSlotForm({ ...slotForm, day_of_week: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS_LONG.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Start</Label><Input type="time" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} /></div>
                  <div className="space-y-2"><Label>End</Label><Input type="time" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={addSlot} data-testid="add-slot"><Plus size={14} className="mr-1.5" /> Add slot</Button>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="attendance" className="pt-6">
            <Card className="rounded-md border border-border shadow-none overflow-hidden">
              <div className="overflow-x-auto">
              <div className="grid grid-cols-[130px_120px_1fr_160px_160px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border px-5 py-2.5 min-w-[620px]">
                <div>Date</div><div>Time</div><div>Topic / Notes</div><div>Kind</div><div>Status</div>
              </div>
              {(sessions || []).length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No sessions.</div>
              ) : (sessions || []).map((s) => (
                <div key={s.id} className="grid grid-cols-[130px_120px_1fr_160px_160px] items-center border-b last:border-b-0 border-border px-5 py-2.5 min-w-[620px]">
                  <div className="font-mono text-sm">{s.session_date}</div>
                  <div className="font-mono text-xs text-muted-foreground">{fmtTime(s.start_time)}</div>
                  <div className="text-sm truncate">{s.topic || s.notes || "—"}
                    {s.compensation_status !== "none" && (
                      <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400 font-mono">{COMP_LABEL[s.compensation_status]}</span>
                    )}
                  </div>
                  <div><Badge className={`${kindBadgeClass(s.kind)} rounded-sm border-0`}>{KIND_LABEL[s.kind]}</Badge></div>
                  <div><Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0`}>{STATUS_LABEL[s.status]}</Badge></div>
                </div>
              ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              <Card className="rounded-md border border-border shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Month-by-month</div>
                  <div className="font-display font-semibold">Fee records</div>
                </div>
                <div className="grid grid-cols-[160px_110px_110px_110px_120px_140px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border px-5 py-2.5">
                  <div>Month</div><div>Due</div><div>Paid</div><div>Balance</div><div>Paid on</div><div>Status</div>
                </div>
                {(payments || []).length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">No fee records yet.</div>
                ) : (payments || []).map((p) => {
                  const bal = Math.max(0, Number(p.amount_due) - Number(p.amount_paid));
                  const delay = computeDelay(p);
                  const badgeCls = p.status === "paid"
                    ? (delay === 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
                    : (delay > 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground");
                  const badgeText = p.status === "paid"
                    ? (delay === 0 ? "Paid on time" : `Paid · ${delay}d late`)
                    : (delay > 0 ? `Overdue · ${delay}d` : (p.status === "partial" ? "Partial" : "Unpaid"));
                  return (
                    <div key={p.id} className="grid grid-cols-[160px_110px_110px_110px_120px_140px] items-center border-b last:border-b-0 border-border px-5 py-2.5">
                      <div className="text-sm">{monthLabel(new Date(p.month + "T00:00:00"))}</div>
                      <div className="font-mono text-sm">{fmtCurrency(p.amount_due)}</div>
                      <div className="font-mono text-sm">{fmtCurrency(p.amount_paid)}</div>
                      <div className={`font-mono text-sm ${bal > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{fmtCurrency(bal)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{p.paid_date || "—"}</div>
                      <div><Badge className={`${badgeCls} rounded-sm border-0`}>{badgeText}</Badge></div>
                    </div>
                  );
                })}
              </Card>
              <Card className="rounded-md border border-border shadow-none p-5 space-y-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Record payment</div>
                <p className="text-xs text-muted-foreground">Fees are due on the {FEE_DUE_DAY}th of each month.</p>
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={payForm.month} onValueChange={(v) => setPayForm({ ...payForm, month: v })}>
                    <SelectTrigger data-testid="quick-pay-month"><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>
                      {(payments || []).filter((r) => r.status !== "paid").map((r) => (
                        <SelectItem key={r.id} value={r.month}>
                          {monthLabel(new Date(r.month + "T00:00:00"))} · {fmtCurrency(Math.max(0, Number(r.amount_due) - Number(r.amount_paid)))} due
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Amount</Label>
                  <Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} data-testid="pay-amount" /></div>
                <div className="space-y-2"><Label>Paid on</Label>
                  <Input type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} /></div>
                <div className="space-y-2"><Label>Method</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="ICICI">ICICI</SelectItem>
                      <SelectItem value="UTK">UTK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
                <Button className="w-full" onClick={addPayment} data-testid="record-payment">Record</Button>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
