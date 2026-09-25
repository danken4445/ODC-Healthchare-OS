"use client";

import {
  createBrowserSupabaseClient,
  getCurrentStaffOrganization,
} from "@odyssey/supabase-client";
import {
  AppointmentNotificationProvider,
  AppointmentNotificationToast,
} from "@odyssey/ui";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState, type ReactNode } from "react";

export function ProviderShell({ children }: { children: ReactNode }) {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentStaffOrganization(client).then((result) => {
      if (!active) return;
      if (!result.error && result.data) {
        setOrganizationId(result.data);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void getCurrentStaffOrganization(client).then((result) => {
          if (!result.error && result.data) {
            setOrganizationId(result.data);
          }
        });
      } else {
        setOrganizationId(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  return (
    <AppointmentNotificationProvider
      client={client}
      organizationId={organizationId}
      appName="Odyssey Provider"
    >
      <AppointmentNotificationToast
        onViewAppointment={() => {
          router.push("/");
        }}
      />
      {children}
    </AppointmentNotificationProvider>
  );
}
