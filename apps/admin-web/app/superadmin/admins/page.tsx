"use client";

import { RecordsScreen } from "../../../components/records-screen";
import { adminsConfig } from "../../../lib/admin-data";

export default function AdminDirectoryPage() { return <RecordsScreen config={adminsConfig} />; }
