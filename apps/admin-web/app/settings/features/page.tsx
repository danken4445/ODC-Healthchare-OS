"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { featureFlagsConfig } from "../../../lib/admin-data";

export default function FeaturesPage() { return <RecordsScreen config={featureFlagsConfig} />; }
