import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";
import { Client } from "@upstash/qstash";

export const dynamic = "force-dynamic";

// Initialize QStash client
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// Rate limiting configuration
const RATE_LIMIT = {
  DELAY_BETWEEN_ACCOUNTS: 10000, // 10 seconds between account processing (increased for worker jobs)
  MAX_CONCURRENT_ACCOUNTS: 3, // Process max 3 accounts at a time (reduced for worker jobs)
  MAX_RETRIES: 2, // Maximum number of retries per account (reduced since worker has its own retry logic)
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to validate cron secret
const validateCronSecret = (request: Request) => {
  const headersList = headers();
  const cronSecret = headersList.get("x-cron-secret");

  // Check URL for secret parameter
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  // Valid if either header or query param matches
  return (
    cronSecret === process.env.CRON_SECRET ||
    querySecret === process.env.CRON_SECRET
  );
};

// Process accounts in batches using the new Meta Marketing Worker
async function processBatch(accounts: any[], supabase: any) {
  const results = [];

  for (const account of accounts) {
    let retries = 0;
    while (retries < RATE_LIMIT.MAX_RETRIES) {
      try {
        // Format account ID with act_ prefix for Meta API
        const formattedAccountId = `act_${account.account_id}`;

        console.log(
          `🚀 Starting Meta Marketing Worker for account: ${formattedAccountId} (${account.account_name})`
        );

        // Create job payload for the Meta Marketing Worker
        const jobPayload = {
          accountId: formattedAccountId,
          timeframe: "24h", // Always use 24h for daily cron
          action: "get24HourData",
          requestId: `cron-${Date.now()}-${account.account_id}`,
          phase: "account", // Start with account phase
          userId: "system", // Mark as system job
        };

        // Get the webhook URL for the worker
        const baseUrl =
          process.env.WEBHOOK_BASE_URL ||
          (process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.NEXTAUTH_URL || "http://localhost:3000");

        const webhookUrl = `${baseUrl}/api/meta-marketing-worker`;

        console.log(
          `📤 Sending job to QStash for account: ${formattedAccountId}`
        );
        console.log(`📍 Webhook URL: ${webhookUrl}`);
        console.log(`📋 Job payload:`, jobPayload);

        // Send job to QStash (which will call our Meta Marketing Worker)
        const response = await qstashClient.publishJSON({
          url: webhookUrl,
          body: jobPayload,
          retries: 3,
          delay: 5, // 5 seconds delay before starting
          headers: {
            "Content-Type": "application/json",
            "X-Job-Type": "meta-marketing-sync-cron",
            "X-Request-ID": jobPayload.requestId,
            "X-Account-ID": formattedAccountId,
            "X-Timeframe": "24h",
          },
        });

        console.log(
          `✅ Job queued successfully for account ${formattedAccountId}: ${response.messageId}`
        );

        results.push({
          account_id: account.account_id,
          formatted_account_id: formattedAccountId,
          account_name: account.account_name,
          status: "queued",
          message_id: response.messageId,
          request_id: jobPayload.requestId,
          retries: retries,
          timestamp: new Date().toISOString(),
        });

        // Success, break the retry loop
        break;
      } catch (error) {
        console.error(
          `❌ Error queuing job for account ${account.account_id} (attempt ${
            retries + 1
          }/${RATE_LIMIT.MAX_RETRIES}):`,
          error
        );

        retries++;

        if (retries === RATE_LIMIT.MAX_RETRIES) {
          // All retries failed, add to results with error
          results.push({
            account_id: account.account_id,
            formatted_account_id: `act_${account.account_id}`,
            account_name: account.account_name,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
            retries: retries,
            timestamp: new Date().toISOString(),
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

export async function GET(request: Request) {
  const startTime = Date.now();

  try {
    // Validate cron secret
    if (!validateCronSecret(request)) {
      console.error("❌ Unauthorized cron request - invalid secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🕐 Daily Meta Marketing Cron Job Started");
    console.log(`📅 Execution time: ${new Date().toISOString()}`);

    const supabase = await createClient();

    // Get all accounts from the accounts table (not meta_account_insights)
    console.log("📊 Fetching accounts from accounts table...");
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("account_id, account_name");

    if (accountsError) {
      console.error("❌ Failed to fetch accounts:", accountsError);
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      console.log("⚠️ No accounts found in accounts table");
      return NextResponse.json({
        message: "No accounts to process",
        accounts_found: 0,
        execution_time: `${Date.now() - startTime}ms`,
      });
    }

    console.log(`✅ Found ${accounts.length} accounts to process:`);
    accounts.forEach((account, index) => {
      console.log(
        `  ${index + 1}. ${account.account_name} (ID: ${
          account.account_id
        } -> act_${account.account_id})`
      );
    });

    // Process accounts in batches
    const batches = [];
    for (
      let i = 0;
      i < accounts.length;
      i += RATE_LIMIT.MAX_CONCURRENT_ACCOUNTS
    ) {
      batches.push(accounts.slice(i, i + RATE_LIMIT.MAX_CONCURRENT_ACCOUNTS));
    }

    console.log(
      `📦 Processing ${accounts.length} accounts in ${batches.length} batches`
    );

    const results = [];
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `\n🔄 Processing batch ${batchIndex + 1}/${batches.length} (${
          batch.length
        } accounts)`
      );

      const batchResults = await processBatch(batch, supabase);
      results.push(...batchResults);

      // Add delay between batches
      if (batchIndex < batches.length - 1) {
        const delayTime = RATE_LIMIT.DELAY_BETWEEN_ACCOUNTS * 2;
        console.log(`⏳ Waiting ${delayTime}ms before next batch...`);
        await delay(delayTime);
      }
    }

    const executionTime = Date.now() - startTime;
    const successfulAccounts = results.filter(
      (r) => r.status === "queued"
    ).length;
    const failedAccounts = results.filter((r) => r.status === "error").length;

    console.log(`\n📊 Cron Job Summary:`);
    console.log(`  ✅ Total accounts processed: ${results.length}`);
    console.log(`  🚀 Successfully queued: ${successfulAccounts}`);
    console.log(`  ❌ Failed to queue: ${failedAccounts}`);
    console.log(`  ⏱️ Total execution time: ${executionTime}ms`);

    // Log the execution to meta_cron_logs
    try {
      await supabase.from("meta_cron_logs").insert([
        {
          execution_time: new Date().toISOString(),
          accounts_processed: results.length,
          successful_accounts: successfulAccounts,
          failed_accounts: failedAccounts,
          results: {
            summary: {
              total_accounts: accounts.length,
              batches_processed: batches.length,
              execution_time_ms: executionTime,
              timeframe: "24h",
              worker_type: "meta-marketing-worker",
            },
            accounts: results,
          },
        },
      ]);
      console.log("📝 Execution logged to meta_cron_logs");
    } catch (logError) {
      console.error("⚠️ Failed to log execution:", logError);
    }

    return NextResponse.json({
      success: true,
      message: "Daily Meta Marketing sync jobs queued successfully",
      summary: {
        total_accounts: accounts.length,
        successful_accounts: successfulAccounts,
        failed_accounts: failedAccounts,
        execution_time_ms: executionTime,
        batches_processed: batches.length,
        timeframe: "24h",
        worker_type: "meta-marketing-worker",
      },
      results: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error("💥 Cron job failed:", error);
    console.error("📊 Execution time before failure:", `${executionTime}ms`);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        execution_time_ms: executionTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
