import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import AuthPage from "@/pages/AuthPage";
import TutorDashboard from "@/pages/TutorDashboard";
import StudentDashboard from "@/pages/StudentDashboard";
import CalendarPage from "@/pages/CalendarPage";
import StudentsPage from "@/pages/StudentsPage";
import StudentDetailPage from "@/pages/StudentDetailPage";
import PaymentsPage from "@/pages/PaymentsPage";
import ActivityPage from "@/pages/ActivityPage";
import SettingsPage from "@/pages/SettingsPage";
import { NotFoundPage, ForbiddenPage, UnauthorizedPage, ServerErrorPage } from "@/pages/ErrorPages";

function RoleRoot() {
  const { role } = useAuth();
  if (role === "tutor") return <Navigate to="/dashboard" replace />;
  if (role === "student") return <Navigate to="/me" replace />;
  return <UnauthorizedPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<RoleRoot />} />
        <Route path="/dashboard" element={<ProtectedRoute role="tutor"><TutorDashboard /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/students" element={<ProtectedRoute role="tutor"><StudentsPage /></ProtectedRoute>} />
        <Route path="/students/:id" element={<ProtectedRoute role="tutor"><StudentDetailPage /></ProtectedRoute>} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/activity" element={<ProtectedRoute role="tutor"><ActivityPage /></ProtectedRoute>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/401" element={<UnauthorizedPage />} />
      <Route path="/403" element={<ForbiddenPage />} />
      <Route path="/500" element={<ServerErrorPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
