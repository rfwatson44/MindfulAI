import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Rate limiting configuration
const RATE_LIMIT = {
  DELAY_BETWEEN_ACCOUNTS: 5000, // 5 seconds between account processing
  MAX_CONCURRENT_ACCOUNTS: 5, // Process max 5 accounts at a time
  MAX_RETRIES: 3, // Maximum number of retries per account
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to validate cron secret
const validateCronSecret = () => {
  const headersList = headers();
  const cronSecret = headersList.get("x-cron-secret");
  return cronSecret === process.env.CRON_SECRET;
};

// Process accounts in batches to prevent rate limiting
async function processBatch(accounts: any[], supabase: any) {
  const results = [];

  for (const account of accounts) {
    let retries = 0;
    while (retries < RATE_LIMIT.MAX_RETRIES) {
      try {
        // Make request to our daily data endpoint
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL}/api/meta-marketing-daily?action=get24HourData&accountId=${account.account_id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": process.env.CRON_SECRET || "", // Pass through the cron secret
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to process account ${account.account_id}: ${response.statusText}. Details: ${errorText}`
          );
        }

        const result = await response.json();
        results.push({
          account_id: account.account_id,
          status: "success",
          data: result,
          retries: retries,
        });

        // Success, break the retry loop
        break;
      } catch (error) {
        console.error(
          `Error processing account ${account.account_id} (attempt ${
            retries + 1
          }/${RATE_LIMIT.MAX_RETRIES}):`,
          error
        );

        retries++;

        if (retries === RATE_LIMIT.MAX_RETRIES) {
          // All retries failed, add to results with error
          results.push({
            account_id: account.account_id,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
            retries: retries,
          });
        } else {
          // Wait longer between retries
          await delay(RATE_LIMIT.DELAY_BETWEEN_ACCOUNTS * (retries + 1));
          continue;
        }
      }

      // Add delay between account processing
      await delay(RATE_LIMIT.DELAY_BETWEEN_ACCOUNTS);
    }
  }

  return results;
}

export async function GET() {
  try {
    // Validate cron secret
    if (!validateCronSecret()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Get all active accounts
    const { data: accounts, error: accountsError } = await supabase
      .from("meta_account_insights")
      .select("account_id")
      .eq("status", "active");

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No accounts to process" });
    }

    // Process accounts in batches
    const batches = [];
    for (
      let i = 0;
      i < accounts.length;
      i += RATE_LIMIT.MAX_CONCURRENT_ACCOUNTS
    ) {
      batches.push(accounts.slice(i, i + RATE_LIMIT.MAX_CONCURRENT_ACCOUNTS));
    }

    const results = [];
    for (const batch of batches) {
      const batchResults = await processBatch(batch, supabase);
      results.push(...batchResults);

      // Add delay between batches
      if (batches.indexOf(batch) < batches.length - 1) {
        await delay(RATE_LIMIT.DELAY_BETWEEN_ACCOUNTS * 2); // Double delay between batches
      }
    }

    // Log the execution
    await supabase.from("meta_cron_logs").insert([
      {
        execution_time: new Date(),
        accounts_processed: results.length,
        successful_accounts: results.filter((r) => r.status === "success")
          .length,
        failed_accounts: results.filter((r) => r.status === "error").length,
        results: results,
      },
    ]);

    return NextResponse.json({
      message: "Daily update completed",
      total_accounts: accounts.length,
      results: results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
