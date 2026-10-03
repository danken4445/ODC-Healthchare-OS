import type { Metadata } from "next";
import { DiseaseTrendDashboard } from "../../../components/disease-trends/DiseaseTrendDashboard";

export const metadata: Metadata = { title: "Disease trend analytics" };

export default function DiseaseTrendsPage() {
  return <DiseaseTrendDashboard />;
}
