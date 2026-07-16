import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase, phoneToEmail } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { signInSchema } from "@/lib/schemas";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "@phosphor-icons/react";

const signUpSchema = signInSchema.extend({
  full_name: z.string().min(2, "Enter your full name"),
});

export default function AuthPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);

  const signInForm = useForm({ resolver: zodResolver(signInSchema), defaultValues: { phone: "", password: "" } });
  const signUpForm = useForm({ resolver: zodResolver(signUpSchema), defaultValues: { full_name: "", phone: "", password: "" } });

  if (user && profile) {
    return <Navigate to={profile.role === "tutor" ? "/dashboard" : "/me"} replace />;
  }

  async function onSignIn(values) {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(values.phone), password: values.password,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Signed in");
      navigate("/");
    } finally { setBusy(false); }
  }

  async function onSignUp(values) {
    setBusy(true);
    try {
      // Client-side supabase.auth.signUp rejects our synthetic email domain.
      // Use the SECURITY DEFINER RPC that creates the auth user directly.
      const { data, error } = await supabase.rpc("signup_student", {
        _phone: values.phone,
        _password: values.password,
        _full_name: values.full_name,
      });
      if (error) { toast.error(error.message.replace(/^.*?:\s*/, "")); return; }

      // Sign the user in
      const { error: sErr } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(values.phone),
        password: values.password,
      });
      if (sErr) { toast.error(sErr.message); return; }

      if (data?.linked_student_id) toast.success("Account linked to your tutor's records");
      else toast.success("Account created. Ask your tutor to add you to their roster.");
      navigate("/");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      {/* Centered form */}
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
            <GraduationCap size={18} weight="bold" />
          </div>
          <div className="font-display font-bold tracking-tight">Student Management System</div>
        </div>

          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Sign in to your workspace</h2>
            <p className="text-sm text-muted-foreground mt-1">Use your phone number and password.</p>
          </div>

          <Tabs value={mode} onValueChange={setMode} className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin" data-testid="tab-signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="pt-6">
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Phone number</Label>
                  <Input placeholder="9999999999" inputMode="numeric" autoComplete="tel"
                    data-testid="signin-phone" {...signInForm.register("phone")} />
                  {signInForm.formState.errors.phone && (
                    <p className="text-xs text-destructive">{signInForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="••••••••" autoComplete="current-password"
                    data-testid="signin-password" {...signInForm.register("password")} />
                  {signInForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{signInForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={busy} data-testid="signin-submit">
                  {busy ? "Signing in…" : "Sign in"}
                </Button>
              </form>

            </TabsContent>

            <TabsContent value="signup" className="pt-6">
              <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input placeholder="Your name" data-testid="signup-name" {...signUpForm.register("full_name")} />
                </div>
                <div className="space-y-2">
                  <Label>Phone number</Label>
                  <Input placeholder="10 digits" inputMode="numeric" data-testid="signup-phone" {...signUpForm.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" data-testid="signup-password" {...signUpForm.register("password")} />
                </div>
                <Button type="submit" className="w-full" disabled={busy} data-testid="signup-submit">
                  {busy ? "Creating…" : "Create student account"}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-4">
                New accounts are created as Students. Tutors are provisioned by an existing tutor.
              </p>
            </TabsContent>
          </Tabs>
        </div>
    </div>
  );
}
