import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    console.log("=== STOP ENDPOINT DEBUG START ===");

    const body = await request.json();
    console.log("Request body:", body);

    const { requestId } = body;
    console.log("Extracted requestId:", requestId);

    if (!requestId) {
      console.log("❌ No request ID provided");
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      );
    }

    console.log("🔍 Creating Supabase client...");
    const supabase = await createClient();

    // Check if the job exists and is currently running
    console.log(`🔍 Fetching job with request_id: ${requestId}`);
    const { data: existingJob, error: fetchError } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("request_id", requestId)
      .single();

    console.log("📊 Fetch result:", { existingJob, fetchError });

    if (fetchError) {
      console.error("❌ Error fetching job:", fetchError);
      console.error("❌ Error code:", fetchError.code);
      console.error("❌ Error message:", fetchError.message);
      console.error("❌ Error details:", fetchError.details);
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!existingJob) {
      console.log("❌ Job not found in database");
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    console.log("✅ Job found:", {
      request_id: existingJob.request_id,
      status: existingJob.status,
      progress: existingJob.progress,
      created_at: existingJob.created_at,
      updated_at: existingJob.updated_at,
    });

    // Check if job is already completed or failed
    if (existingJob.status === "completed" || existingJob.status === "failed") {
      console.log(`⚠️ Job is already ${existingJob.status}`);
      return NextResponse.json(
        {
          error: `Job is already ${existingJob.status}`,
          status: existingJob.status,
        },
        { status: 400 }
      );
    }

    // Check if job is already cancelled
    if (existingJob.status === "cancelled") {
      console.log("⚠️ Job is already cancelled");
      return NextResponse.json(
        {
          error: "Job is already cancelled",
          status: existingJob.status,
        },
        { status: 400 }
      );
    }

    console.log("🔄 Updating job status to cancelled...");
    // Update job status to cancelled
    const { data: updateData, error: updateError } = await supabase
      .from("background_jobs")
      .update({
        status: "cancelled",
        error_message: "Job cancelled by user",
        updated_at: new Date().toISOString(),
        progress: existingJob.progress || 0, // Keep current progress
      })
      .eq("request_id", requestId)
      .select(); // Add select to see what was updated

    console.log("📤 Update result:", { updateData, updateError });

    if (updateError) {
      console.error("❌ Error updating job status:", updateError);
      console.error("❌ Update error code:", updateError.code);
      console.error("❌ Update error message:", updateError.message);
      console.error("❌ Update error details:", updateError.details);
      return NextResponse.json(
        { error: "Failed to cancel job" },
        { status: 500 }
      );
    }

    console.log(`✅ Job ${requestId} cancelled successfully`);
    console.log("✅ Updated data:", updateData);

    const response = {
      success: true,
      message: `Job ${requestId} has been cancelled`,
      requestId,
      previousStatus: existingJob.status,
      newStatus: "cancelled",
      updatedData: updateData,
    };

    console.log("📤 Sending response:", response);
    console.log("=== STOP ENDPOINT DEBUG END ===");

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("❌ Error in stop endpoint:", error);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Error message:", error.message);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
