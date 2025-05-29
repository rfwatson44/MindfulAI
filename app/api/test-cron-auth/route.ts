import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Helper to validate cron secret
const validateCronSecret = (request: Request) => {
  const headersList = headers();
  const cronSecret = headersList.get("x-cron-secret");

  // Check URL for secret parameter
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");

  return {
    headerSecret: cronSecret,
    querySecret: querySecret,
    envSecret: process.env.CRON_SECRET,
    headerMatches: cronSecret === process.env.CRON_SECRET,
    queryMatches: querySecret === process.env.CRON_SECRET,
    isValid:
      cronSecret === process.env.CRON_SECRET ||
      querySecret === process.env.CRON_SECRET,
  };
};

export async function GET(request: Request) {
  const authResult = validateCronSecret(request);

  // Don't expose the actual secret, just whether it matched
  const safeResult = {
    headerProvided: !!authResult.headerSecret,
    queryProvided: !!authResult.querySecret,
    envSecretSet: !!authResult.envSecret,
    headerMatches: authResult.headerMatches,
    queryMatches: authResult.queryMatches,
    isValid: authResult.isValid,
  };

  return NextResponse.json({
    message: "Auth test results",
    url: request.url,
    results: safeResult,
  });
}
