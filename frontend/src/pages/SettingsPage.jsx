import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC",
];

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    timezone: profile?.timezone || "Asia/Kolkata",
    working_start: profile?.working_hours?.start || "09:00",
    working_end: profile?.working_hours?.end || "21:00",
  });
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: form.full_name,
        phone: form.phone,
        timezone: form.timezone,
        working_hours: { start: form.working_start, end: form.working_end },
      }).eq("id", profile.id);
      if (error) throw error;
      toast.success("Profile saved");
      refreshProfile();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function changePassword() {
    if (pw.length < 6) return toast.error("Min 6 characters");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(""); toast.success("Password updated");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Account</div>
        <h1 className="text-2xl font-display font-bold tracking-tight" data-testid="page-title">Settings</h1>
      </div>
      <div className="p-8 max-w-2xl space-y-6">
        <Card className="rounded-md border border-border shadow-none">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Profile</div>
            <div className="font-display font-semibold">Personal information</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Full name</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} data-testid="settings-name" /></div>
              <div className="space-y-2"><Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="settings-phone" /></div>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {profile?.role === "tutor" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Working hours start</Label><Input type="time" value={form.working_start} onChange={(e) => setForm({ ...form, working_start: e.target.value })} /></div>
                <div className="space-y-2"><Label>Working hours end</Label><Input type="time" value={form.working_end} onChange={(e) => setForm({ ...form, working_end: e.target.value })} /></div>
              </div>
            )}
            <Button onClick={saveProfile} disabled={busy} data-testid="save-profile">{busy ? "Saving…" : "Save profile"}</Button>
          </div>
        </Card>

        <Card className="rounded-md border border-border shadow-none">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Appearance</div>
            <div className="font-display font-semibold">Theme</div>
          </div>
          <div className="p-5 flex gap-2">
            {["light", "dark"].map((t) => (
              <Button key={t} variant={theme === t ? "default" : "outline"} onClick={() => setTheme(t)} data-testid={`theme-${t}`}>
                {t[0].toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </Card>

        <Card className="rounded-md border border-border shadow-none">
          <div className="px-5 py-4 border-b border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Security</div>
            <div className="font-display font-semibold">Change password</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2"><Label>New password</Label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="settings-password" /></div>
            <Button onClick={changePassword} disabled={busy || !pw} data-testid="save-password">{busy ? "Saving…" : "Update password"}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
