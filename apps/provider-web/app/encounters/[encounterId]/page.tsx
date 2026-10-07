import { EncounterRecordingScreen } from "../../components/EncounterRecordingScreen";

export function generateStaticParams() {
  return [{ encounterId: "preview" }];
}

export default async function EncounterRecordingPage({
  params,
}: {
  params: Promise<{ encounterId: string }>;
}) {
  await params;
  return <EncounterRecordingScreen />;
}
