import { ClinicDetailScreen } from "../../../../components/superadmin/clinic-detail-screen";

export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default async function ClinicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClinicDetailScreen clinicId={id} />;
}
