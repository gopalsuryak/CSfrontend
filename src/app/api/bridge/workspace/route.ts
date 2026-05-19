import { NextRequest, NextResponse } from "next/server";
import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  const companyId = request.nextUrl.searchParams.get("companyId");

  try {
    const data = await runBridge<Record<string, unknown>>("workspace", {
      companyId: companyId ? Number(companyId) : null,
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workspace." },
      { status: 500 },
    );
  }
}
