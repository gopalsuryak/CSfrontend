import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  const { searchParams } = new URL(request.url);
  const transferId = Number(searchParams.get("id") ?? "0");
  const companyId = Number(searchParams.get("companyId") ?? "0");

  if (!transferId || !Number.isFinite(transferId) || transferId <= 0) {
    return NextResponse.json({ error: "Invalid transfer ID." }, { status: 400 });
  }
  if (!companyId || !Number.isFinite(companyId) || companyId <= 0) {
    return NextResponse.json({ error: "Invalid company ID." }, { status: 400 });
  }

  try {
    const data = await runBridge<{ transfer_form_path?: string; pdf_path?: string }>(
      "get_transfer_paths",
      { transferId, companyId },
    );

    const filePath = data.transfer_form_path;
    if (!filePath) {
      return NextResponse.json({ error: "No SH-4 document found for this transfer." }, { status: 404 });
    }

    // Security: resolve to absolute path and ensure it stays within the expected clients/ folder
    const resolved = path.resolve(filePath);
    const clientsRoot = path.resolve(process.cwd(), "..", "clients");
    const relative = path.relative(clientsRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const buffer = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = path.basename(resolved);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to download document." },
      { status: 500 },
    );
  }
}
