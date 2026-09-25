"use client";

import {
  Activity, BadgeDollarSign, Boxes, Building2, CalendarDays,
  ClipboardCheck, FileClock, FileText, Flag, FlaskConical, Globe2, HandCoins,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Palette, QrCode, ReceiptText,
  ShieldCheck, ShoppingCart, Stethoscope, UserCog, Users, X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { canAccessAdminDestination, getAdminRouteRule, type AdminDestination } from "../lib/admin-access";
import { OrgContextBar } from "./org-context-bar";
import { AdminDataProvider, useAdminData } from "./admin-data-context";

interface NavItem extends AdminDestination {
  icon: LucideIcon;
  label: string;
}

const navSections: Array<{ label: string; items: NavItem[] }> = [
  { label: "Operations", items: [
    { href: "/", label: "Analytics", icon: LayoutDashboard, anyOf: ["can_view_analytics"] },
    { href: "/appointments", label: "Appointments", icon: CalendarDays, anyOf: ["can_manage_appointments"] },
    { href: "/patients", label: "Patient records", icon: Users, anyOf: ["can_manage_patients"] },
    { href: "/patient-lookup", label: "Patient QR", icon: QrCode, anyOf: ["can_identify_patients"] },
    { href: "/patients/audit", label: "Patient audit", icon: FileClock, anyOf: ["can_view_audit_log"] },
  ]},
  { label: "Clinical support", items: [
    { href: "/inventory", label: "Inventory", icon: Boxes, anyOf: ["can_view_inventory", "can_manage_inventory", "can_tag_inventory_usage"] },
    { href: "/laboratory-services", label: "Laboratory services", icon: FlaskConical, anyOf: ["can_manage_laboratory_services"] },
  ]},
  { label: "Revenue", items: [
    { href: "/billing", label: "Billing", icon: BadgeDollarSign, anyOf: ["can_view_billing", "can_manage_billing"] },
    { href: "/billing/claims", label: "Claims & HMO", icon: ClipboardCheck, anyOf: ["can_view_claims", "can_manage_claims"] },
    { href: "/companies", label: "Company accounts", icon: Building2, anyOf: ["can_view_billing", "can_manage_billing", "can_view_claims", "can_manage_claims"] },
    { href: "/pos", label: "Point of sale", icon: ShoppingCart, anyOf: ["can_manage_pos"] },
    { href: "/payouts", label: "Doctor payouts", icon: HandCoins, anyOf: ["can_view_payouts", "can_manage_payouts"] },
  ]},
  { label: "Administration", items: [
    { href: "/staff", label: "Staff accounts", icon: UserCog, allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
    { href: "/departments", label: "Departments", icon: Building2, allowSuperadmin: true, anyOf: ["can_manage_staff_roles", "can_manage_inventory"] },
    { href: "/roles", label: "Roles & permissions", icon: ShieldCheck, allowSuperadmin: true, anyOf: ["can_manage_staff_roles"] },
    { href: "/settings/services", label: "Service catalog", icon: Stethoscope, allowSuperadmin: true, anyOf: ["can_manage_service_catalog"] },
    { href: "/settings/templates", label: "Document templates", icon: FileText, allowSuperadmin: true, anyOf: ["can_manage_document_templates"] },
    { href: "/settings/branding", label: "Clinic branding", icon: Palette, allowSuperadmin: true, anyOf: ["can_manage_clinic_branding"] },
    { href: "/settings/features", label: "Feature flags", icon: Flag, allowSuperadmin: true, anyOf: ["can_manage_feature_modules"] },
  ]},
  { label: "Platform oversight", items: [
    { href: "/superadmin/clinics", label: "Clinics", icon: Globe2, superadminOnly: true },
    { href: "/superadmin/admins", label: "Admin directory", icon: ShieldCheck, superadminOnly: true },
    { href: "/superadmin/analytics", label: "Network analytics", icon: Activity, superadminOnly: true },
    { href: "/superadmin/audit", label: "Global audit", icon: FileClock, superadminOnly: true },
    { href: "/superadmin/break-glass", label: "Break-glass log", icon: ReceiptText, superadminOnly: true },
  ]},
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
  const fallbackHref = visibleSections[0]?.items[0]?.href ?? null;

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
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <div className="brand-mark" aria-hidden="true">O</div>
          <div><strong>Odyssey</strong><span>Healthcare OS</span></div>
          <button className="icon-button sidebar__close" aria-label="Close navigation" onClick={() => setOpen(false)}><X aria-hidden="true" size={19} /></button>
        </div>
        <nav aria-label="Administration" aria-busy={permissionsLoading}>
          {permissionsLoading && email ? <div className="nav-loading" aria-live="polite"><span className="loading-spinner" aria-hidden="true" />Loading access…</div> : visibleSections.map((section) => (
            <section className="nav-section" key={section.label}>
              <h2>{section.label}</h2>
              {section.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const pending = pendingHref === item.href;
                const Icon = item.icon;
                return <Link aria-current={active ? "page" : undefined} aria-busy={pending} className={`${active ? "nav-link nav-link--active" : "nav-link"}${pending ? " nav-link--pending" : ""}`} href={item.href} key={item.href} onClick={() => { setOpen(false); if (!active) setPendingHref(item.href); }}>{pending ? <LoaderCircle className="nav-link__spinner" aria-hidden="true" size={17} /> : <Icon aria-hidden="true" size={17} />}{item.label}</Link>;
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="user-avatar" aria-hidden="true">OA</div>
            <div className="sidebar__user-details">
              <strong>{email ?? "Odyssey administrator"}</strong>
              <span>{isSuperadmin ? "Platform administrator" : organization?.name ?? "Clinic account"}</span>
            </div>
          </div>
          {email ? (
            <button
              className="sidebar__logout-button"
              type="button"
              onClick={() => void handleLogOut()}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut aria-hidden="true" size={14} />
              <span>Log out</span>
            </button>
          ) : null}
        </div>
      </aside>
      {open ? <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}
      <div className="workspace">
        <header className="mobile-header">
          <div className="mobile-header__main">
            <button className="icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu aria-hidden="true" size={20} /></button>
            <strong>Odyssey Administration</strong>
          </div>
          {email ? (
            <button
              className="mobile-header__logout"
              type="button"
              onClick={() => void handleLogOut()}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut aria-hidden="true" size={15} />
              <span>Log out</span>
            </button>
          ) : null}
        </header>
        <OrgContextBar />
        <main className="workspace__main" ref={mainRef} tabIndex={-1}><RouteAccessBoundary fallbackHref={fallbackHref}>{children}</RouteAccessBoundary></main>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return <AdminDataProvider><AdminShellContent>{children}</AdminShellContent></AdminDataProvider>;
}
