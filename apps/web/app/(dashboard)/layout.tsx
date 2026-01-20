"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@maiyuri/ui";
import { AskMaiyuri } from "../../components/AskMaiyuri";
import { useAuthStore } from "@/stores/authStore";
import { getSupabase } from "@/lib/supabase";
import { useApprovalQueue } from "@/hooks/useTickets";
import type { UserRole } from "@maiyuri/shared";

// Brand colors from Brandguidelines.md
const brandColors = {
  primary: "#1F6F43", // Earth Green
  secondary: "#8B5E3C", // Clay Brown
  accent: "#2F80ED", // Peacock Blue
  bgPrimary: "#F7F7F4", // Page background
};

// Role-based navigation configuration
// roles: array of roles that can see this item (undefined = visible to all)
interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  showBadge?: boolean;
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: HomeIcon },
  { name: "Leads", href: "/leads", icon: UsersIcon },
  { name: "Deliveries", href: "/deliveries", icon: DeliveriesIcon },
  { name: "Production", href: "/production", icon: ProductionIcon },
  {
    name: "Approvals",
    href: "/approvals",
    icon: ApprovalsIcon,
    roles: ["engineer", "accountant", "owner", "founder"],
    showBadge: true,
  },
  { name: "Design", href: "/design", icon: DesignIcon },
  { name: "Knowledge", href: "/knowledge", icon: BookIcon },
  { name: "Tasks", href: "/tasks", icon: TasksIcon },
  { name: "Coaching", href: "/coaching", icon: ChartIcon },
  { name: "KPI", href: "/kpi", icon: KPIIcon },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

// Production Supervisor can only see Dashboard, Production, Deliveries
const productionSupervisorNav = [
  "Dashboard",
  "Production",
  "Deliveries",
  "Settings",
];

function getNavigationForRole(role: UserRole | undefined): NavItem[] {
  if (role === "production_supervisor") {
    return navigation.filter((item) =>
      productionSupervisorNav.includes(item.name),
    );
  }
  // Filter out items that require specific roles the user doesn't have
  return navigation.filter((item) => {
    if (!item.roles) return true;
    return role && item.roles.includes(role);
  });
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user, setUser, logout: clearAuthState } = useAuthStore();
  const { data: approvalQueueData } = useApprovalQueue();

  // Get navigation filtered by user role
  const userRole = user?.role as UserRole | undefined;
  const filteredNavigation = getNavigationForRole(userRole);
  const pendingApprovals = approvalQueueData?.data?.pending ?? 0;

  // Fetch user profile on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabase();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const response = await fetch("/api/users/me", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            if (data.data) {
              setUser(data.data);
            }
          }
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    }

    if (!user) {
      loadUser();
    }
  }, [user, setUser]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      clearAuthState();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="relative z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/80"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar panel */}
          <div className="fixed inset-0 flex">
            <div className="relative flex w-full max-w-xs flex-1">
              {/* Close button */}
              <div className="absolute right-0 top-0 flex w-16 justify-center pt-5">
                <button
                  type="button"
                  className="-m-2.5 p-2.5"
                  onClick={() => setSidebarOpen(false)}
                >
                  <span className="sr-only">Close sidebar</span>
                  <XIcon className="h-6 w-6 text-white" />
                </button>
              </div>

              {/* Sidebar content */}
              <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-slate-800 px-6 pb-4">
                <div className="flex h-20 shrink-0 items-center">
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <Image
                      src="/logo.png"
                      alt="Maiyuri Bricks"
                      width={56}
                      height={56}
                      className="h-14 w-14"
                    />
                    <span
                      className="text-lg font-bold"
                      style={{ color: brandColors.primary }}
                    >
                      Maiyuri Bricks
                    </span>
                  </Link>
                </div>
                <nav className="flex flex-1 flex-col">
                  <ul role="list" className="flex flex-1 flex-col gap-y-7">
                    <li>
                      <ul role="list" className="-mx-2 space-y-1">
                        {filteredNavigation.map((item) => {
                          const isActive =
                            pathname === item.href ||
                            (item.href !== "/dashboard" &&
                              pathname.startsWith(item.href));
                          const showBadge =
                            item.showBadge && pendingApprovals > 0;
                          return (
                            <li key={item.name}>
                              <Link
                                href={item.href}
                                onClick={() => setSidebarOpen(false)}
                                className={cn(
                                  "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                                  isActive
                                    ? "bg-emerald-50 dark:bg-emerald-900/20"
                                    : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700",
                                )}
                                style={
                                  isActive
                                    ? { color: brandColors.primary }
                                    : undefined
                                }
                              >
                                <item.icon
                                  className={cn(
                                    "h-6 w-6 shrink-0",
                                    isActive
                                      ? "text-[#1F6F43]"
                                      : "text-slate-400 group-hover:text-emerald-600",
                                  )}
                                />
                                <span className="flex-1">{item.name}</span>
                                {showBadge && (
                                  <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                                    {pendingApprovals > 99
                                      ? "99+"
                                      : pendingApprovals}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                    {/* User info and logout */}
                    <li className="mt-auto -mx-2">
                      <div className="flex items-center gap-x-3 p-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                          <span
                            className="text-sm font-semibold"
                            style={{ color: brandColors.primary }}
                          >
                            {user?.name?.charAt(0)?.toUpperCase() || "U"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {user?.name || "User"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {user?.email || ""}
                          </p>
                        </div>
                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className="p-2 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                          title="Sign out"
                        >
                          <LogoutIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-x-4 bg-white dark:bg-slate-800 px-4 py-3 shadow-sm border-b border-slate-200 dark:border-slate-700">
        <button
          type="button"
          className="p-2.5 text-slate-700 dark:text-slate-200"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
        <Link href="/dashboard" className="flex-1 flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Maiyuri Bricks"
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <span
            className="text-sm font-semibold"
            style={{ color: brandColors.primary }}
          >
            Maiyuri Bricks
          </span>
        </Link>
      </header>

      {/* Sidebar for desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 px-6 pb-4">
          {/* Logo */}
          <div className="flex h-20 shrink-0 items-center">
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Maiyuri Bricks"
                width={56}
                height={56}
                className="h-14 w-14"
              />
              <span
                className="text-lg font-bold"
                style={{ color: brandColors.primary }}
              >
                Maiyuri Bricks
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {filteredNavigation.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href));
                    const showBadge = item.showBadge && pendingApprovals > 0;
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                            isActive
                              ? "bg-emerald-50 dark:bg-emerald-900/20"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700",
                          )}
                          style={
                            isActive
                              ? { color: brandColors.primary }
                              : undefined
                          }
                        >
                          <item.icon
                            className={cn(
                              "h-6 w-6 shrink-0",
                              isActive
                                ? "text-[#1F6F43]"
                                : "text-slate-400 group-hover:text-emerald-600",
                            )}
                          />
                          <span className="flex-1">{item.name}</span>
                          {showBadge && (
                            <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                              {pendingApprovals > 99 ? "99+" : pendingApprovals}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
              {/* User info and logout */}
              <li className="mt-auto -mx-2">
                <div className="flex items-center gap-x-3 p-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: brandColors.primary }}
                    >
                      {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {user?.name || "User"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {user?.email || ""}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="p-2 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Sign out"
                  >
                    <LogoutIcon className="h-5 w-5" />
                  </button>
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Global Ask Maiyuri Chatbot */}
      <AskMaiyuri />
    </div>
  );
}

// Simple icon components
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function KPIIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
      />
    </svg>
  );
}

function DesignIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 9h.008v.008H9.75V9zm4.5 0h.008v.008h-.008V9z"
      />
    </svg>
  );
}

function ProductionIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
      />
    </svg>
  );
}

function ApprovalsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function DeliveriesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
      />
    </svg>
  );
}
