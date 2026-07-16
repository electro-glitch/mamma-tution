import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// The problem statement asks for phone-based auth. Supabase supports
// phone+password natively, but that requires an SMS provider to be
// configured on the Supabase project. To avoid that dependency, we
// derive a stable synthetic email from the phone number and use
// Supabase's email+password provider. Users only ever see the phone.
export const phoneToEmail = (rawPhone) => {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  return `${digits}@phone.tutor.app`;
};
