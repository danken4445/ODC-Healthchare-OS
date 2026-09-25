"use client";

import { RecordsScreen } from "../../components/records-screen";
import { billingConfig } from "../../lib/admin-data";

export default function BillingPage() { return <RecordsScreen config={billingConfig} />; }
