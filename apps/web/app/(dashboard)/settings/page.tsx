'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Spinner } from '@maiyuri/ui';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  language_preference?: 'en' | 'ta';
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

async function fetchProfile(): Promise<{ data: UserProfile | null }> {
  const res = await fetch('/api/users/me');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

async function updateProfile(data: Partial<UserProfile>): Promise<{ data: UserProfile }> {
  const res = await fetch('/api/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

async function fetchTeamMembers(): Promise<{ data: TeamMember[] }> {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch team');
  return res.json();
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'team'>('profile');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your account and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="flex gap-8">
          {[
            { id: 'profile', label: 'Profile' },
            { id: 'notifications', label: 'Notifications' },
            { id: 'team', label: 'Team' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'profile' && <ProfileSettings />}
      {activeTab === 'notifications' && <NotificationSettings />}
      {activeTab === 'team' && <TeamSettings />}
    </div>
  );
}

function ProfileSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    language_preference: 'en' as 'en' | 'ta',
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const profile = profileData?.data;

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        language_preference: profile.language_preference || 'en',
      });
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    updateMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (saveStatus === 'saved' || saveStatus === 'error') {
      setSaveStatus('idle');
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
              onChange={(e) => handleChange('name', e.target.value)}
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
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Role
            </label>
            <input
              type="text"
              value={profile?.role || 'Member'}
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
              onChange={(e) => handleChange('phone', e.target.value)}
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
              onChange={(e) => handleChange('language_preference', e.target.value)}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="ta">Tamil (தமிழ்)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AI-generated insights, summaries, and recommendations will be displayed in this language.
            </p>
          </div>
        </div>
        <div className="pt-4 flex items-center gap-4">
          <Button type="submit" disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
          </Button>
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckIcon className="h-4 w-4" />
              Saved successfully
            </span>
          )}
          {saveStatus === 'error' && (
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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    // Auto-save notification settings
    setSaveStatus('saving');
    // Simulate save (in production, call API)
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Notification Preferences
        </h2>
        {saveStatus === 'saved' && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
        )}
      </div>
      <div className="space-y-6">
        {[
          {
            id: 'new_leads',
            title: 'New Lead Alerts',
            description: 'Get notified when new leads are added',
          },
          {
            id: 'follow_ups',
            title: 'Follow-up Reminders',
            description: 'Reminders for scheduled follow-ups',
          },
          {
            id: 'ai_insights',
            title: 'AI Insights',
            description: 'Notifications about AI-generated insights and recommendations',
          },
          {
            id: 'daily_summary',
            title: 'Daily Summary',
            description: 'Daily digest of lead activity and metrics',
          },
          {
            id: 'telegram',
            title: 'Telegram Notifications',
            description: 'Send notifications to Telegram bot',
          },
        ].map((setting) => (
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
                onChange={() => handleToggle(setting.id as keyof typeof settings)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamSettings() {
  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: fetchTeamMembers,
  });

  const teamMembers = teamData?.data || [];

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Team Members
        </h2>
        <Button size="sm" disabled>
          Invite Member
        </Button>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {teamMembers.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No team members found.</p>
        ) : (
          teamMembers.map((member) => (
            <div key={member.id} className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <span className="text-blue-600 dark:text-blue-300 font-medium">
                    {member.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {member.name}
                  </p>
                  <p className="text-sm text-slate-500">{member.email}</p>
                </div>
              </div>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                {member.role}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
