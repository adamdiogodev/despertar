import { formatCents } from "@/lib/format";
import { approveInvoice, attachPayoutReceipt, payInvoice, rejectInvoice } from "@/app/(app)/finance/invoices/actions";
import { ActionButton } from "./action-button";
import { RejectInvoiceModal } from "./invoice-admin-forms";
import { ReceiptModal } from "./receipt-modal";
import type { InvoiceStatus } from "./logic";

type Request = { id: string; status: InvoiceStatus; amount_cents: number; payment_receipt_path: string | null };

// Manager workflow for one invoice request: check the NF, pay (with receipt) or attach the receipt later.
// Nobody acts on their own NF (the database enforces it too).
export function InvoiceRequestActions({ request, canManage }: { request: Request; canManage: boolean }) {
  if (!canManage) return null;
  if (request.status === "submitted") {
    return (
      <div className="flex flex-wrap gap-2">
        <ActionButton action={approveInvoice} fields={{ id: request.id }} label="Aprovar" variant="success" testId="approve-invoice" />
        <RejectInvoiceModal action={rejectInvoice} requestId={request.id} />
      </div>
    );
  }
  if (request.status === "approved") {
    return (
      <ReceiptModal
        action={payInvoice}
        fields={{ id: request.id }}
        trigger="Pagar"
        triggerVariant="primary"
        title="Registrar repasse"
        submitLabel={`Confirmar pagamento de ${formatCents(request.amount_cents)}`}
        description={
          <>
            Confirme o repasse de <strong className="text-t1">{formatCents(request.amount_cents)}</strong>. Anexe o comprovante da transferência agora
            ou depois.
          </>
        }
        fileRequired={false}
        testId="pay-invoice"
      />
    );
  }
  if (request.status === "paid" && !request.payment_receipt_path) {
    return (
      <ReceiptModal
        action={attachPayoutReceipt}
        fields={{ id: request.id }}
        trigger="Anexar comprovante"
        title="Comprovante do repasse"
        submitLabel="Anexar"
        testId="attach-payout-receipt"
      />
    );
  }
  return null;
}

export function FileLink({ path, label }: { path: string | null; label: string }) {
  if (!path) return null;
  return (
    <a href={`/files?path=${encodeURIComponent(path)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
      {label}
    </a>
  );
}
