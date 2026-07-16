import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Gauge, CalendarBlank, Users, CurrencyInr, ListChecks,
  Gear, Sun, Moon, SignOut, GraduationCap, List, X,
} from "@phosphor-icons/react";

const NAV_TUTOR = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank },
  { to: "/students", label: "Students", icon: Users },
  { to: "/payments", label: "Payments", icon: CurrencyInr },
  { to: "/activity", label: "Activity", icon: ListChecks },
];
const NAV_STUDENT = [
  { to: "/me", label: "Overview", icon: Gauge },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank },
  { to: "/payments", label: "Fees", icon: CurrencyInr },
];

export default function AppShell() {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = profile?.role === "tutor" ? NAV_TUTOR : NAV_STUDENT;
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinkClass = (isActive) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/15"
        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
    }`;

  return (
    <div className="min-h-screen flex flex-col md:grid md:grid-cols-[240px_1fr]">
      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card flex flex-col transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:w-auto md:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        data-testid="app-sidebar"
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap size={16} weight="bold" />
            </div>
            <div>
              <div className="text-sm font-display font-bold tracking-tight leading-none">Student Management System</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                {profile?.role || ""}
              </div>
            </div>
          </div>
          <button
            className="md:hidden p-1 rounded text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-testid={`nav-${n.label.toLowerCase()}`}
              className={({ isActive }) => navLinkClass(isActive)}
              onClick={() => setMobileOpen(false)}
            >
              <n.icon size={16} weight="duotone" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-border">
          <NavLink
            to="/settings"
            data-testid="nav-settings"
            className={({ isActive }) => navLinkClass(isActive)}
            onClick={() => setMobileOpen(false)}
          >
            <Gear size={16} weight="duotone" /> Settings
          </NavLink>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col min-w-0 flex-1">
        <header className="h-14 border-b border-border bg-card px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60"
              onClick={() => setMobileOpen(true)}
            >
              <List size={20} />
            </button>
            <div className="text-sm text-muted-foreground hidden sm:block">
              Welcome back, <span className="text-foreground font-medium">{profile?.full_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle">
              {theme === "dark" ? <Sun size={16} weight="duotone" /> : <Moon size={16} weight="duotone" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 px-2 gap-2" data-testid="user-menu">
                  <Avatar className="h-6 w-6 text-[10px]">
                    <AvatarFallback>{(profile?.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm hidden md:inline">{profile?.phone}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">{profile?.full_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{profile?.phone}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings">
                  <Gear size={14} className="mr-2" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => { await signOut(); navigate("/auth"); }}
                  data-testid="menu-signout"
                >
                  <SignOut size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
