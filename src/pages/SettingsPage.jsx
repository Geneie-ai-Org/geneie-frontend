/**
 * Settings — a full page at /settings/:section, modelled on Qwen's settings: a back arrow and
 * title on top, a list of sections on the left, and the chosen section as a narrow column of
 * rows on the right. On narrow screens the section list becomes a scrolling tab row.
 *
 * Every section works against the current backend; see SettingsSections.jsx.
 */
import { useEffect, useState } from 'react';
import { Navigate, NavLink, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CreditCard, Info, Plug, Settings2, SlidersHorizontal, User } from 'lucide-react';
import { adminWhoAmI } from '@/services/backendApi';
import {
  GeneralSection,
  UsageSection,
  NotificationsSection,
  IntegrationsSection,
  AccountSection,
  TuningSection,
  AboutSection,
} from '@/components/settings/SettingsSections';

const SECTIONS = [
  { id: 'general', label: 'General', icon: Settings2, Component: GeneralSection },
  { id: 'usage', label: 'Plan & usage', icon: CreditCard, Component: UsageSection },
  { id: 'notifications', label: 'Notifications', icon: Bell, Component: NotificationsSection },
  { id: 'integrations', label: 'Integrations', icon: Plug, Component: IntegrationsSection },
  { id: 'account', label: 'Account', icon: User, Component: AccountSection },
  { id: 'tuning', label: 'Tuning', icon: SlidersHorizontal, Component: TuningSection, adminOnly: true },
  { id: 'about', label: 'About', icon: Info, Component: AboutSection },
];

export default function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  // A 403 is the normal non-admin answer, not an error.
  useEffect(() => {
    let alive = true;
    adminWhoAmI()
      .then((d) => { if (alive) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => { if (alive) setIsAdmin(false); })
      .finally(() => { if (alive) setAdminChecked(true); });
    return () => { alive = false; };
  }, []);

  const visible = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const current = SECTIONS.find((s) => s.id === section);

  if (!current) return <Navigate to="/settings/general" replace />;
  // Wait for the admin check before bouncing someone off an admin-only section.
  if (current.adminOnly && adminChecked && !isAdmin) return <Navigate to="/settings/general" replace />;

  const { Component } = current;
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/app');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <header
        className="h-12 shrink-0 flex items-center gap-2 px-4 border-b"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="chat-chrome-btn-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <nav
          aria-label="Settings sections"
          className="shrink-0 md:w-[var(--sidebar-left-width)] md:border-r md:py-3 md:px-2 border-b md:border-b-0 overflow-x-auto"
          style={{ borderColor: 'var(--border-default)', backgroundColor: 'var(--bg-sidebar)' }}
        >
          <ul className="flex md:flex-col gap-0.5 px-2 py-2 md:p-0 min-w-max md:min-w-0">
            {visible.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <NavLink
                  to={`/settings/${id}`}
                  replace
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-teal)]"
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'var(--bg-surface-hover)' : undefined,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 500 : 400,
                  })}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
            <Component />
          </div>
        </main>
      </div>
    </div>
  );
}
