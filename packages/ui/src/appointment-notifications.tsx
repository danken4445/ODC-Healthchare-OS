"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppointmentBookingEvent,
  RealtimeConnectionStatus,
} from "@odyssey/supabase-client";
import { subscribeToAppointmentBookings } from "@odyssey/supabase-client";

// ============================================================================
// Sound Cue Synthesizer (Web Audio API with graceful fallback & unlock)
// ============================================================================

class SoundCueEngine {
  private audioCtx: AudioContext | null = null;
  private muted: boolean = false;
  private unlocked: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem("odyssey_sound_muted") === "true";
      const unlock = () => {
        this.unlockContext();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("click", unlock);
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock, { passive: true });
      window.addEventListener("click", unlock, { passive: true });
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public unlockContext() {
    const ctx = this.getContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
    this.unlocked = true;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("odyssey_sound_muted", String(muted));
    }
  }

  /**
   * Plays a pristine 3-tone chime (D5 -> A5 -> D6) with warm attack and exponential decay.
   * Modern, pleasant, and designed specifically for healthcare environments.
   */
  public playAppointmentChime(): boolean {
    if (this.muted) return false;
    const ctx = this.getContext();
    if (!ctx) return false;

    try {
      const now = ctx.currentTime;
      // Tone 1: D5 (587.33 Hz)
      this.scheduleTone(ctx, 587.33, now, 0.45, 0.3);
      // Tone 2: A5 (880.00 Hz) - staggered by 120ms
      this.scheduleTone(ctx, 880.00, now + 0.12, 0.55, 0.32);
      // Tone 3: D6 (1174.66 Hz) - chime sparkle, staggered by 240ms
      this.scheduleTone(ctx, 1174.66, now + 0.24, 0.75, 0.26);
      return true;
    } catch {
      return false;
    }
  }

  private scheduleTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundCueEngine = new SoundCueEngine();

// ============================================================================
// Browser Tab Badge & Title Manager (Favicon + Document Title)
// ============================================================================

class BrowserTabBadgeManager {
  private originalTitle: string = "";
  private originalFavicon: string | null = null;
  private badgeCount: number = 0;
  private flashInterval: number | null = null;
  private pulseState: boolean = false;
  private appName: string = "Odyssey";

  constructor() {
    if (typeof window !== "undefined") {
      this.init();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          // Tab became visible: keep badge text steady
          this.stopFlashingTitle();
          if (this.badgeCount > 0) {
            this.applySteadyTitle();
          }
        } else if (this.badgeCount > 0) {
          // Tab hidden: flash title to catch attention
          this.startFlashingTitle();
        }
      });
    }
  }

  private init() {
    if (typeof document === "undefined") return;
    this.originalTitle = document.title || "Odyssey Healthcare OS";
    const link = this.getFaviconLink();
    if (link) {
      this.originalFavicon = link.href;
    }
  }

  public setAppName(name: string) {
    this.appName = name;
  }

  private getFaviconLink(): HTMLLinkElement | null {
    if (typeof document === "undefined") return null;
    let link = document.querySelector(
      "link[rel~='icon']",
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    return link;
  }

  public updateBadge(count: number) {
    this.badgeCount = count;
    if (count <= 0) {
      this.clearBadge();
      return;
    }

    if (document.hidden) {
      this.startFlashingTitle();
    } else {
      this.applySteadyTitle();
    }

    this.renderFaviconBadge(count, false);
  }

  private cleanTitle(title: string): string {
    return title.replace(/^\(\d+\)\s*(🔔|🔴|🚨)?\s*/i, "").replace(/^🔔\s*\(\d+\)\s*NEW APPOINTMENT BOOKED!\s*\|\s*/i, "");
  }

  private applySteadyTitle() {
    if (typeof document === "undefined") return;
    const base = this.cleanTitle(document.title || this.originalTitle || this.appName);
    document.title = `(${this.badgeCount}) 🔔 New Appointment! | ${base}`;
  }

  private startFlashingTitle() {
    if (typeof window === "undefined") return;
    this.stopFlashingTitle();

    let toggle = false;
    const base = this.cleanTitle(this.originalTitle || document.title || this.appName);

    this.flashInterval = window.setInterval(() => {
      toggle = !toggle;
      this.pulseState = toggle;
      if (toggle) {
        document.title = `🔔 (${this.badgeCount}) NEW APPOINTMENT BOOKED!`;
      } else {
        document.title = `(${this.badgeCount}) ${base}`;
      }
      // Alternate favicon glow state
      this.renderFaviconBadge(this.badgeCount, toggle);
    }, 1200);
  }

  private stopFlashingTitle() {
    if (this.flashInterval !== null && typeof window !== "undefined") {
      window.clearInterval(this.flashInterval);
      this.flashInterval = null;
    }
  }

  private renderFaviconBadge(count: number, pulse: boolean) {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Draw base medical icon
    ctx.clearRect(0, 0, 32, 32);
    // Background squircle
    ctx.fillStyle = "#0f172a"; // sleek slate/navy
    ctx.beginPath();
    ctx.roundRect(1, 1, 30, 30, 8);
    ctx.fill();

    // Subtle inner teal highlight
    ctx.fillStyle = "#0d9488";
    ctx.beginPath();
    ctx.arc(16, 16, 8, 0, Math.PI * 2);
    ctx.fill();

    // Medical cross / donut center
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(16, 16, 4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Eye-Catching Red Notification Badge on top-right corner
    const badgeX = 23;
    const badgeY = 9;
    const badgeRadius = pulse ? 8.5 : 7.5;

    // Outer glow aura
    ctx.fillStyle = pulse
      ? "rgba(239, 68, 68, 0.85)"
      : "rgba(239, 68, 68, 0.45)";
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius + 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Vibrant red badge circle
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Crisp white border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = count > 9 ? "9+" : String(count);
    ctx.fillText(text, badgeX, badgeY + 0.5);

    // Apply to link element
    const link = this.getFaviconLink();
    if (link) {
      link.href = canvas.toDataURL("image/png");
    }
  }

  public clearBadge() {
    this.badgeCount = 0;
    this.stopFlashingTitle();

    if (typeof document !== "undefined") {
      const cleaned = this.cleanTitle(document.title);
      document.title = cleaned || this.originalTitle || this.appName;
      const link = this.getFaviconLink();
      if (link && this.originalFavicon) {
        link.href = this.originalFavicon;
      }
    }
  }
}

export const tabBadgeManager = new BrowserTabBadgeManager();

// ============================================================================
// Appointment Notification Context & Hook
// ============================================================================

export interface AppointmentNotificationItem {
  id: string;
  isRead: boolean;
  receivedAt: Date;
  appointmentId?: string;
  organizationId?: string;
  patientId?: string;
  deliveryMode?: string;
  serviceType?: string;
  startAt?: string;
  status?: string;
  timestamp?: number;
}

interface AppointmentNotificationContextType {
  unreadCount: number;
  notifications: AppointmentNotificationItem[];
  latestNotification: AppointmentNotificationItem | null;
  isMuted: boolean;
  toggleMute: () => void;
  playTestChime: () => void;
  triggerTestBooking: () => void;
  markAllAsRead: () => void;
  dismissToast: (id: string) => void;
  realtimeStatus: RealtimeConnectionStatus | "CONNECTING";
}

const AppointmentNotificationContext =
  createContext<AppointmentNotificationContextType | null>(null);

export interface AppointmentNotificationProviderProps {
  client: SupabaseClient;
  organizationId?: string | null;
  appName?: string;
  children: ReactNode;
}

export function AppointmentNotificationProvider({
  client,
  organizationId,
  appName = "Odyssey",
  children,
}: AppointmentNotificationProviderProps) {
  const [notifications, setNotifications] = useState<
    AppointmentNotificationItem[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMuted, setIsMuted] = useState(soundCueEngine.isMuted());
  const [realtimeStatus, setRealtimeStatus] = useState<
    RealtimeConnectionStatus | "CONNECTING"
  >("CONNECTING");

  useEffect(() => {
    tabBadgeManager.setAppName(appName);
  }, [appName]);

  // Handle incoming booking event (from Supabase Realtime, BroadcastChannel, or Storage)
  const handleBooking = useCallback((event: AppointmentBookingEvent) => {
    soundCueEngine.unlockContext();
    soundCueEngine.playAppointmentChime();

    const newItem: AppointmentNotificationItem = {
      ...event,
      id: event.appointmentId || `booking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      isRead: false,
      receivedAt: new Date(event.timestamp || Date.now()),
    };

    setNotifications((prev) => [newItem, ...prev.slice(0, 19)]);
    setUnreadCount((c) => {
      const next = c + 1;
      tabBadgeManager.updateBadge(next);
      return next;
    });
  }, []);

  // Subscribe to real-time events across Supabase Realtime & cross-tab channels
  useEffect(() => {
    if (!client) return;
    const unsubscribe = subscribeToAppointmentBookings(
      // Cast client to any database type accepted by supabase-client
      client as any,
      organizationId,
      handleBooking,
      (status: RealtimeConnectionStatus) => setRealtimeStatus(status),
    );
    return () => {
      unsubscribe();
    };
  }, [client, organizationId, handleBooking]);

  const toggleMute = useCallback(() => {
    const next = !soundCueEngine.isMuted();
    soundCueEngine.setMuted(next);
    setIsMuted(next);
  }, []);

  const playTestChime = useCallback(() => {
    soundCueEngine.unlockContext();
    soundCueEngine.playAppointmentChime();
  }, []);

  const triggerTestBooking = useCallback(() => {
    handleBooking({
      appointmentId: `sim-${Date.now()}`,
      deliveryMode: Math.random() > 0.5 ? "virtual" : "in_person",
      serviceType: "General Consultation",
      timestamp: Date.now(),
    });
  }, [handleBooking]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    tabBadgeManager.clearBadge();
  }, []);

  const dismissToast = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((c) => {
      const next = Math.max(0, c - 1);
      tabBadgeManager.updateBadge(next);
      return next;
    });
  }, []);

  const latestNotification =
    notifications.find((n) => !n.isRead) ?? null;

  return (
    <AppointmentNotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        latestNotification,
        isMuted,
        toggleMute,
        playTestChime,
        triggerTestBooking,
        markAllAsRead,
        dismissToast,
        realtimeStatus,
      }}
    >
      {children}
    </AppointmentNotificationContext.Provider>
  );
}

export function useAppointmentNotifications() {
  const ctx = useContext(AppointmentNotificationContext);
  if (!ctx) {
    throw new Error(
      "useAppointmentNotifications must be used within an AppointmentNotificationProvider",
    );
  }
  return ctx;
}

// ============================================================================
// UI Component: Eye-Catching Floating Toast Alert
// ============================================================================

export function AppointmentNotificationToast({
  onViewAppointment,
}: {
  onViewAppointment?: (item: AppointmentNotificationItem) => void;
}) {
  const { latestNotification, dismissToast } = useAppointmentNotifications();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (latestNotification) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 9000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [latestNotification]);

  if (!latestNotification || !visible) return null;

  const mode = latestNotification.deliveryMode === "virtual" ? "Virtual Teleconsult" : "In-Person Clinic Visit";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="odyssey-notification-toast"
      onClick={() => soundCueEngine.unlockContext()}
    >
      <div className="odyssey-notification-toast__icon-box">
        <span className="odyssey-notification-toast__pulse" />
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="odyssey-notification-toast__bell-icon"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </div>

      <div className="odyssey-notification-toast__body">
        <div className="odyssey-notification-toast__header">
          <strong className="odyssey-notification-toast__title">
            New Appointment Booked!
          </strong>
          <span className="odyssey-notification-toast__badge">
            {mode}
          </span>
        </div>
        <p className="odyssey-notification-toast__message">
          A patient just booked a {mode.toLowerCase()} appointment. It has been added to the live clinical queue.
        </p>
      </div>

      <div className="odyssey-notification-toast__actions">
        {onViewAppointment && (
          <button
            type="button"
            className="odyssey-notification-toast__view-btn"
            onClick={() => {
              setVisible(false);
              dismissToast(latestNotification.id);
              onViewAppointment(latestNotification);
            }}
          >
            View
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss notification"
          className="odyssey-notification-toast__close-btn"
          onClick={() => {
            setVisible(false);
            dismissToast(latestNotification.id);
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// UI Component: Notification Bell & Quick Action Controller
// ============================================================================

export function AppointmentNotificationControl({
  className = "",
}: {
  className?: string;
}) {
  const {
    unreadCount,
    isMuted,
    toggleMute,
    playTestChime,
    triggerTestBooking,
    markAllAsRead,
    notifications,
    realtimeStatus,
  } = useAppointmentNotifications();

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div className={`odyssey-notification-ctrl-wrapper ${className}`} ref={popoverRef}>
      <button
        type="button"
        className={`odyssey-notification-bell-btn ${unreadCount > 0 ? "odyssey-notification-bell-btn--active" : ""}`}
        aria-label={`Appointment notifications, ${unreadCount} unread`}
        title={`Appointment notifications (${unreadCount} unread). Sound: ${isMuted ? "Muted" : "Active"}`}
        onClick={() => {
          soundCueEngine.unlockContext();
          setOpen((prev) => !prev);
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="odyssey-notification-badge-pill">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="odyssey-notification-dropdown" role="dialog" aria-label="Appointment Alerts">
          <div className="odyssey-notification-dropdown__header">
            <div>
              <div className="odyssey-notification-dropdown__title">
                Appointment Alerts
              </div>
              <div className="odyssey-notification-dropdown__status">
                <span className="odyssey-notification-dropdown__status-dot" />
                <span>Realtime: {realtimeStatus.toLowerCase()}</span>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="odyssey-notification-dropdown__clear-btn"
                onClick={() => markAllAsRead()}
              >
                Clear Tab Badge
              </button>
            )}
          </div>

          {/* Quick Sound & Test Controls */}
          <div className="odyssey-notification-dropdown__tools">
            <button
              type="button"
              className="odyssey-notification-tool-btn"
              onClick={() => playTestChime()}
              title="Test audio chime playback"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span>Test Chime</span>
            </button>

            <button
              type="button"
              className="odyssey-notification-tool-btn"
              onClick={() => triggerTestBooking()}
              title="Simulate booking: tests browser tab badge, flashing title, and sound cue"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span>Test Booking</span>
            </button>

            <button
              type="button"
              className={`odyssey-notification-tool-btn ${isMuted ? "odyssey-notification-tool-btn--muted" : ""}`}
              onClick={() => toggleMute()}
              title={isMuted ? "Unmute appointment chime" : "Mute appointment chime"}
            >
              {isMuted ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  </svg>
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <span>Sound On</span>
                </>
              )}
            </button>
          </div>

          {/* List of Recent Booking Notifications */}
          <div className="odyssey-notification-dropdown__list">
            {notifications.length === 0 ? (
              <div className="odyssey-notification-dropdown__empty">
                No recent appointment bookings. Realtime listener is armed and waiting.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`odyssey-notification-item ${!item.isRead ? "odyssey-notification-item--unread" : ""}`}
                >
                  <div className="odyssey-notification-item__header">
                    <strong>New Booking</strong>
                    <span className="odyssey-notification-item__time">
                      {new Date(item.receivedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="odyssey-notification-item__desc">
                    {item.deliveryMode === "virtual"
                      ? "Virtual Teleconsultation appointment scheduled."
                      : "In-Person clinical appointment scheduled."}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
