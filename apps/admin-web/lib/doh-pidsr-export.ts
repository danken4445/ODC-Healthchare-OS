import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function encryptForDoh(payload: ArrayBuffer, publicKeyPem: string): Promise<ArrayBuffer> {
  const recipientKey = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const contentKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    contentKey,
    payload
  );
  const rawContentKey = await window.crypto.subtle.exportKey("raw", contentKey);
  const wrappedContentKey = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientKey,
    rawContentKey
  );

  const envelope = new TextEncoder().encode(
    JSON.stringify({
      algorithm: "AES-256-GCM",
      key_wrap_algorithm: "RSA-OAEP-256",
      iv: arrayBufferToBase64(iv.buffer),
      encrypted_key: arrayBufferToBase64(wrappedContentKey),
      ciphertext: arrayBufferToBase64(ciphertext),
    })
  );

  return envelope.buffer as ArrayBuffer;
}

export async function exportAndEncryptDohPidsr({
  client,
  organizationId,
  purpose,
  epiYear,
  epiWeek,
}: {
  client: SupabaseClient<Database>;
  organizationId: string;
  purpose: string;
  epiYear: number;
  epiWeek: number;
}): Promise<Blob> {
  const recipientPublicKey =
    process.env.NEXT_PUBLIC_DOH_PIDSR_RECIPIENT_PUBLIC_KEY ||
    process.env.DOH_PIDSR_RECIPIENT_PUBLIC_KEY;

  if (!recipientPublicKey) {
    throw new Error("The encrypted DOH export service is not configured (missing recipient public key).");
  }

  const { data, error: exportError } = await client.rpc("export_doh_pidsr_cases" as never, {
    p_organization_id: organizationId,
    p_purpose: purpose.trim(),
    p_epi_year: epiYear,
    p_epi_week: epiWeek,
  } as never);

  if (exportError) {
    const errorMsg =
      (exportError as { code?: string }).code === "42501"
        ? "You are not authorized to release DOH epidemiology records."
        : (exportError as { message?: string }).message || "DOH export could not be created.";
    throw new Error(errorMsg);
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await encryptForDoh(plaintext.buffer as ArrayBuffer, recipientPublicKey);
  return new Blob([encrypted], { type: "application/octet-stream" });
}
