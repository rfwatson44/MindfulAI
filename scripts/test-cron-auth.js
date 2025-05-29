// Script to test cron job authentication

async function testWithHeader(secret) {
  console.log("\n📡 Testing with x-cron-secret header...");
  try {
    const response = await fetch(
      "https://your-domain.vercel.app/api/test-cron-auth",
      {
        method: "GET",
        headers: {
          "x-cron-secret": secret || "",
        },
      }
    );

    const result = await response.json();
    console.log("Status:", response.status);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error testing with header:", error);
  }
}

async function testWithQueryParam(secret) {
  console.log("\n📡 Testing with query parameter...");
  try {
    const url = `https://your-domain.vercel.app/api/test-cron-auth?secret=${encodeURIComponent(
      secret || ""
    )}`;
    const response = await fetch(url, {
      method: "GET",
    });

    const result = await response.json();
    console.log("Status:", response.status);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error testing with query param:", error);
  }
}

async function testActualCronWithQueryParam(secret) {
  console.log("\n📡 Testing actual cron endpoint with query parameter...");
  try {
    const url = `https://your-domain.vercel.app/api/cron/meta-marketing?secret=${encodeURIComponent(
      secret || ""
    )}`;
    const response = await fetch(url, {
      method: "GET",
    });

    const result = await response.json();
    console.log("Status:", response.status);
    try {
      console.log("Result:", JSON.stringify(result, null, 2));
    } catch {
      console.log("Result body:", await response.text());
    }
  } catch (error) {
    console.error("Error testing actual cron:", error);
  }
}

// Get secret from command line or environment
const secret = process.argv[2] || process.env.CRON_SECRET || "";

if (!secret) {
  console.warn(
    "⚠️ No secret provided. Use: node test-cron-auth.js YOUR_SECRET"
  );
  console.warn("⚠️ Or set CRON_SECRET environment variable");
}

console.log(
  "🔒 Testing cron authentication with secret:",
  secret ? "(provided)" : "(empty)"
);

// Run all tests
async function runTests() {
  await testWithHeader(secret);
  await testWithQueryParam(secret);
  await testActualCronWithQueryParam(secret);
}

runTests().catch(console.error);
