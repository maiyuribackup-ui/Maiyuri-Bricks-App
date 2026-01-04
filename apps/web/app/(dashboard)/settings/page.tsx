'use client';

import { useState } from 'react';
import { Card, Button } from '@maiyuri/ui';

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
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
        Profile Information
      </h2>
      <form className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Name
            </label>
            <input
              type="text"
              defaultValue="Ram Kumaran"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              defaultValue="ram@maiyuribricks.com"
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Role
            </label>
            <input
              type="text"
              defaultValue="Founder"
              disabled
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Phone
            </label>
            <input
              type="tel"
              placeholder="+91 "
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="pt-4">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>
    </Card>
  );
}

function NotificationSettings() {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">
        Notification Preferences
      </h2>
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
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamSettings() {
  const teamMembers = [
    { id: '1', name: 'Ram Kumaran', email: 'ram@maiyuribricks.com', role: 'founder' },
    { id: '2', name: 'Kavitha', email: 'kavitha@maiyuribricks.com', role: 'accountant' },
    { id: '3', name: 'Srinivasan', email: 'srinivasan@maiyuribricks.com', role: 'engineer' },
  ];

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
        {teamMembers.map((member) => (
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
        ))}
      </div>
    </Card>
  );
}
