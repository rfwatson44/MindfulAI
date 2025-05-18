import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/**
 * This is a simple test route that directly calls our simplified endpoints
 * instead of redirecting to them, which can cause issues
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const accountId = searchParams.get("accountId");

    // New option to check database tables
    if (type === "check-db") {
      console.log("Checking database tables...");
      const supabase = await createClient();

      // Check which tables exist
      const tableResults: Record<
        string,
        { exists: boolean; error: string | null; rowCount?: number }
      > = {};
      const tablesToCheck = [
        "meta_campaigns",
        "meta_campaigns_duplicate",
        "meta_campaigns_daily_duplicate",
        "meta_ad_sets",
        "meta_ad_sets_duplicate",
        "meta_ads",
        "meta_ads_duplicate",
        "meta_api_metrics",
        "meta_api_metrics_duplicate",
        "meta_account_insights",
        "meta_account_insights_duplicate",
      ];

      for (const table of tablesToCheck) {
        try {
          // Try to query a single row to check if table exists
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .limit(1);

          tableResults[table] = {
            exists: !error,
            error: error ? error.message : null,
            rowCount: data?.length || 0,
          };
        } catch (err) {
          tableResults[table] = {
            exists: false,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }

      return NextResponse.json({
        message: "Database tables check",
        results: tableResults,
      });
    }

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    if (!type || !["daily", "regular"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'daily' or 'regular'" },
        { status: 400 }
      );
    }

    console.log(
      `Test route processing ${type} request for account ${accountId}`
    );

    // Directly import and call the appropriate module based on type
    if (type === "daily") {
      // Import the daily module
      const { GET: dailyGet } = await import(
        "../meta-marketing-daily/simplified-campaigns"
      );
      // Create a new request with the accountId
      const dailyRequest = new Request(
        `${
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
        }/api/meta-marketing-daily/simplified-campaigns?accountId=${accountId}`
      );
      // Call the GET handler directly
      return dailyGet(dailyRequest);
    } else {
      // Import the regular module
      const { GET: regularGet } = await import(
        "../meta-marketing/simplified-campaigns"
      );
      // Create a new request with the accountId
      const regularRequest = new Request(
        `${
          process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
        }/api/meta-marketing/simplified-campaigns?accountId=${accountId}`
      );
      // Call the GET handler directly
      return regularGet(regularRequest);
    }
  } catch (error) {
    console.error("Error in test route:", error);
    return NextResponse.json(
      {
        error: "Error processing request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
