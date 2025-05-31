import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { startMetaMarketingBackgroundJob } from "@/app/actions/meta-marketing-queue";
import crypto from "crypto";

// Meta webhook verification
function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  return signature === `sha256=${expectedSignature}`;
}

// Check if account is authorized for webhook processing
async function isAccountAuthorized(
  accountId: string,
  supabase: any
): Promise<boolean> {
  try {
    // Check if this account exists in our accounts table
    const { data: accountData, error } = await supabase
      .from("accounts") // Using your existing accounts table
      .select("account_id, account_name")
      .eq("account_id", accountId)
      .single();

    if (error || !accountData) {
      console.warn(`❌ Account ${accountId} not found or not authorized`);
      return false;
    }

    console.log(
      `✅ Account ${accountId} (${accountData.account_name}) is authorized`
    );
    return true;
  } catch (error) {
    console.error(`Error checking account authorization:`, error);
    return false;
  }
}

// Get account name for logging (since you don't have user_id in accounts table)
async function getAccountInfo(
  accountId: string,
  supabase: any
): Promise<string | null> {
  try {
    const { data: accountData, error } = await supabase
      .from("accounts")
      .select("account_name")
      .eq("account_id", accountId)
      .single();

    if (error || !accountData) {
      return null;
    }

    return accountData.account_name;
  } catch (error) {
    console.error(`Error getting account info:`, error);
    return null;
  }
}

// Handle webhook verification (GET request)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const challenge = searchParams.get("hub.challenge");
  const verifyToken = searchParams.get("hub.verify_token");

  // Webhook verification
  if (
    mode === "subscribe" &&
    verifyToken === process.env.WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("✅ Webhook verified successfully");
    return new Response(challenge);
  }

  return new Response("Forbidden", { status: 403 });
}

// Handle webhook notifications (POST request)
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify webhook signature
    if (
      !signature ||
      !verifyWebhookSignature(body, signature, process.env.META_APP_SECRET!)
    ) {
      console.error("❌ Invalid webhook signature");
      return new Response("Unauthorized", { status: 401 });
    }

    const data = JSON.parse(body);
    console.log("📨 Webhook received:", JSON.stringify(data, null, 2));

    // Process each entry in the webhook
    for (const entry of data.entry || []) {
      const accountId = entry.id;

      // 🔐 SECURITY CHECK: Verify account is authorized
      const isAuthorized = await isAccountAuthorized(accountId, supabase);
      if (!isAuthorized) {
        console.warn(`🚫 Skipping unauthorized account: ${accountId}`);
        continue; // Skip this account
      }

      // Get the account info for logging
      const accountName = await getAccountInfo(accountId, supabase);
      if (!accountName) {
        console.warn(`🚫 No account info found for: ${accountId}`);
        continue;
      }

      console.log(
        `✅ Processing webhook for authorized account: ${accountId} (${accountName})`
      );

      // Process changes for this authorized account
      for (const change of entry.changes || []) {
        await processWebhookChange(
          accountId,
          accountName,
          change,
          data.object,
          supabase
        );
      }
    }

    return NextResponse.json({ status: "success" });
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

// Process individual webhook changes with account context
async function processWebhookChange(
  accountId: string,
  accountName: string,
  change: any,
  objectType: string,
  supabase: any
) {
  console.log(
    `🔄 Processing ${objectType} change for account ${accountId} (${accountName}):`,
    change
  );

  try {
    switch (objectType) {
      case "ad_campaign":
        await handleCampaignChanges(
          accountId,
          accountName,
          change.value,
          supabase
        );
        break;
      case "ad_adset":
        await handleAdsetChanges(
          accountId,
          accountName,
          change.value,
          supabase
        );
        break;
      case "ad_ad":
        await handleAdChanges(accountId, accountName, change.value, supabase);
        break;
      case "ad_creative":
        await handleCreativeChanges(
          accountId,
          accountName,
          change.value,
          supabase
        );
        break;
      default:
        console.log(`ℹ️ Unhandled object type: ${objectType}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${objectType} change:`, error);
  }
}

// Updated handlers with account context
async function handleCampaignChanges(
  accountId: string,
  accountName: string,
  value: any,
  supabase: any
) {
  console.log(`📊 Campaign change detected for account ${accountName}:`, value);

  if (value.campaign_id) {
    await triggerIncrementalSync(accountId, accountName, {
      type: "campaigns",
      campaignIds: [value.campaign_id],
      reason: "webhook_campaign_update",
    });
  }
}

async function handleAdsetChanges(
  accountId: string,
  accountName: string,
  value: any,
  supabase: any
) {
  console.log(`🎯 AdSet change detected for account ${accountName}:`, value);

  if (value.adset_id) {
    await triggerIncrementalSync(accountId, accountName, {
      type: "adsets",
      adsetIds: [value.adset_id],
      reason: "webhook_adset_update",
    });
  }
}

async function handleAdChanges(
  accountId: string,
  accountName: string,
  value: any,
  supabase: any
) {
  console.log(`📱 Ad change detected for account ${accountName}:`, value);

  if (value.ad_id) {
    await triggerIncrementalSync(accountId, accountName, {
      type: "ads",
      adIds: [value.ad_id],
      reason: "webhook_ad_update",
    });
  }
}

async function handleCreativeChanges(
  accountId: string,
  accountName: string,
  value: any,
  supabase: any
) {
  console.log(`🎨 Creative change detected for account ${accountName}:`, value);

  // Find affected ads and sync them
  if (value.creative_id) {
    const { data: affectedAds } = await supabase
      .from("meta_ads")
      .select("ad_id")
      .eq("creative_id", value.creative_id)
      .eq("account_id", accountId); // Ensure we only get ads for this account

    if (affectedAds && affectedAds.length > 0) {
      const adIds = affectedAds.map((ad: { ad_id: string }) => ad.ad_id);
      await triggerIncrementalSync(accountId, accountName, {
        type: "ads",
        adIds,
        reason: "creative_update",
      });
    }
  }
}

// Updated trigger function with account context
async function triggerIncrementalSync(
  accountId: string,
  accountName: string,
  syncConfig: any
) {
  try {
    console.log(
      `🚀 Triggering incremental sync for account ${accountName} (${accountId}):`,
      syncConfig
    );

    // Create a basic payload that matches MetaMarketingJobPayload interface
    const payload = {
      accountId,
      timeframe: "24h",
      action: "incrementalSync",
      requestId: `webhook-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      // Store sync configuration in a way the worker can understand
      // We'll pass it as part of the action or handle it differently
    };

    await startMetaMarketingBackgroundJob(payload);

    console.log(`✅ Incremental sync job queued for account ${accountName}`);
  } catch (error) {
    console.error(
      `❌ Failed to trigger incremental sync for account ${accountName}:`,
      error
    );
  }
}
