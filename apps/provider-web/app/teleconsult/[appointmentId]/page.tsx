import { ProviderTeleconsultRoomScreen } from "../../components/ProviderTeleconsultRoomScreen";

export function generateStaticParams() {
  return [{ appointmentId: "preview" }];
}

export default async function ProviderTeleconsultRoomPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return <ProviderTeleconsultRoomScreen appointmentId={appointmentId} />;
}
