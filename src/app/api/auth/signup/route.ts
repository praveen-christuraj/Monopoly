import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Account creation now happens directly with Supabase Auth from the frontend.",
    },
    { status: 410 }
  );
}
