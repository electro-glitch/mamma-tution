import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children, role }) {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const location = useLocation();

  // If we have a user (stale session) but no profile and it's done loading,
  // the account was deleted. Sign out and go to /auth.
  useEffect(() => {
    if (!loading && !profileLoading && user && !profile) {
      signOut();
    }
  }, [loading, profileLoading, user, profile, signOut]);

  if (loading) return null;

  // Still waiting for profile fetch to complete
  if (user && profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }

  // No user, or profile turned out to be missing → go to login
  if (!user || !profile) return <Navigate to="/auth" state={{ from: location }} replace />;

  if (role && profile.role !== role) return <Navigate to="/403" replace />;
  return children;
}
