import { BillingInvoiceDetailScreen } from "../../../../components/billing-invoice-detail";

export function generateStaticParams() {
  return [{ invoiceId: "preview" }];
}

export default async function BillingInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <BillingInvoiceDetailScreen invoiceId={invoiceId} />;
}
