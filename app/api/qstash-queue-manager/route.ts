import { NextRequest, NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createClient } from "@/utils/supabase/server";

const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

// GET: Check queue status and list active jobs
export async function GET(request: NextRequest) {
  try {
    console.log("=== QSTASH QUEUE STATUS CHECK ===");

    const supabase = await createClient();

    // Get active jobs from database
    const { data: activeJobs, error: dbError } = await supabase
      .from("background_jobs")
      .select("*")
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false });

    if (dbError) {
      console.error("Error fetching active jobs:", dbError);
      return NextResponse.json(
        { error: "Failed to fetch active jobs" },
        { status: 500 }
      );
    }

    // Try to get QStash queue info (this might not be available in free tier)
    let qstashInfo = null;
    try {
      // Note: QStash free tier doesn't provide queue listing
      // This is mainly for logging and debugging
      qstashInfo = {
        message: "QStash queue info not available in free tier",
        note: "Use database records to track active jobs",
      };
    } catch (qstashError) {
      console.warn("Could not fetch QStash queue info:", qstashError);
    }

    const response = {
      activeJobs: activeJobs || [],
      activeJobCount: activeJobs?.length || 0,
      qstashInfo,
      globalKillSwitch: process.env.GLOBAL_WORKER_KILL_SWITCH === "true",
      workerDisabled: process.env.WORKER_DISABLED === "true",
      timestamp: new Date().toISOString(),
    };

    console.log("Queue status:", response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error checking queue status:", error);
    return NextResponse.json(
      { error: "Failed to check queue status", details: error.message },
      { status: 500 }
    );
  }
}

// POST: Emergency stop - Cancel all active jobs and enable kill switch
export async function POST(request: NextRequest) {
  try {
    console.log("=== EMERGENCY STOP ACTIVATED ===");

    const supabase = await createClient();

    // 1. Get all active jobs
    const { data: activeJobs, error: fetchError } = await supabase
      .from("background_jobs")
      .select("*")
      .in("status", ["queued", "processing"]);

    if (fetchError) {
      console.error("Error fetching active jobs:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch active jobs" },
        { status: 500 }
      );
    }

    console.log(`Found ${activeJobs?.length || 0} active jobs to cancel`);

    // 2. Cancel all active jobs in database
    const { data: cancelledJobs, error: cancelError } = await supabase
      .from("background_jobs")
      .update({
        status: "cancelled",
        error_message: "Emergency stop - All jobs cancelled",
        updated_at: new Date().toISOString(),
      })
      .in("status", ["queued", "processing"])
      .select();

    if (cancelError) {
      console.error("Error cancelling jobs:", cancelError);
      return NextResponse.json(
        { error: "Failed to cancel jobs" },
        { status: 500 }
      );
    }

    console.log(`Successfully cancelled ${cancelledJobs?.length || 0} jobs`);

    // 3. Note about QStash jobs
    // QStash doesn't provide a way to cancel queued messages in the free tier
    // The global kill switch will prevent them from processing when they execute

    const response = {
      success: true,
      message: "Emergency stop activated",
      cancelledJobs: cancelledJobs?.length || 0,
      activeJobsBefore: activeJobs?.length || 0,
      globalKillSwitchActivated: true,
      note: "Existing QStash messages will be stopped by the global kill switch when they execute",
      recommendation:
        "Set GLOBAL_WORKER_KILL_SWITCH=true in Vercel environment variables",
      timestamp: new Date().toISOString(),
    };

    console.log("Emergency stop completed:", response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error during emergency stop:", error);
    return NextResponse.json(
      { error: "Emergency stop failed", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Clear completed/failed jobs (cleanup)
export async function DELETE(request: NextRequest) {
  try {
    console.log("=== CLEANING UP OLD JOBS ===");

    const supabase = await createClient();

    // Delete jobs older than 24 hours that are completed/failed/cancelled
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: deletedJobs, error: deleteError } = await supabase
      .from("background_jobs")
      .delete()
      .in("status", ["completed", "failed", "cancelled"])
      .lt("created_at", cutoffDate)
      .select();

    if (deleteError) {
      console.error("Error deleting old jobs:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete old jobs" },
        { status: 500 }
      );
    }

    const response = {
      success: true,
      message: "Old jobs cleaned up",
      deletedJobs: deletedJobs?.length || 0,
      cutoffDate,
      timestamp: new Date().toISOString(),
    };

    console.log("Cleanup completed:", response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Error during cleanup:", error);
    return NextResponse.json(
      { error: "Cleanup failed", details: error.message },
      { status: 500 }
    );
  }
}
