#!/usr/bin/env node

/**
 * Test script for Meta Marketing Cron Job deployment
 *
 * This script tests the deployed cron job system to ensure everything is working correctly.
 *
 * Usage:
 *   node test-deployment.js [BASE_URL]
 *
 * Example:
 *   node test-deployment.js https://your-domain.vercel.app
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";

console.log("🚀 Testing Meta Marketing Cron Job Deployment");
console.log(`📍 Base URL: ${BASE_URL}`);
console.log("=" * 60);

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n📞 ${options.method || "GET"} ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw_response: text };
    }

    console.log(`✅ Status: ${response.status}`);
    console.log(`📋 Response:`, JSON.stringify(data, null, 2));

    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { status: 0, data: null, ok: false, error: error.message };
  }
}

async function runTests() {
  console.log("\n🧪 Starting deployment tests...\n");

  // Test 1: Check if basic endpoints are accessible
  console.log("📋 Test 1: Basic endpoint accessibility");
  await makeRequest("/api/test-accounts");
  await makeRequest("/api/job-status");

  // Test 2: Add test accounts
  console.log("\n📋 Test 2: Adding test accounts");
  await makeRequest("/api/test-accounts", {
    method: "POST",
    body: JSON.stringify({ force: true }),
  });

  // Test 3: Check accounts were added
  console.log("\n📋 Test 3: Verify accounts were added");
  await makeRequest("/api/test-accounts");

  // Test 4: Test cron job (this will trigger the actual worker)
  console.log("\n📋 Test 4: Testing cron job trigger");
  const cronResult = await makeRequest("/api/test-cron");

  if (cronResult.ok) {
    console.log("\n⏳ Waiting 10 seconds for jobs to process...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Test 5: Check job status after cron
    console.log("\n📋 Test 5: Checking job status after cron trigger");
    await makeRequest("/api/job-status?limit=5");

    // Test 6: Check cron logs
    console.log("\n📋 Test 6: Checking cron execution logs");
    await makeRequest("/api/job-status", {
      method: "POST",
      body: JSON.stringify({ limit: 3 }),
    });
  }

  console.log("\n🎉 Deployment tests completed!");
  console.log("\n📊 Next steps:");
  console.log(`   1. Visit ${BASE_URL}/cron-dashboard to monitor the system`);
  console.log(`   2. Check Vercel function logs for detailed execution info`);
  console.log(`   3. Monitor QStash dashboard for job delivery status`);
  console.log(`   4. Verify data is being stored in Supabase tables`);
  console.log("\n💡 The cron job will run automatically daily at midnight UTC");
  console.log("   You can also trigger it manually using the dashboard or API");
}

// Run the tests
runTests().catch((error) => {
  console.error("\n💥 Test execution failed:", error);
  process.exit(1);
});
