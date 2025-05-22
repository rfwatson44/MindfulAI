import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { repairFailedCreatives } from "@/utils/meta-marketing/creative-management";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST handler to repair ads with missing or failed asset_feed_spec
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const batchSize = parseInt(searchParams.get("batchSize") || "100", 10);

    console.log(`Starting repair job for ads with batch size ${batchSize}`);

    // Run the repair job
    const results = await repairFailedCreatives(supabase, batchSize);

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} ads, updated ${results.updated}, failed ${results.failed}`,
      results,
    });
  } catch (error: any) {
    console.error("Error in repair-creatives endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler to check repair job status (placeholder for now)
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Count ads that still need repair
    const { count, error } = await supabase
      .from("meta_ads")
      .select("ad_id", { count: "exact", head: true })
      .or("asset_feed_spec.is.null,asset_feed_spec.eq.FETCH_FAILED")
      .not("creative", "is", null);

    if (error) {
      throw new Error(`Error counting ads: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
      message: `Found ${count} ads that need repair`,
    });
  } catch (error: any) {
    console.error("Error in repair-creatives GET endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
