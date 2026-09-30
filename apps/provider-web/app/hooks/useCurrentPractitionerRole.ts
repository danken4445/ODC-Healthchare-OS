"use client";

import {
  createBrowserSupabaseClient,
  getCurrentProviderRoleId,
} from "@odyssey/supabase-client";
import { useEffect, useState } from "react";

interface CurrentPractitionerRoleState {
  practitionerRoleId: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useCurrentPractitionerRole(
  organizationId: string | null,
  enabled = true,
): CurrentPractitionerRoleState {
  const [state, setState] = useState<CurrentPractitionerRoleState>({
    practitionerRoleId: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!organizationId || !enabled) {
      setState({
        practitionerRoleId: null,
        isLoading: false,
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({ ...current, isLoading: true, error: null }));
    void getCurrentProviderRoleId(
      createBrowserSupabaseClient(),
      organizationId,
    ).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setState({
          practitionerRoleId: null,
          isLoading: false,
          error: result.error.message,
        });
        return;
      }
      setState({
        practitionerRoleId: result.data,
        isLoading: false,
        error: null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId]);

  return state;
}
