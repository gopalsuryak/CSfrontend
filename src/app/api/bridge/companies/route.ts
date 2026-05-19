import { NextResponse } from "next/server";
import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  try {
    const data = await runBridge<{ companies: Array<Record<string, unknown>> }>("companies");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load companies." },
      { status: 500 },
    );
  }
}
