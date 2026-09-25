"use client";

import {
  Activity,
  BadgeDollarSign,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  FileText,
  Flag,
  FlaskConical,
  Globe2,
  HandCoins,
  HelpCircle,
  Home,
  LayoutDashboard,
  LoaderCircle,
  Lock,
  LogOut,
  Menu,
  Palette,
  Pill,
  ReceiptText,
  Share2,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { canAccessAdminDestination, getAdminRouteRule, type AdminDestination } from "../lib/admin-access";
import { OrgContextBar } from "./org-context-bar";
import { AdminDataProvider, useAdminData } from "./admin-data-context";
import {
  AppointmentNotificationProvider,
  AppointmentNotificationToast,
  AppointmentNotificationControl,
} from "@odyssey/ui";

interface NavItem extends AdminDestination {
  icon: LucideIcon;
  label: string;
}

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "OVERVIEW",
    items: [
      { href: "/", label: "Home", icon: Home, public: true },
      { href: "/queue", label: "Queue", icon: Users, public: true },
      { href: "/teleconsult", label: "Teleconsult", icon: Video, anyOf: ["can_start_consultation", "can_record_triage", "can_manage_appointments", "can_access_admin_portal"] },
      { href: "/soap-notes", label: "SOAP Notes", icon: FileText, anyOf: ["can_start_consultation", "can_record_triage", "can_manage_patients", "can_access_admin_portal"] },
      { href: "/referrals", label: "Referrals", icon: Share2, anyOf: ["can_view_referrals", "can_order_diagnostics", "can_manage_patients", "can_access_admin_portal"] },
    ],
  },
  {
    label: "MODULES",
    items: [
      { href: "/appointments", label: "Booking / Appointments", icon: CalendarDays, anyOf: ["can_manage_appointments"] },
      { href: "/patients", label: "Outpatients", icon: UserCheck, anyOf: ["can_manage_patients"] },
      { href: "/prescriptions", label: "Prescriptions", icon: Pill, anyOf: ["can_start_consultation", "can_manage_patients", "can_access_admin_portal"] },
      { href: "/laboratory-services", label: "Diagnostics / Mini-LIS", icon: FlaskConical, anyOf: ["can_manage_laboratory_services"] },
      { href: "/inventory", label: "Inventory", icon: Boxes, anyOf: ["can_view_inventory", "can_manage_inventory", "can_tag_inventory_usage"] },
      { href: "/payouts", label: "Payouts", icon: HandCoins, anyOf: ["can_view_payouts", "can_manage_payouts"] },
    ],
  },
  {
    label: "BILLING & ADMIN",
    items: [
      { href: "/billing", label: "Billing / POS", icon: ReceiptText, anyOf: ["can_view_billing", "can_manage_billing", "can_manage_pos"] },
      { href: "/billing/claims", label: "HMO Claims", icon: ClipboardCheck, anyOf: ["can_view_claims", "can_manage_claims"] },
      { href: "/roles", label: "RBAC / Roles", icon: ShieldCheck, allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
      { href: "/settings/branding", label: "White-Labeling", icon: Palette, allowSuperadmin: true, anyOf: ["can_manage_clinic_branding"] },
      { href: "/settings/features", label: "Security", icon: Lock, allowSuperadmin: true, anyOf: ["can_manage_feature_modules"] },
      { href: "/support", label: "Support", icon: HelpCircle, public: true },
    ],
  },
];

function RouteAccessBoundary({ children, fallbackHref }: { children: ReactNode; fallbackHref: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const { email, isSuperadmin, loading, permissions, permissionsError, permissionsLoading, refreshAccess } = useAdminData();
  const rule = getAdminRouteRule(pathname);
  const allowed = !rule || canAccessAdminDestination(rule, permissions, isSuperadmin);
  const redirectHref = isSuperadmin ? "/superadmin/analytics" : fallbackHref;
  const shouldRedirect = Boolean(email && !loading && !permissionsLoading && !permissionsError && !allowed && redirectHref && redirectHref !== pathname);

  useEffect(() => {
    if (shouldRedirect && redirectHref) router.replace(redirectHref);
  }, [redirectHref, router, shouldRedirect]);

  if (rule?.public) return children;
  if (loading || (email && permissionsLoading)) {
    return <section className="route-loading" aria-live="polite" aria-busy="true"><span className="loading-spinner" aria-hidden="true" />Loading your workspace…</section>;
  }
  if (!email) return children;
  if (permissionsError) {
    return <section className="data-error" role="alert"><strong>Permissions could not be loaded.</strong><p>{permissionsError}</p><button className="ui-button ui-button--outline" type="button" onClick={() => void refreshAccess()}>Retry access check</button></section>;
  }
  if (!allowed) {
    return <section className="route-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" />Opening an authorized workspace…</section>;
  }
  return children;
}

function AdminShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(pathname);
  const { email, isSuperadmin, organization, permissions, permissionsLoading, signOut } = useAdminData();

  const visibleSections = useMemo(() => navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessAdminDestination(item, permissions, isSuperadmin)),
  })).filter((section) => section.items.length), [isSuperadmin, permissions]);

  const fallbackHref = visibleSections[0]?.items[0]?.href ?? "/";

  const handleLogOut = async () => {
    setOpen(false);
    await signOut();
    router.push("/");
  };

  useEffect(() => {
    setPendingHref(null);
    setOpen(false);
    if (previousPathname.current !== pathname) {
      mainRef.current?.focus({ preventScroll: true });
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return (
    <div className="admin-shell">
      {/* Vesper-style White Sidebar */}
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="vesper-brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 4L12 20L20 4" stroke="#2563EB" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 4L12 12L16 4" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="vesper-brand-text">
            <strong>Odyssey</strong>
            <span>Healthcare OS</span>
          </div>
          <button className="icon-button sidebar__close" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <X aria-hidden="true" size={19} />
          </button>
        </div>

        <nav aria-label="Odyssey Navigation" aria-busy={permissionsLoading}>
          {permissionsLoading && email ? (
            <div className="nav-loading" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true" />
              Loading access…
            </div>
          ) : (
            visibleSections.map((section) => (
              <section className="nav-section" key={section.label}>
                <h2 className="nav-section__title">{section.label}</h2>
                <div className="nav-section__items">
                  {section.items.map((item) => {
                    const active =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const pending = pendingHref === item.href;
                    const Icon = item.icon;

                    return (
                      <Link
                        aria-current={active ? "page" : undefined}
                        aria-busy={pending}
                        className={`nav-link ${active ? "nav-link--active" : ""}${
                          pending ? " nav-link--pending" : ""
                        }`}
                        href={item.href}
                        key={item.href}
                        onClick={() => {
                          setOpen(false);
                          if (!active) setPendingHref(item.href);
                        }}
                      >
                        {pending ? (
                          <LoaderCircle className="nav-link__spinner" aria-hidden="true" size={17} />
                        ) : (
                          <Icon aria-hidden="true" size={17} />
                        )}
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </nav>

        {/* Pinned Logout at bottom of sidebar per Section 1 tokens */}
        <div className="sidebar__footer">
          <button
            className="sidebar__logout-button"
            type="button"
            onClick={() => void handleLogOut()}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut aria-hidden="true" size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}

      <div className="workspace">
        <header className="mobile-header">
          <div className="mobile-header__main">
            <button className="icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
              <Menu aria-hidden="true" size={20} />
            </button>
            <strong>Odyssey Healthcare OS</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AppointmentNotificationControl />
            {email && (
              <button
                className="mobile-header__logout"
                type="button"
                onClick={() => void handleLogOut()}
                aria-label="Log out"
                title="Log out"
              >
                <LogOut aria-hidden="true" size={15} />
              </button>
            )}
          </div>
        </header>

        {pathname !== "/" && <OrgContextBar />}

        <main className="workspace__main" ref={mainRef} tabIndex={-1}>
          <RouteAccessBoundary fallbackHref={fallbackHref}>
            {children}
          </RouteAccessBoundary>
        </main>
      </div>
    </div>
  );
}

function AdminNotificationWrapper({ children }: { children: ReactNode }) {
  const { client, organization } = useAdminData();
  const router = useRouter();

  return (
    <AppointmentNotificationProvider
      client={client}
      organizationId={organization?.id}
      appName="Odyssey Administration"
    >
      <AppointmentNotificationToast
        onViewAppointment={() => {
          router.push("/appointments");
        }}
      />
      {children}
    </AppointmentNotificationProvider>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminNotificationWrapper>
        <AdminShellContent>{children}</AdminShellContent>
      </AdminNotificationWrapper>
    </AdminDataProvider>
  );
}
