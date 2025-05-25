import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface JobStatusResponse {
  requestId: string;
  status: string;
  progress: number;
  jobType: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  resultData: any;
  estimatedTimeRemaining: number | null;
  summary?: {
    totalCampaigns: number;
    accountProcessed: boolean;
    dateRange: any;
    totalProcessed: number;
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      );
    }

    // Get job status from database
    const { data: job, error } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("request_id", requestId)
      .single();

    if (error) {
      console.error("Error fetching job status:", error);
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Calculate estimated time remaining based on progress
    let estimatedTimeRemaining = null;
    if (job.status === "processing" && job.progress > 0) {
      const elapsedTime = Date.now() - new Date(job.created_at).getTime();
      const estimatedTotalTime = (elapsedTime / job.progress) * 100;
      estimatedTimeRemaining = Math.max(0, estimatedTotalTime - elapsedTime);
    }

    const response: JobStatusResponse = {
      requestId: job.request_id,
      status: job.status,
      progress: job.progress,
      jobType: job.job_type,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
      resultData: job.result_data,
      estimatedTimeRemaining: estimatedTimeRemaining
        ? Math.round(estimatedTimeRemaining / 1000)
        : null, // in seconds
    };

    // If job is completed, include additional metadata
    if (job.status === "completed" && job.result_data) {
      response.summary = {
        totalCampaigns: job.result_data.campaigns?.length || 0,
        accountProcessed: !!job.result_data.accountData,
        dateRange: job.result_data.dateRange,
        totalProcessed: job.result_data.totalProcessed || 0,
      };
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error checking job status:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

// Optional: Add a DELETE endpoint to cancel jobs (if needed)
export async function DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { error: "Request ID is required" },
        { status: 400 }
      );
    }

    // Update job status to cancelled (Note: This won't actually stop QStash job)
    const { error } = await supabase
      .from("background_jobs")
      .update({
        status: "failed",
        error_message: "Job cancelled by user",
        updated_at: new Date(),
      })
      .eq("request_id", requestId)
      .in("status", ["queued", "processing"]);

    if (error) {
      console.error("Error cancelling job:", error);
      return NextResponse.json(
        { error: "Failed to cancel job" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Job cancellation requested",
      requestId,
      note: "The background process may continue running but will be marked as cancelled",
    });
  } catch (error: any) {
    console.error("Error cancelling job:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
