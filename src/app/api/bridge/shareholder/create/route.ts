import { NextResponse } from "next/server";

import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data = await runBridge<Record<string, unknown>>("create_shareholder", body);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create shareholder." },
      { status: 500 },
    );
  }
}
