"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { failure, fromDb, success, type ActionState } from "@/lib/action-state";
import { removeUserFile, resolveUpload } from "@/lib/files";
import { receiptFileError } from "@/components/finance/logic";

// The family sends the payment receipt of one of its charges; the RPC checks the family link.
export async function sendChargeReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["guardian"]);
  const parsed = z.object({ id: z.string().guid() }).safeParse({ id: formData.get("id") });
  if (!parsed.success) return failure("Cobrança inválida.");

  const upload = await resolveUpload(user.id, formData);
  if (!upload.ok) return failure(upload.message, { file: [upload.message] });
  const invalid = receiptFileError({ type: upload.mimeType, size: upload.size });
  if (invalid) {
    await removeUserFile(upload.path);
    return failure("Verifique os campos destacados.", { file: [invalid] });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("attach_charge_receipt", { target_charge: parsed.data.id, path: upload.path });
  if (error) {
    await removeUserFile(upload.path);
    return fromDb(error);
  }
  revalidatePath("/portal/finance");
  revalidatePath("/finance");
  return success("Comprovante enviado. A clínica foi avisada.");
}
