import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toDateStr, fromDateStr, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, fmtTime, DAYS, DAYS_LONG, KIND_LABEL, STATUS_LABEL, COMP_LABEL, statusBadgeClass, kindBadgeClass, fmtDatePretty } from "@/lib/dates";
import { toast } from "sonner";
import { CaretLeft, CaretRight, Plus, DotsSixVertical } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// ---------- Conflict check (returns list of conflicting student ids) ----------
async function findConflicts({ tutorId, studentIds, date, start, end, excludeSessionId }) {
  let q = supabase.from("class_sessions").select("id, student_id")
    .eq("tutor_id", tutorId).eq("session_date", date)
    .lt("start_time", end).gt("end_time", start)
    .not("status", "in", "(tutor_cancelled,student_cancelled)")
    .in("student_id", studentIds);
  if (excludeSessionId) q = q.neq("id", excludeSessionId);
  const { data } = await q;
  return (data || []).map((r) => r.student_id);
}

// ---------- Multi-student create dialog ----------
function CreateClassDialog({ open, onOpenChange, students, tutorId, defaultDate, defaultKind = "regular", onSaved }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    session_date: defaultDate || toDateStr(new Date()),
    start_time: "17:00", end_time: "18:00", kind: defaultKind,
    topic: "", notes: "",
  });
  const [picked, setPicked] = useState([]);
  const [perStudent, setPerStudent] = useState({}); // { studentId: {topic, notes} }
  const [advanced, setAdvanced] = useState(false);

  React.useEffect(() => {
    setForm((f) => ({ ...f, session_date: defaultDate || f.session_date, kind: defaultKind }));
    setPicked([]); setPerStudent({}); setAdvanced(false);
  }, [defaultDate, defaultKind, open]);

  function togglePick(id) {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }
  function pickAll(list) { setPicked(list.map((s) => s.id)); }

  async function save() {
    if (!picked.length) { toast.error("Choose at least one student"); return; }
    if (form.start_time >= form.end_time) { toast.error("End must be after start"); return; }
    setBusy(true);
    try {
      const conflicts = await findConflicts({
        tutorId, studentIds: picked, date: form.session_date,
        start: form.start_time, end: form.end_time,
      });
      if (conflicts.length) {
        const names = students.filter((s) => conflicts.includes(s.id)).map((s) => s.full_name).join(", ");
        toast.error(`Conflict for: ${names}`); return;
      }
      const rows = picked.map((sid) => {
        const per = perStudent[sid] || {};
        return {
          tutor_id: tutorId, student_id: sid, session_date: form.session_date,
          start_time: form.start_time, end_time: form.end_time, kind: form.kind,
          topic: per.topic || form.topic || null,
          notes: per.notes || form.notes || null,
          status: "scheduled",
        };
      });
      const { error } = await supabase.from("class_sessions").insert(rows);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        actor_id: tutorId, actor_role: "tutor", tutor_id: tutorId,
        entity_type: "class_session", action: `session.${form.kind}.created`,
        description: `${KIND_LABEL[form.kind]} class · ${rows.length} student${rows.length > 1 ? "s" : ""} on ${form.session_date} ${form.start_time}`,
      });
      toast.success(`${rows.length} session${rows.length > 1 ? "s" : ""} scheduled`);
      onSaved?.(); onOpenChange(false);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create class</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger data-testid="new-class-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="extra">Extra class</SelectItem>
                  <SelectItem value="test">Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} data-testid="new-class-date" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Students <span className="text-muted-foreground font-normal">({picked.length} selected)</span></Label>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => pickAll(students || [])} data-testid="pick-all-students">Select all</button>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setPicked([])}>Clear</button>
              </div>
            </div>
            <div className="border border-border rounded-md max-h-56 overflow-y-auto divide-y divide-border">
              {(students || []).map((s) => {
                const on = picked.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent/40 ${on ? "bg-primary/5" : ""}`} data-testid={`pick-${s.id}`}>
                    <Checkbox checked={on} onCheckedChange={() => togglePick(s.id)} />
                    <div className="flex-1">
                      <div className="text-sm">{s.full_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.phone}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{form.kind === "test" ? "Test topic (shared)" : "Agenda / topic (shared)"}</Label>
            <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
              placeholder={form.kind === "test" ? "e.g. Chapter 4 – Algebra" : "e.g. Revision · Ch. 3"} />
          </div>

          {picked.length > 1 && (
            <div>
              <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs text-primary hover:underline" data-testid="toggle-per-student">
                {advanced ? "Hide" : "Set"} a different agenda per student
              </button>
              {advanced && (
                <div className="mt-2 space-y-2">
                  {picked.map((sid) => {
                    const st = students.find((x) => x.id === sid);
                    const per = perStudent[sid] || {};
                    return (
                      <div key={sid} className="grid grid-cols-[130px_1fr] gap-2 items-center">
                        <div className="text-xs truncate">{st?.full_name}</div>
                        <Input placeholder="Their agenda…" value={per.topic || ""}
                          onChange={(e) => setPerStudent((p) => ({ ...p, [sid]: { ...(p[sid] || {}), topic: e.target.value } }))} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy || !picked.length} data-testid="new-class-save">
            {busy ? "Saving…" : `Create${picked.length > 1 ? ` (${picked.length})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Session drawer (attendance + compensation) ----------
function SessionDrawer({ session, onClose, onChanged, tutorId, isTutor }) {
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  if (!session) return null;
  const s = session;

  async function updateStatus(newStatus) {
    setBusy(true);
    try {
      const patch = { status: newStatus };
      if (newStatus === "tutor_cancelled") patch.compensation_status = "pending";
      if (newStatus === "student_cancelled") patch.compensation_status = "none";
      const { error } = await supabase.from("class_sessions").update(patch).eq("id", s.id);
      if (error) throw error;
      await supabase.from("activity_log").insert({
        actor_id: tutorId, actor_role: "tutor", tutor_id: tutorId,
        entity_type: "class_session", entity_id: s.id, action: `session.${newStatus}`,
        description: `${s.students?.full_name || "Session"} → ${STATUS_LABEL[newStatus]}`,
      });
      toast.success("Updated"); onChanged?.(); onClose();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function declineCompensation() {
    setBusy(true);
    const reason = window.prompt("Reason for declining compensation (optional):", "") || "";
    try {
      await supabase.from("class_sessions").update({
        compensation_status: "declined", compensation_reason: reason,
      }).eq("id", s.id);
      await supabase.from("activity_log").insert({
        actor_id: tutorId, actor_role: "tutor", tutor_id: tutorId,
        entity_type: "class_session", entity_id: s.id, action: "compensation.declined",
        description: `Declined compensation${reason ? `: ${reason}` : ""}`,
      });
      toast.success("Compensation declined"); onChanged?.(); onClose();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">{s.students?.full_name || "Session"}</SheetTitle>
          <SheetDescription className="font-mono text-xs">{s.session_date} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4 text-sm">
          <div className="flex gap-2 flex-wrap">
            <Badge className={`${kindBadgeClass(s.kind)} rounded-sm border-0`}>{KIND_LABEL[s.kind]}</Badge>
            <Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0`}>{STATUS_LABEL[s.status]}</Badge>
            {s.compensation_status !== "none" && (
              <Badge className="rounded-sm border-0 bg-amber-500/10 text-amber-600 dark:text-amber-400">{COMP_LABEL[s.compensation_status]}</Badge>
            )}
          </div>
          {s.topic && <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Topic</div><div>{s.topic}</div></div>}
          {s.notes && <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes</div><div className="whitespace-pre-wrap">{s.notes}</div></div>}
          {s.compensation_reason && (
            <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Compensation reason</div><div>{s.compensation_reason}</div></div>
          )}

          {isTutor && (
            <div className="pt-4 space-y-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Attendance</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={busy} onClick={() => updateStatus("present")} data-testid="mark-present">Mark present</Button>
                <Button variant="outline" disabled={busy} onClick={() => updateStatus("absent")} data-testid="mark-absent">Mark absent</Button>
                <Button variant="outline" disabled={busy} onClick={() => updateStatus("tutor_cancelled")} data-testid="mark-tutor-cancel">Cancel (tutor)</Button>
                <Button variant="outline" disabled={busy} onClick={() => updateStatus("student_cancelled")} data-testid="mark-student-cancel">Cancel (student)</Button>
              </div>
              {s.compensation_status === "pending" && (
                <>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-4">Compensation</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setLinkOpen(true)} data-testid="link-extra">Link extra class</Button>
                    <Button variant="outline" onClick={declineCompensation}>Decline</Button>
                  </div>
                </>
              )}
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground pt-4">Tip</div>
              <p className="text-xs text-muted-foreground">Drag this session in the Week view to reschedule it.</p>
            </div>
          )}
        </div>
        <LinkExtraDialog
          open={linkOpen} onOpenChange={setLinkOpen} tutorId={tutorId}
          studentId={s.student_id} cancelledSession={s}
          onSaved={() => { onChanged?.(); onClose(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function LinkExtraDialog({ open, onOpenChange, tutorId, studentId, cancelledSession, onSaved }) {
  const [busy, setBusy] = useState(false);
  const { data: candidates } = useQuery({
    enabled: open && !!studentId,
    queryKey: ["link-extras", studentId],
    queryFn: async () => (await supabase.from("class_sessions").select("*")
      .eq("tutor_id", tutorId).eq("student_id", studentId).eq("kind", "extra")
      .gte("session_date", toDateStr(new Date())).order("session_date")).data || [],
  });
  const [pick, setPick] = useState("");

  async function attach() {
    if (!pick) return;
    setBusy(true);
    try {
      await supabase.from("class_sessions").update({
        linked_extra_class_id: pick, compensation_status: "scheduled",
      }).eq("id", cancelledSession.id);
      await supabase.from("activity_log").insert({
        actor_id: tutorId, actor_role: "tutor", tutor_id: tutorId,
        entity_type: "class_session", entity_id: cancelledSession.id,
        action: "compensation.linked", description: "Linked an extra class as compensation",
      });
      toast.success("Linked");
      onSaved?.(); onOpenChange(false);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Link an extra class</DialogTitle></DialogHeader>
        {(candidates || []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No upcoming extra classes for this student. Create one from the calendar and try again.</div>
        ) : (
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger><SelectValue placeholder="Choose extra class" /></SelectTrigger>
            <SelectContent>
              {(candidates || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.session_date} · {fmtTime(c.start_time)}–{fmtTime(c.end_time)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={attach} disabled={busy || !pick}>Attach</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main page ----------
export default function CalendarPage() {
  const { user, profile } = useAuth();
  const isTutor = profile?.role === "tutor";
  const qc = useQueryClient();
  const [view, setView] = useState("week");
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState(null);

  const range = useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor };
    if (view === "week") return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
    if (view === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    return { from: anchor, to: addDays(anchor, 30) };
  }, [view, anchor]);

  const { data: students } = useQuery({
    enabled: isTutor,
    queryKey: ["all-students", user.id],
    queryFn: async () => (await supabase.from("students").select("id, full_name, phone").eq("tutor_id", user.id).eq("status", "active").order("full_name")).data || [],
  });

  const { data: sessions, refetch } = useQuery({
    queryKey: ["calendar-sessions", view, toDateStr(range.from), toDateStr(range.to), user.id],
    queryFn: async () => {
      let q = supabase.from("class_sessions").select("*, students(full_name)")
        .gte("session_date", toDateStr(range.from)).lte("session_date", toDateStr(range.to))
        .order("session_date").order("start_time");
      if (isTutor) q = q.eq("tutor_id", user.id);
      const { data } = await q;
      return data || [];
    },
  });

  function shift(n) {
    const step = view === "day" ? 1 : view === "week" ? 7 : view === "month" ? 30 : 7;
    setAnchor(addDays(anchor, n * step));
  }
  const refreshAll = () => { refetch(); qc.invalidateQueries({ queryKey: ["dashboard-sessions"] }); qc.invalidateQueries({ queryKey: ["dashboard-activity"] }); };

  const headerTitle = view === "month"
    ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${fmtDatePretty(range.from)} — ${fmtDatePretty(range.to)}`;

  // ---------- Drag & drop ----------
  async function moveSession(sessionId, newDate) {
    const s = (sessions || []).find((x) => x.id === sessionId);
    if (!s) return;
    if (s.session_date === newDate) return;
    const conflicts = await findConflicts({
      tutorId: user.id, studentIds: [s.student_id], date: newDate,
      start: s.start_time, end: s.end_time, excludeSessionId: s.id,
    });
    if (conflicts.length) { toast.error("Conflict at that day/time"); return; }
    const { error } = await supabase.from("class_sessions").update({ session_date: newDate }).eq("id", sessionId);
    if (error) { toast.error(error.message); return; }
    await supabase.from("activity_log").insert({
      actor_id: user.id, actor_role: "tutor", tutor_id: user.id,
      entity_type: "class_session", entity_id: s.id, action: "session.rescheduled",
      description: `${s.students?.full_name}: ${s.session_date} → ${newDate}`,
    });
    toast.success("Rescheduled"); refreshAll();
  }

  return (
    <div>
      <div className="border-b border-border bg-card px-8 py-6 flex flex-wrap items-center gap-4 justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Calendar</div>
          <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">{headerTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="day" data-testid="view-day">Day</TabsTrigger>
              <TabsTrigger value="week" data-testid="view-week">Week</TabsTrigger>
              <TabsTrigger value="month" data-testid="view-month">Month</TabsTrigger>
              <TabsTrigger value="agenda" data-testid="view-agenda">Agenda</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center border border-border rounded-md">
            <Button variant="ghost" size="icon" className="rounded-none" onClick={() => shift(-1)} data-testid="cal-prev"><CaretLeft size={14} /></Button>
            <Button variant="ghost" className="rounded-none h-9 px-3 text-xs" onClick={() => setAnchor(new Date())} data-testid="cal-today">Today</Button>
            <Button variant="ghost" size="icon" className="rounded-none" onClick={() => shift(1)} data-testid="cal-next"><CaretRight size={14} /></Button>
          </div>
          {isTutor && (
            <Button onClick={() => { setCreateDate(null); setCreating(true); }} data-testid="cal-create">
              <Plus size={14} className="mr-1.5" /> New class
            </Button>
          )}
        </div>
      </div>

      <div className="p-8">
        {view === "week" && (
          <WeekView
            anchor={anchor} sessions={sessions || []} onSelect={setSelected}
            onSlot={(d) => { setCreateDate(d); setCreating(true); }} isTutor={isTutor}
            onDropMove={moveSession}
          />
        )}
        {view === "day" && <DayView anchor={anchor} sessions={sessions || []} onSelect={setSelected} />}
        {view === "month" && <MonthView anchor={anchor} sessions={sessions || []} onSelect={setSelected} onDay={(d) => { setCreateDate(d); if (isTutor) setCreating(true); }} />}
        {view === "agenda" && <AgendaView sessions={sessions || []} onSelect={setSelected} />}

        {isTutor && view === "week" && (
          <p className="text-xs text-muted-foreground mt-3">
            Tip: <span className="font-mono">Drag</span> any session to a different day column to reschedule.
          </p>
        )}
      </div>

      <SessionDrawer
        session={selected} onClose={() => setSelected(null)}
        onChanged={refreshAll} tutorId={user.id} isTutor={isTutor}
      />
      {isTutor && (
        <CreateClassDialog
          open={creating} onOpenChange={setCreating}
          students={students} tutorId={user.id}
          defaultDate={createDate} onSaved={refreshAll}
        />
      )}
    </div>
  );
}

// ---------- Draggable event chip ----------
function EventChip({ s, onSelect, draggable = false }) {
  const [dragging, setDragging] = useState(false);
  const onDragStart = (e) => {
    e.dataTransfer.setData("text/session-id", s.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  };
  const onDragEnd = () => setDragging(false);
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group relative ${dragging ? "dnd-dragging" : ""}`}
    >
      <button
        onClick={() => onSelect(s)}
        className="w-full text-left px-2 py-1 rounded-sm text-[11px] leading-tight border border-transparent hover:border-primary/40 bg-accent hover:bg-primary/10 transition-colors"
        data-testid={`event-${s.id}`}
      >
        <div className="flex items-center gap-1">
          {draggable && <DotsSixVertical size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />}
          <div className="font-mono text-[10px] text-muted-foreground">{fmtTime(s.start_time)}</div>
        </div>
        <div className="truncate font-medium">{s.students?.full_name || "Session"}</div>
        <div className="flex gap-1 mt-0.5">
          <span className={`inline-block px-1.5 rounded-sm text-[9px] ${kindBadgeClass(s.kind)}`}>{KIND_LABEL[s.kind]}</span>
          {s.status !== "scheduled" && <span className={`inline-block px-1.5 rounded-sm text-[9px] ${statusBadgeClass(s.status)}`}>{STATUS_LABEL[s.status]}</span>}
        </div>
      </button>
    </div>
  );
}

function WeekView({ anchor, sessions, onSelect, onSlot, isTutor, onDropMove }) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const [hoverDay, setHoverDay] = useState(null);

  return (
    <div className="grid grid-cols-7 border border-border rounded-md overflow-hidden">
      {days.map((d) => {
        const key = toDateStr(d);
        const list = sessions.filter((s) => s.session_date === key);
        const isToday = key === toDateStr(new Date());
        const isDropTarget = isTutor && hoverDay === key;

        return (
          <div
            key={key}
            onDragOver={isTutor ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHoverDay(key); } : undefined}
            onDragLeave={isTutor ? () => setHoverDay((h) => (h === key ? null : h)) : undefined}
            onDrop={isTutor ? (e) => {
              e.preventDefault();
              setHoverDay(null);
              const sid = e.dataTransfer.getData("text/session-id");
              if (sid) onDropMove(sid, key);
            } : undefined}
            className={`border-r last:border-r-0 border-border flex flex-col min-h-[420px] transition-colors ${isDropTarget ? "dnd-drop-target" : ""}`}
            data-testid={`day-col-${key}`}
          >
            <div className={`px-3 py-2 border-b border-border flex items-center justify-between ${isToday ? "bg-primary/10" : "bg-card"}`}>
              <div>
                <div className={`text-[10px] uppercase tracking-widest ${isToday ? "text-primary" : "text-muted-foreground"}`}>{DAYS[d.getDay()]}</div>
                <div className={`font-display font-semibold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
              </div>
              {isTutor && (
                <button onClick={() => onSlot(key)} className="text-muted-foreground hover:text-primary text-xs" data-testid={`add-day-${key}`}>+</button>
              )}
            </div>
            <div className="p-2 space-y-1.5 flex-1">
              {list.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/50 text-center pt-6">—</div>
              ) : list.map((s) => <EventChip key={s.id} s={s} onSelect={onSelect} draggable={isTutor} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ anchor, sessions, onSelect }) {
  const key = toDateStr(anchor);
  const list = sessions.filter((s) => s.session_date === key);
  return (
    <Card className="rounded-md border border-border shadow-none">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{DAYS_LONG[anchor.getDay()]}</div>
        <div className="font-display font-semibold">{anchor.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
      </div>
      <div className="divide-y divide-border">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No classes.</div>
        ) : list.map((s) => (
          <button key={s.id} onClick={() => onSelect(s)} className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-primary/5" data-testid={`event-${s.id}`}>
            <div className="font-mono text-sm w-24 tabular-nums">{fmtTime(s.start_time)}</div>
            <div className="flex-1 text-sm truncate">{s.students?.full_name}</div>
            <Badge className={`${kindBadgeClass(s.kind)} rounded-sm border-0`}>{KIND_LABEL[s.kind]}</Badge>
            <Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0`}>{STATUS_LABEL[s.status]}</Badge>
          </button>
        ))}
      </div>
    </Card>
  );
}

function MonthView({ anchor, sessions, onSelect, onDay }) {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div className="grid grid-cols-7 border border-border rounded-md overflow-hidden">
      {DAYS.map((d) => <div key={d} className="text-[10px] uppercase tracking-widest text-muted-foreground bg-card border-b border-border px-3 py-2">{d}</div>)}
      {days.map((d) => {
        const key = toDateStr(d);
        const list = sessions.filter((s) => s.session_date === key);
        const inMonth = d.getMonth() === anchor.getMonth();
        const isToday = key === toDateStr(new Date());
        return (
          <div key={key} onClick={() => onDay(key)} className={`min-h-[100px] border-t border-r border-border p-2 ${inMonth ? "bg-card" : "bg-muted/30"} ${isToday ? "bg-primary/5" : ""} cursor-pointer`}>
            <div className={`text-xs mb-1 font-mono ${isToday ? "text-primary font-semibold" : inMonth ? "text-foreground" : "text-muted-foreground"}`}>{d.getDate()}</div>
            <div className="space-y-1">
              {list.slice(0, 3).map((s) => (
                <div key={s.id} onClick={(e) => { e.stopPropagation(); onSelect(s); }} className={`text-[10px] px-1.5 py-0.5 rounded-sm truncate ${kindBadgeClass(s.kind)}`}>
                  {fmtTime(s.start_time)} {s.students?.full_name}
                </div>
              ))}
              {list.length > 3 && <div className="text-[10px] text-muted-foreground">+{list.length - 3} more</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({ sessions, onSelect }) {
  if (sessions.length === 0) return <Card className="p-10 text-center text-sm text-muted-foreground border border-border shadow-none">No classes in this range.</Card>;
  const groups = sessions.reduce((acc, s) => ((acc[s.session_date] = acc[s.session_date] || []).push(s), acc), {});
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([date, list]) => (
        <div key={date}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground pb-2 border-b border-border">
            {fromDateStr(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div className="divide-y divide-border">
            {list.map((s) => (
              <button key={s.id} onClick={() => onSelect(s)} className="w-full flex items-center gap-4 px-2 py-3 text-left hover:bg-primary/5" data-testid={`event-${s.id}`}>
                <div className="font-mono text-sm w-24 tabular-nums">{fmtTime(s.start_time)}</div>
                <div className="flex-1 text-sm truncate">{s.students?.full_name}</div>
                <Badge className={`${kindBadgeClass(s.kind)} rounded-sm border-0`}>{KIND_LABEL[s.kind]}</Badge>
                <Badge className={`${statusBadgeClass(s.status)} rounded-sm border-0`}>{STATUS_LABEL[s.status]}</Badge>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
