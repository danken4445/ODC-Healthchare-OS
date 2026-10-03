import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
} as const;

type ExportRequest = { organizationId: string; purpose: string; epiYear: number; epiWeek: number };

function isExportRequest(value: unknown): value is ExportRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.organizationId === "string"
    && typeof body.purpose === "string"
    && Number.isInteger(body.epiYear)
    && Number.isInteger(body.epiWeek);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = Buffer.from(body, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

async function encryptForDoh(payload: ArrayBuffer, publicKeyPem: string): Promise<ArrayBuffer> {
  const recipientKey = await crypto.subtle.importKey("spki", pemToArrayBuffer(publicKeyPem), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, contentKey, payload);
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);
  const wrappedContentKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientKey, rawContentKey);
  const envelope = new TextEncoder().encode(JSON.stringify({
    algorithm: "AES-256-GCM",
    key_wrap_algorithm: "RSA-OAEP-256",
    iv: Buffer.from(iv).toString("base64"),
    encrypted_key: Buffer.from(wrappedContentKey).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  }));
  return envelope.buffer as ArrayBuffer;
}

function error(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return error("Authentication is required.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return error("Invalid export request.", 400); }
  if (!isExportRequest(body) || body.purpose.trim().length < 10 || body.purpose.length > 1000 || body.epiWeek < 1 || body.epiWeek > 53) {
    return error("A valid organization, period, and statutory reporting purpose are required.", 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const recipientPublicKey = process.env.DOH_PIDSR_RECIPIENT_PUBLIC_KEY;
  if (!url || !anonKey || !recipientPublicKey) return error("The encrypted DOH export service is not configured.", 503);

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return error("Authentication is required.", 401);

  const { data, error: exportError } = await client.rpc("export_doh_pidsr_cases" as never, {
    p_organization_id: body.organizationId,
    p_purpose: body.purpose.trim(),
    p_epi_year: body.epiYear,
    p_epi_week: body.epiWeek,
  } as never);
  if (exportError) {
    const status = exportError.code === "42501" ? 403 : exportError.code === "22023" ? 400 : 500;
    return error(status === 403 ? "You are not authorized to release DOH epidemiology records." : "DOH export could not be created.", status);
  }

  try {
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await encryptForDoh(plaintext.buffer as ArrayBuffer, recipientPublicKey);
    return new NextResponse(encrypted, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="doh-pidsr-${body.epiYear}-w${String(body.epiWeek).padStart(2, "0")}.enc"`,
      },
    });
  } catch {
    return error("DOH export encryption failed; no file was released.", 500);
  }
}
