"use client";

import { RecordsScreen } from "../../components/records-screen";
import { companiesConfig } from "../../lib/admin-data";

export default function CompaniesPage() { return <RecordsScreen config={companiesConfig} />; }
