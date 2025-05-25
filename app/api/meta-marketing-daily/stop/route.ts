import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if the job exists and is currently running
    const { data: existingJob, error: fetchError } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("request_id", requestId)
      .single();

    if (fetchError) {
      console.error("Error fetching job:", fetchError);
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!existingJob) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if job is already completed or failed
    if (existingJob.status === "completed" || existingJob.status === "failed") {
      return NextResponse.json(
        {
          error: `Job is already ${existingJob.status}`,
          status: existingJob.status,
        },
        { status: 400 }
      );
    }

    // Update job status to cancelled
    const { error: updateError } = await supabase
      .from("background_jobs")
      .update({
        status: "cancelled",
        error_message: "Job cancelled by user",
        updated_at: new Date().toISOString(),
        progress: existingJob.progress || 0, // Keep current progress
      })
      .eq("request_id", requestId);

    if (updateError) {
      console.error("Error updating job status:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel job" },
        { status: 500 }
      );
    }

    console.log(`Job ${requestId} cancelled successfully`);

    return NextResponse.json({
      success: true,
      message: `Job ${requestId} has been cancelled`,
      requestId,
      previousStatus: existingJob.status,
      newStatus: "cancelled",
    });
  } catch (error) {
    console.error("Error in stop endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
