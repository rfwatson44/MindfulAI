#!/usr/bin/env node

// Test script for chunked processing
// Run with: node test-chunked-processing.js

const https = require("https");
const http = require("http");

// Configuration
const BASE_URL = process.env.WEBHOOK_BASE_URL || "http://localhost:3000";
const TEST_ACCOUNT_ID = "act_604977370158225"; // Your account ID
const REQUEST_ID = `test-${Date.now()}`;

console.log("=== Chunked Processing Test Script ===");
console.log(`Base URL: ${BASE_URL}`);
console.log(`Test Account ID: ${TEST_ACCOUNT_ID}`);
console.log(`Request ID: ${REQUEST_ID}`);
console.log();

// Test different phases
const testPhases = [
  {
    phase: "account",
    description: "Test account phase processing",
  },
  {
    phase: "campaigns",
    description: "Test campaigns phase processing",
    offset: 0,
  },
  {
    phase: "adsets",
    description: "Test adsets phase processing",
    campaignIds: ["test-campaign-1", "test-campaign-2"],
    offset: 0,
  },
  {
    phase: "ads",
    description: "Test ads phase processing",
    adsetIds: ["test-adset-1", "test-adset-2"],
    offset: 0,
  },
];

async function testPhase(phaseConfig) {
  return new Promise((resolve, reject) => {
    const payload = {
      accountId: TEST_ACCOUNT_ID,
      timeframe: "24h",
      action: "get24HourData",
      requestId: `${REQUEST_ID}-${phaseConfig.phase}`,
      phase: phaseConfig.phase,
      ...phaseConfig,
    };

    const postData = JSON.stringify(payload);
    const url = new URL(`${BASE_URL}/api/meta-marketing-worker`);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "ChunkedProcessingTest/1.0",
      },
    };

    console.log(`Testing ${phaseConfig.phase} phase...`);
    console.log(`Payload:`, payload);

    const client = url.protocol === "https:" ? https : http;

    const req = client.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(`Response Status: ${res.statusCode}`);
        console.log(`Response Headers:`, res.headers);

        try {
          const response = JSON.parse(data);
          console.log(`Response Body:`, response);

          if (res.statusCode === 401 || res.statusCode === 403) {
            console.log(
              "✅ Expected: Signature verification failed (normal for manual testing)"
            );
            resolve({
              phase: phaseConfig.phase,
              status: "signature_verification_expected",
            });
          } else if (res.statusCode === 200) {
            console.log(
              "✅ Unexpected: Request succeeded (webhook signature not enforced?)"
            );
            resolve({
              phase: phaseConfig.phase,
              status: "success",
              data: response,
            });
          } else {
            console.log(`❌ Unexpected status code: ${res.statusCode}`);
            resolve({
              phase: phaseConfig.phase,
              status: "error",
              statusCode: res.statusCode,
              data: response,
            });
          }
        } catch (error) {
          console.log("❌ Failed to parse response as JSON");
          console.log("Raw response:", data);
          resolve({
            phase: phaseConfig.phase,
            status: "parse_error",
            raw: data,
          });
        }

        console.log("---");
      });
    });

    req.on("error", (error) => {
      console.log(`❌ Request failed: ${error.message}`);
      resolve({
        phase: phaseConfig.phase,
        status: "request_error",
        error: error.message,
      });
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("Starting chunked processing tests...\n");

  const results = [];

  for (const phaseConfig of testPhases) {
    console.log(`=== ${phaseConfig.description} ===`);
    const result = await testPhase(phaseConfig);
    results.push(result);

    // Wait between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n=== Test Results Summary ===");
  results.forEach((result) => {
    console.log(`${result.phase}: ${result.status}`);
  });

  console.log("\n=== Recommendations ===");
  console.log(
    '1. If all tests show "signature_verification_expected", your endpoint is working correctly'
  );
  console.log(
    "2. Check your Vercel function logs to see if the requests are reaching the handler"
  );
  console.log("3. For production testing, use the actual QStash webhook calls");
  console.log(
    "4. Monitor the background_jobs table in Supabase for actual job progress"
  );

  console.log("\n=== Next Steps ===");
  console.log("1. Test with a real job by calling your main API endpoint:");
  console.log(
    `   GET ${BASE_URL}/api/meta-marketing-daily?action=getData&accountId=${TEST_ACCOUNT_ID}&timeframe=24h`
  );
  console.log("2. Monitor the job progress in Supabase:");
  console.log(
    "   SELECT * FROM background_jobs ORDER BY created_at DESC LIMIT 5;"
  );
  console.log("3. Check QStash console for webhook delivery status");
}

// Run the tests
runTests().catch(console.error);
