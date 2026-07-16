import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { fmtCurrency } from "@/lib/dates";
import { MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";

function StudentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    full_name: initial?.full_name || "",
    phone: initial?.phone || "",
    fee_amount: initial?.fee_amount ?? 0,
    due_day: initial?.due_day ?? 1,
    extra_classes: initial?.extra_classes ?? 0,
    notes: initial?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (form.full_name.length < 2) return toast.error("Enter full name");
    if (!/^[0-9]{10,15}$/.test(form.phone)) return toast.error("Phone must be 10–15 digits");
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2"><Label>Full name</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="student-name" /></div>
      <div className="space-y-2"><Label>Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="student-phone" /></div>
      <div className="space-y-2"><Label>Monthly fee</Label>
        <Input type="number" min={0} value={form.fee_amount} onChange={(e) => setForm({ ...form, fee_amount: Number(e.target.value) })} data-testid="student-fee" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>Due day (1–28)</Label>
          <Input type="number" min={1} max={28} value={form.due_day} onChange={(e) => setForm({ ...form, due_day: Number(e.target.value) })} /></div>
        <div className="space-y-2"><Label>Extra classes given</Label>
          <Input type="number" min={0} value={form.extra_classes} onChange={(e) => setForm({ ...form, extra_classes: Number(e.target.value) })} /></div>
      </div>
      <div className="space-y-2"><Label>Notes</Label>
        <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit} disabled={busy} data-testid="student-save">{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

export default function StudentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [creating, setCreating] = useState(false);

  const { data: students, isLoading } = useQuery({
    queryKey: ["students-list", user.id, status, q],
    queryFn: async () => {
      let qy = supabase.from("students").select("*").eq("tutor_id", user.id).order("full_name");
      if (status !== "all") qy = qy.eq("status", status);
      if (q) qy = qy.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,notes.ilike.%${q}%`);
      const { data } = await qy; return data || [];
    },
  });

  async function createStudent(form) {
    try {
      const { data, error } = await supabase.from("students").insert({
        tutor_id: user.id, full_name: form.full_name, phone: form.phone,
        fee_amount: form.fee_amount, due_day: form.due_day,
        extra_classes: form.extra_classes || 0,
        pending_balance: form.fee_amount, notes: form.notes || null, status: "active",
      }).select().single();
      if (error) {
        if (String(error.message).match(/duplicate|unique/i)) {
          toast.error("A student with this phone number already exists");
        } else toast.error(error.message);
        return;
      }
      await supabase.from("activity_log").insert({
        actor_id: user.id, actor_role: "tutor", tutor_id: user.id,
        entity_type: "student", entity_id: data.id,
        action: "student.created", description: `Created student ${form.full_name}`,
      });
      // Generate fee record ONLY for this new student, for the CURRENT month.
      // Past months stay untouched. Future months will be created naturally
      // as each month arrives and the Payments page is opened.
      const { ensureFeeRecordForStudent } = await import("@/lib/fees");
      await ensureFeeRecordForStudent(user.id, data.id, form.fee_amount, form.due_day);

      toast.success("Student created. Ask them to sign up with the same phone to auto-link.");
      qc.invalidateQueries({ queryKey: ["students-list"] });
      qc.invalidateQueries({ queryKey: ["fee-records"] });
      setCreating(false);
    } catch (e) { toast.error(e.message); }
  }

  async function archive(s) {
    if (!window.confirm(`Archive ${s.full_name}?`)) return;
    await supabase.from("students").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", s.id);
    
    const now = new Date();
    const { toDateStr } = await import("@/lib/dates");
    const currentMonthPrefix = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    await supabase.from("fee_records").delete().eq("student_id", s.id).gte("month", currentMonthPrefix).neq("status", "paid");
    
    await supabase.from("activity_log").insert({
      actor_id: user.id, actor_role: "tutor", tutor_id: user.id, entity_type: "student", entity_id: s.id,
      action: "student.archived", description: `Archived ${s.full_name}`,
    });
    toast.success("Archived"); qc.invalidateQueries({ queryKey: ["students-list"] }); qc.invalidateQueries({ queryKey: ["fee-records"] });
  }

  return (
    <div>
      <div className="border-b border-border bg-card px-4 md:px-8 py-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Roster</div>
          <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">Students</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, phone, notes" className="pl-9 w-64" value={q} onChange={(e) => setQ(e.target.value)} data-testid="students-search" />
          </div>
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              <TabsTrigger value="active" data-testid="filter-active">Active</TabsTrigger>
              <TabsTrigger value="archived" data-testid="filter-archived">Archived</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild><Button data-testid="new-student"><Plus size={14} className="mr-1.5" /> New</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New student</DialogTitle></DialogHeader>
              <StudentForm onSave={createStudent} onCancel={() => setCreating(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-4">
        <div className="rounded-md border border-primary/25 bg-primary/5 text-sm p-4 flex gap-3">
          <div className="w-8 h-8 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 font-mono font-bold">i</div>
          <div className="space-y-1">
            <div className="font-medium">How to add students</div>
            <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
              <li>Create the student's record here with their <span className="font-mono">name + phone + fee</span>.</li>
              <li>Ask the student to sign up at the login page using the <em>same</em> phone number. Their account auto-links to this record.</li>
              <li>Phone numbers are unique — you cannot create two students (or two accounts) with the same number.</li>
            </ol>
          </div>
        </div>

        <Card className="rounded-md border border-border shadow-none overflow-hidden">
          <div className="overflow-x-auto">
          <div className="grid grid-cols-[1fr_140px_120px_120px_90px_60px] text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border px-5 py-2.5 min-w-[640px]">
            <div>Name</div><div>Phone</div><div>Fee</div><div>Pending</div><div>Extra Classes</div><div></div>
          </div>
          {isLoading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (students || []).length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">No students found.</div>
          ) : (students || []).map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_140px_120px_120px_90px_60px] items-center border-b last:border-b-0 border-border px-5 py-2.5 hover:bg-accent/40 min-w-[640px]">
              <div>
                <Link to={`/students/${s.id}`} className="text-sm font-medium hover:underline" data-testid={`student-row-${s.id}`}>{s.full_name}</Link>
                {s.status === "archived" && <Badge variant="secondary" className="ml-2 rounded-sm text-[10px]">Archived</Badge>}
                {s.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{s.notes}</div>}
              </div>
              <div className="font-mono text-xs">{s.phone}</div>
              <div className="font-mono text-sm tabular-nums">{fmtCurrency(s.fee_amount)}</div>
              <div className={`font-mono text-sm tabular-nums ${Number(s.pending_balance) > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{fmtCurrency(s.pending_balance)}</div>
              <div className="font-mono text-sm tabular-nums text-center">{s.extra_classes ?? 0}</div>
              <div className="flex justify-end">
                {s.status === "active" && (
                  <Button variant="ghost" size="icon" onClick={() => archive(s)} title="Delete" data-testid={`archive-${s.id}`}>
                    <Trash size={14} className="text-destructive/70 hover:text-destructive" />
                  </Button>
                )}
                {s.status === "archived" && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    await supabase.from("students").update({ status: "active", archived_at: null }).eq("id", s.id);
                    qc.invalidateQueries({ queryKey: ["students-list"] });
                    toast.success("Restored");
                  }}>Restore</Button>
                )}
              </div>
            </div>
          ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
