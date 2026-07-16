import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      setProfile(data || null);
    } catch (e) {
      // Never leave the app stuck: if the profile fetch fails, keep going
      console.error("[auth] loadProfile failed", e);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // Do NOT gate `loading` on the profile fetch — it can hang or be slow.
    // As soon as we know the session (or lack thereof), release the gate.
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        // Kick off profile fetch but don't await it for the loading gate
        loadProfile(data.session?.user?.id);
      } catch (e) {
        console.error("[auth] getSession failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Safety net — never allow the auth loading screen to stick beyond 4s
    const kill = setTimeout(() => { if (mounted) setLoading(false); }, 4000);

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadProfile(s?.user?.id);
      setLoading(false);
    });

    return () => { mounted = false; clearTimeout(kill); sub?.subscription?.unsubscribe(); };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session?.user?.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    role: profile?.role || null,
    loading,
    profileLoading,
    refreshProfile,
    signOut,
  }), [session, profile, loading, profileLoading, refreshProfile, signOut]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside <AuthProvider>");
  return ctx;
};
