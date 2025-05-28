import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// Sample test accounts (replace with real account IDs when available)
const TEST_ACCOUNTS = [
  {
    account_id: "123456789", // This will become act_123456789
    account_name: "Test Account 1",
  },
  {
    account_id: "987654321", // This will become act_987654321
    account_name: "Test Account 2",
  },
];

export async function GET() {
  try {
    const supabase = await createClient();

    // Get existing accounts
    const { data: existingAccounts, error: fetchError } = await supabase
      .from("accounts")
      .select("account_id, account_name");

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch accounts", details: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Current accounts in database",
      accounts: existingAccounts || [],
      count: existingAccounts?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Get accounts error:", error);

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accounts = TEST_ACCOUNTS, force = false } = body;

    const supabase = await createClient();

    console.log(`📝 Adding ${accounts.length} test accounts to database...`);

    if (force) {
      // Delete existing accounts first
      const { error: deleteError } = await supabase
        .from("accounts")
        .delete()
        .neq("account_id", ""); // Delete all

      if (deleteError) {
        console.error("❌ Failed to delete existing accounts:", deleteError);
      } else {
        console.log("🗑️ Deleted existing accounts");
      }
    }

    // Insert new accounts
    const { data: insertedAccounts, error: insertError } = await supabase
      .from("accounts")
      .upsert(accounts, {
        onConflict: "account_id",
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert accounts", details: insertError.message },
        { status: 500 }
      );
    }

    console.log(
      `✅ Successfully added ${insertedAccounts?.length || 0} accounts`
    );

    return NextResponse.json({
      success: true,
      message: `Successfully added ${
        insertedAccounts?.length || 0
      } test accounts`,
      accounts: insertedAccounts,
      formatted_accounts: insertedAccounts?.map((acc) => ({
        ...acc,
        formatted_id: `act_${acc.account_id}`,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Add accounts error:", error);

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

export async function DELETE() {
  try {
    const supabase = await createClient();

    console.log("🗑️ Deleting all test accounts...");

    // Delete all accounts
    const { error: deleteError } = await supabase
      .from("accounts")
      .delete()
      .neq("account_id", ""); // Delete all

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete accounts", details: deleteError.message },
        { status: 500 }
      );
    }

    console.log("✅ All accounts deleted");

    return NextResponse.json({
      success: true,
      message: "All test accounts deleted successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Delete accounts error:", error);

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
