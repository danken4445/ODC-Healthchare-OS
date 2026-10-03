"use client";

import {
  getDemographicBreakdown,
  getEpidemicCurve,
  getMorbidityTrends,
} from "@odyssey/supabase-client";
import type { DemographicBreakdownCell, EpidemicCurvePoint, MorbidityTrend } from "@odyssey/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminData } from "../components/admin-data-context";

type SurveillanceData = {
  demographics: DemographicBreakdownCell[];
  epidemicCurve: EpidemicCurvePoint[];
  morbidity: MorbidityTrend[];
};

const EMPTY_DATA: SurveillanceData = { demographics: [], epidemicCurve: [], morbidity: [] };

function currentEpiPeriod(): { year: number; week: number } {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const day = Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
  return { year: today.getUTCFullYear(), week: Math.min(53, Math.max(1, Math.ceil(day / 7))) };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Surveillance request was cancelled.", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function useDiseaseSurveillance() {
  const { client, email, error: accessError, loading: accessLoading, organization, readCache, writeCache } = useAdminData();
  const period = useMemo(currentEpiPeriod, []);
  const [epiYear, setEpiYear] = useState(period.year);
  const [epiWeek, setEpiWeek] = useState(period.week);
  const [activeDiseaseCode, setActiveDiseaseCode] = useState<string | null>(null);
  const [data, setData] = useState<SurveillanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (accessLoading) return;
      if (!email || accessError) {
        setData(EMPTY_DATA);
        setError(accessError ?? "Administrative sign-in is required to view surveillance analytics.");
        setLoading(false);
        return;
      }
      if (!organization) {
        setData(EMPTY_DATA);
        setError("Select a clinic organization to view surveillance analytics.");
        setLoading(false);
        return;
      }

      const morbidityKey = `surveillance:morbidity:${organization.id}:${epiYear}`;
      const cachedMorbidity = readCache<MorbidityTrend[]>(morbidityKey, 60_000);
      try {
        setLoading(!cachedMorbidity);
        setError(null);
        const morbidity = cachedMorbidity ?? await abortable(
          getMorbidityTrends(client, { organizationId: organization.id, epiYear, limit: 10 }),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!cachedMorbidity) writeCache(morbidityKey, morbidity);
        const selectedCode = activeDiseaseCode && morbidity.some((trend) => trend.icd10Code === activeDiseaseCode)
          ? activeDiseaseCode
          : morbidity[0]?.icd10Code ?? null;
        setActiveDiseaseCode(selectedCode);
        if (!selectedCode) {
          setData({ demographics: [], epidemicCurve: [], morbidity });
          setLoading(false);
          return;
        }
        const detailKey = `surveillance:detail:${organization.id}:${epiYear}:${epiWeek}:${selectedCode}`;
        const cachedDetail = readCache<Pick<SurveillanceData, "demographics" | "epidemicCurve">>(detailKey, 60_000);
        const detail: Pick<SurveillanceData, "demographics" | "epidemicCurve"> = cachedDetail ?? await abortable(
          Promise.all([
            getEpidemicCurve(client, { organizationId: organization.id, icd10Code: selectedCode, weeks: 12 }),
            getDemographicBreakdown(client, { organizationId: organization.id, icd10Code: selectedCode }),
          ]).then(([epidemicCurve, demographics]) => ({
            epidemicCurve: epidemicCurve.filter((point) => point.epiYear < epiYear || (point.epiYear === epiYear && point.epiWeek <= epiWeek)),
            demographics,
          })),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!cachedDetail) writeCache(detailKey, detail);
        setData({ morbidity, demographics: detail.demographics, epidemicCurve: detail.epidemicCurve });
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setData(EMPTY_DATA);
        setError(reason instanceof Error ? reason.message : "Surveillance analytics could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessError, accessLoading, activeDiseaseCode, client, email, epiWeek, epiYear, organization, readCache, retryToken, writeCache]);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const setPeriod = useCallback((year: number, week: number) => {
    setEpiYear(year);
    setEpiWeek(week);
  }, []);
  const activeDisease = useMemo(
    () => data.morbidity.find((trend) => trend.icd10Code === activeDiseaseCode) ?? null,
    [activeDiseaseCode, data.morbidity],
  );

  return useMemo(() => ({
    activeDisease,
    activeDiseaseCode,
    data,
    empty: !loading && !error && data.morbidity.length === 0,
    epiWeek,
    epiYear,
    error,
    loading,
    retry,
    setActiveDiseaseCode,
    setPeriod,
  }), [activeDisease, activeDiseaseCode, data, epiWeek, epiYear, error, loading, retry, setPeriod]);
}
