import { NextRequest, NextResponse } from "next/server";
import {
  createPmrShareLink,
  createBrowserSupabaseClient,
  PmrShareLinkCreateSchema,
} from "@odyssey/supabase-client";
import type { PmrSectionId } from "@odyssey/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = PmrShareLinkCreateSchema.parse(body);

    const client = createBrowserSupabaseClient();
    const shareSummary = await createPmrShareLink(client, {
      ...validated,
      sectionsIncluded: (validated.sectionsIncluded as PmrSectionId[]) || [],
    });

    return NextResponse.json({
      success: true,
      share: shareSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create share link.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
