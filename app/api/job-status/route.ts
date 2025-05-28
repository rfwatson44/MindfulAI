import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get("requestId");
    const limit = parseInt(searchParams.get("limit") || "10");
    const jobType = searchParams.get("type") || "meta-marketing-sync";

    const supabase = await createClient();

    if (requestId) {
      // Get specific job by request ID
      const { data: job, error } = await supabase
        .from("background_jobs")
        .select("*")
        .eq("request_id", requestId)
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Job not found", details: error.message },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        job,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Get recent jobs
      const { data: jobs, error } = await supabase
        .from("background_jobs")
        .select("*")
        .eq("job_type", jobType)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json(
          { error: "Failed to fetch jobs", details: error.message },
          { status: 500 }
        );
      }

      // Group jobs by status for summary
      const summary = jobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      return NextResponse.json({
        success: true,
        summary,
        total_jobs: jobs.length,
        jobs,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ Job status error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also get cron logs
export async function POST(request: Request) {
  try {
    const { limit = 5 } = await request.json();

    const supabase = await createClient();

    // Get recent cron logs
    const { data: cronLogs, error } = await supabase
      .from("meta_cron_logs")
      .select("*")
      .order("execution_time", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch cron logs", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      cron_logs: cronLogs,
      total_logs: cronLogs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Cron logs error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
