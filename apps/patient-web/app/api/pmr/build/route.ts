import { NextRequest, NextResponse } from "next/server";
import {
  buildPmrDocument,
  persistPmrSnapshot,
  createBrowserSupabaseClient,
  PmrBuildOptionsSchema,
} from "@odyssey/supabase-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId, options } = body;

    if (!patientId || typeof patientId !== "string") {
      return NextResponse.json(
        { error: "A valid patientId is required." },
        { status: 400 }
      );
    }

    const validatedOptions = options ? PmrBuildOptionsSchema.parse(options) : {};

    const client = createBrowserSupabaseClient();
    const { data: authUser } = await client.auth.getUser();

    const requester = authUser?.user
      ? {
          userId: authUser.user.id,
          role: "patient" as const,
          name: authUser.user.email?.split("@")[0] || "Authorized Patient",
          organizationId: "",
        }
      : undefined;

    const document = await buildPmrDocument(
      client,
      patientId,
      validatedOptions,
      requester,
      req.nextUrl.origin
    );

    const snapshot = await persistPmrSnapshot(client, document, {
      organizationId: document.controlBlock.organizationId || document.facilityHeader.organizationId || "",
      patientId,
      userId: authUser?.user?.id,
      purpose: document.controlBlock.purposeOfRelease,
    }).catch(() => ({ snapshotId: "snapshot-pending", documentId: document.controlBlock.documentId }));

    return NextResponse.json({
      success: true,
      document,
      snapshotId: snapshot.snapshotId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build PMR document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
