import { NextRequest, NextResponse } from "next/server";
import {
  verifyPmrDocument,
  createBrowserSupabaseClient,
} from "@odyssey/supabase-client";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await context.params;
    if (!docId) {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    const client = createBrowserSupabaseClient();
    const result = await verifyPmrDocument(client, docId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification error.";
    return NextResponse.json(
      {
        valid: false,
        status: "NOT_FOUND",
        message,
      },
      { status: 500 }
    );
  }
}
