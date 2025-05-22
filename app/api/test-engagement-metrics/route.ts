import { NextResponse } from "next/server";
import {
  processEngagementMetrics,
  testProcessEngagementMetrics,
} from "../meta-marketing-daily/__tests__/engagement-metrics-test-utils";

export async function GET() {
  try {
    // Run the test and return the results
    const testResults = testProcessEngagementMetrics();

    // Create a custom test case with missing fields to test error handling
    const partialInsights = {
      impressions: "500",
      inline_post_engagement: "100",
      // Missing many fields to test error handling
    };
    const partialResults = processEngagementMetrics(partialInsights, 50);

    return NextResponse.json({
      success: true,
      message: "Engagement metrics test successful",
      testResults,
      partialResults,
    });
  } catch (error) {
    console.error("Error in test endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Test failed",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
