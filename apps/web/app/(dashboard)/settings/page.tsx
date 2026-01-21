"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Spinner } from "@maiyuri/ui";
import { SmartQuoteImagesTab } from "@/components/settings/SmartQuoteImagesTab";
import { HelpButton } from "@/components/help";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  language_preference?: "en" | "ta";
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  invitation_status?: "pending" | "active" | "deactivated";
  is_active?: boolean;
}

async function fetchProfile(): Promise<{ data: UserProfile | null }> {
  const res = await fetch("/api/users/me");
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

async function updateProfile(
  data: Partial<UserProfile>,
): Promise<{ data: UserProfile }> {
  const res = await fetch("/api/users/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

async function fetchTeamMembers(): Promise<{ data: TeamMember[] }> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch team");
  return res.json();
}

type TabId = "profile" | "notifications" | "team" | "smart-quotes" | "nudges";

interface Tab {
  id: TabId;
  label: string;
  roles?: string[]; // If defined, only show for these roles
}

const TABS: Tab[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "team", label: "Team", roles: ["founder", "owner"] },
  { id: "smart-quotes", label: "Smart Quotes", roles: ["founder"] },
  { id: "nudges", label: "Nudges", roles: ["founder", "owner", "admin"] },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  // Get user profile to check role
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const userRole = profileData?.data?.role;

  // Filter tabs based on user role
  const visibleTabs = TABS.filter(
    (tab) => !tab.roles || (userRole && tab.roles.includes(userRole)),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your account and preferences
          </p>
        </div>
        <HelpButton section="settings" variant="icon" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-8">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === "profile" && <ProfileSettings />}
      {activeTab === "notifications" && <NotificationSettings />}
      {activeTab === "team" && <TeamSettings />}
      {activeTab === "smart-quotes" && <SmartQuoteImagesTab />}
      {activeTab === "nudges" && <NudgesSettings />}
    </div>
  );
}

function ProfileSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    language_preference: "en" as "en" | "ta",
  });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const profile = profileData?.data;

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        language_preference: profile.language_preference || "en",
      });
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    updateMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (saveStatus === "saved" || saveStatus === "error") {
      setSaveStatus("idle");
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
        Profile Information
      </h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Role
            </label>
            <input
              type="text"
              value={profile?.role || "Member"}
              disabled
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm text-slate-500 capitalize"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+91 "
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              AI Insights Language
            </label>
            <select
              value={formData.language_preference}
              onChange={(e) =>
                handleChange("language_preference", e.target.value)
              }
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="ta">Tamil (தமிழ்)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AI-generated insights, summaries, and recommendations will be
              displayed in this language.
            </p>
          </div>
        </div>
        <div className="pt-4 flex items-center gap-4">
          <Button type="submit" disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving..." : "Save Changes"}
          </Button>
          {saveStatus === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckIcon className="h-4 w-4" />
              Saved successfully
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">
              Failed to save. Please try again.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}

function NotificationSettings() {
  const [settings, setSettings] = useState({
    new_leads: true,
    follow_ups: true,
    ai_insights: true,
    daily_summary: true,
    telegram: false,
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [telegramStatus, setTelegramStatus] = useState<
    "idle" | "testing" | "success" | "error"
  >("idle");
  const [telegramError, setTelegramError] = useState("");

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
    // Auto-save notification settings
    setSaveStatus("saving");
    // Simulate save (in production, call API)
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 500);
  };

  const testTelegram = async () => {
    setTelegramStatus("testing");
    setTelegramError("");
    try {
      const res = await fetch("/api/notifications/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      const data = await res.json();
      if (res.ok) {
        setTelegramStatus("success");
        setTimeout(() => setTelegramStatus("idle"), 3000);
      } else {
        setTelegramStatus("error");
        setTelegramError(data.error || "Failed to send test message");
      }
    } catch (err) {
      setTelegramStatus("error");
      setTelegramError("Network error. Please try again.");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Notification Preferences
        </h2>
        {saveStatus === "saved" && (
          <span className="text-sm text-green-600 dark:text-green-400">
            Saved
          </span>
        )}
      </div>
      <div className="space-y-6">
        {(
          [
            {
              id: "new_leads",
              title: "New Lead Alerts",
              description: "Get notified when new leads are added",
            },
            {
              id: "follow_ups",
              title: "Follow-up Reminders",
              description: "Reminders for scheduled follow-ups",
            },
            {
              id: "ai_insights",
              title: "AI Insights",
              description:
                "Notifications about AI-generated insights and recommendations",
            },
            {
              id: "daily_summary",
              title: "Daily Summary",
              description: "Daily digest of lead activity and metrics",
            },
          ] as const
        ).map((setting) => (
          <div key={setting.id} className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                {setting.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {setting.description}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings[setting.id as keyof typeof settings]}
                onChange={() =>
                  handleToggle(setting.id as keyof typeof settings)
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        ))}

        {/* Telegram Settings */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                Telegram Notifications
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Send notifications to Telegram bot
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={testTelegram}
                disabled={telegramStatus === "testing"}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
              >
                {telegramStatus === "testing"
                  ? "Testing..."
                  : "Test Connection"}
              </button>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.telegram}
                  onChange={() => handleToggle("telegram")}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
          {telegramStatus === "success" && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Test message sent successfully! Check your Telegram.
            </p>
          )}
          {telegramStatus === "error" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {telegramError}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function TeamSettings() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    phone: "",
    role: "engineer",
  });
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [inviteError, setInviteError] = useState("");

  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const isFounder = profileData?.data?.role === "founder";

  const { data: teamData, isLoading } = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeamMembers,
  });

  const teamMembers = teamData?.data || [];

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteStatus("loading");
    setInviteError("");

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      setInviteStatus("success");
      queryClient.invalidateQueries({ queryKey: ["team"] });

      // Reset and close modal after success
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteForm({ email: "", name: "", phone: "", role: "engineer" });
        setInviteStatus("idle");
      }, 2000);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
      setInviteStatus("error");
    }
  };

  const handleResendInvite = async (memberId: string) => {
    const member = teamMembers.find((m) => m.id === memberId);
    if (!member) return;

    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: member.email,
          name: member.name,
          phone: member.phone,
          role: member.role,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to resend invitation");
      }

      alert("Invitation resent successfully!");
    } catch (err) {
      alert("Failed to resend invitation. Please try again.");
    }
  };

  const handleDeactivate = async (memberId: string) => {
    if (
      !confirm(
        "Are you sure you want to deactivate this user? They will no longer be able to access the system.",
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_active: false,
          invitation_status: "deactivated",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to deactivate user");
      }

      queryClient.invalidateQueries({ queryKey: ["team"] });
    } catch (err) {
      alert("Failed to deactivate user. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  const getStatusBadge = (member: TeamMember) => {
    if (member.invitation_status === "pending") {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
          Pending
        </span>
      );
    }
    if (
      member.invitation_status === "deactivated" ||
      member.is_active === false
    ) {
      return (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          Deactivated
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
        Active
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      founder:
        "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
      accountant:
        "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
      engineer:
        "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${colors[role] || colors.engineer}`}
      >
        {role}
      </span>
    );
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Team Members
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
            </p>
          </div>
          {isFounder && (
            <Button size="sm" onClick={() => setShowInviteModal(true)}>
              <PlusIcon className="h-4 w-4 mr-1" />
              Invite Member
            </Button>
          )}
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {teamMembers.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              No team members found.
            </p>
          ) : (
            teamMembers.map((member) => (
              <div
                key={member.id}
                className="py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <span className="text-blue-600 dark:text-blue-300 font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {member.name}
                      </p>
                      {getStatusBadge(member)}
                    </div>
                    <p className="text-sm text-slate-500">{member.email}</p>
                    {member.phone && (
                      <p className="text-xs text-slate-400">{member.phone}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getRoleBadge(member.role)}
                  {isFounder && member.id !== profileData?.data?.id && (
                    <div className="relative group">
                      <button className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <MoreIcon className="h-5 w-5 text-slate-400" />
                      </button>
                      <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        {member.invitation_status === "pending" && (
                          <button
                            onClick={() => handleResendInvite(member.id)}
                            className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            Resend Invite
                          </button>
                        )}
                        {member.is_active !== false && (
                          <button
                            onClick={() => handleDeactivate(member.id)}
                            className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Deactivate
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Invite Team Member
              </h3>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteStatus("idle");
                  setInviteError("");
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="p-4 space-y-4">
              {inviteStatus === "success" ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckIcon className="h-8 w-8 text-green-600" />
                  </div>
                  <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                    Invitation Sent!
                  </h4>
                  <p className="text-sm text-slate-500">
                    An email has been sent to {inviteForm.email}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={inviteForm.name}
                      onChange={(e) =>
                        setInviteForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      required
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="email@example.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Phone (for Notifications)
                    </label>
                    <input
                      type="tel"
                      value={inviteForm.phone}
                      onChange={(e) =>
                        setInviteForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Role *
                    </label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) =>
                        setInviteForm((prev) => ({
                          ...prev,
                          role: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="engineer">Engineer</option>
                      <option value="accountant">Accountant</option>
                      <option value="founder">Founder</option>
                    </select>
                  </div>

                  {inviteError && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg">
                      {inviteError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => {
                        setShowInviteModal(false);
                        setInviteStatus("idle");
                        setInviteError("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={inviteStatus === "loading"}
                    >
                      {inviteStatus === "loading"
                        ? "Sending..."
                        : "Send Invitation"}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function NudgesSettings() {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <BellIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            AI Nudge System
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Configure automated follow-up reminders for your team. Set up rules
            to nudge staff about overdue follow-ups, high-score leads, and more.
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              Morning Digest
            </span>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
              Manual Triggers
            </span>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
              Telegram Notifications
            </span>
          </div>
          <a
            href="/settings/nudges"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Manage Nudge Rules
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </Card>
  );
}

function BellIcon({ className }: { className?: string }) {
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
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
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
        d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
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
        d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
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

function CheckIcon({ className }: { className?: string }) {
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
        d="M4.5 12.75l6 6 9-13.5"
      />
    </svg>
  );
}
