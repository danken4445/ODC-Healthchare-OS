"use client";

import { RecordsScreen } from "../../components/records-screen";
import { posConfig } from "../../lib/admin-data";

export default function PosPage() { return <RecordsScreen config={posConfig} />; }
