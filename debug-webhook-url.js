#!/usr/bin/env node

// Debug script to test webhook URL generation
// Run with: node debug-webhook-url.js

console.log("=== Webhook URL Debug Script ===");
console.log();

// Check environment variables
console.log("Environment Variables:");
console.log("WEBHOOK_BASE_URL:", process.env.WEBHOOK_BASE_URL || "Not set");
console.log(
  "VERCEL_PROJECT_PRODUCTION_URL:",
  process.env.VERCEL_PROJECT_PRODUCTION_URL || "Not set"
);
console.log("VERCEL_URL:", process.env.VERCEL_URL || "Not set");
console.log("NEXTAUTH_URL:", process.env.NEXTAUTH_URL || "Not set");
console.log();

// Simulate the webhook URL generation logic
function generateWebhookUrl() {
  const baseUrl =
    process.env.WEBHOOK_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NEXTAUTH_URL || "http://localhost:3000");

  return `${baseUrl}/api/meta-marketing-worker`;
}

const webhookUrl = generateWebhookUrl();
console.log("Generated Webhook URL:", webhookUrl);
console.log();

// Check if the URL looks correct
if (webhookUrl.includes("vercel.app") && !webhookUrl.includes("git-")) {
  console.log("✅ URL looks like a production Vercel URL");
} else if (webhookUrl.includes("git-")) {
  console.log(
    "⚠️  WARNING: URL contains 'git-' which indicates a preview deployment"
  );
  console.log("   This will cause webhook failures!");
  console.log("   Solution: Set WEBHOOK_BASE_URL to your production domain");
} else if (webhookUrl.includes("localhost")) {
  console.log("ℹ️  URL is localhost (development mode)");
} else {
  console.log("✅ URL appears to be a custom domain");
}

console.log();
console.log("=== Recommendations ===");
console.log("1. Set WEBHOOK_BASE_URL to your production domain:");
console.log("   WEBHOOK_BASE_URL=https://your-production-domain.com");
console.log();
console.log("2. Or ensure VERCEL_PROJECT_PRODUCTION_URL is set correctly");
console.log("   (This should be automatic in Vercel production deployments)");
console.log();
console.log("3. Check your Vercel environment variables in the dashboard:");
console.log("   Project Settings > Environment Variables");
