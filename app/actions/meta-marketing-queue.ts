"use server";

import { Client } from "@upstash/qstash";

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export interface MetaMarketingJobPayload {
  accountId: string;
  timeframe: string;
  action: string;
  userId?: string;
  requestId: string;
}

export async function startMetaMarketingBackgroundJob(
  payload: MetaMarketingJobPayload
) {
  try {
    // Get the base URL for the webhook endpoint
    // Priority: WEBHOOK_BASE_URL > VERCEL_PROJECT_PRODUCTION_URL > NEXTAUTH_URL > localhost
    const baseUrl =
      process.env.WEBHOOK_BASE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000");

    const webhookUrl = `${baseUrl}/api/meta-marketing-worker`;

    console.log("Starting background job with payload:", payload);
    console.log("Webhook URL:", webhookUrl);
    console.log("Environment variables check:", {
      WEBHOOK_BASE_URL: process.env.WEBHOOK_BASE_URL ? "Set" : "Not set",
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? "Set"
        : "Not set",
      VERCEL_URL: process.env.VERCEL_URL ? "Set" : "Not set",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ? "Set" : "Not set",
    });

    const response = await qstashClient.publishJSON({
      url: webhookUrl,
      body: payload,
      // Add retry configuration for reliability
      retries: 3,
      // Add delay to prevent immediate execution conflicts
      delay: 5, // 5 seconds delay
      // Add headers for identification
      headers: {
        "Content-Type": "application/json",
        "X-Job-Type": "meta-marketing-sync",
        "X-Request-ID": payload.requestId,
      },
    });

    console.log("QStash job queued successfully:", response.messageId);

    return {
      success: true,
      messageId: response.messageId,
      requestId: payload.requestId,
    };
  } catch (error) {
    console.error("Error starting background job:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      requestId: payload.requestId,
    };
  }
}

export async function getJobStatus(messageId: string) {
  try {
    // QStash doesn't provide direct job status checking in the free tier
    // You would need to implement your own status tracking in Supabase
    // For now, we'll return a basic response
    return {
      success: true,
      messageId,
      status: "queued", // This would be tracked in your database
    };
  } catch (error) {
    console.error("Error getting job status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
