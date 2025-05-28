import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("🧪 Manual cron test triggered");

    // Get the base URL for the current deployment
    const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NEXTAUTH_URL || "http://localhost:3000";

    const cronUrl = `${baseUrl}/api/cron/meta-marketing`;

    console.log(`📞 Calling cron endpoint: ${cronUrl}`);

    // Call the cron endpoint with the secret
    const response = await fetch(cronUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET || "",
      },
    });

    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      responseData = { raw_response: responseText };
    }

    console.log(`📊 Cron response status: ${response.status}`);
    console.log(`📋 Cron response:`, responseData);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Cron job failed with status ${response.status}`,
          response: responseData,
          status: response.status,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cron job triggered successfully",
      cron_response: responseData,
      test_timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test cron error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        test_timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Also support POST method for testing
  return GET();
}
