import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx"]);

function extensionFromName(name: string) {
  return path.extname(name || "").toLowerCase() || ".bin";
}

async function writeTempFile(file: File, prefix: string) {
  const ext = extensionFromName(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File is too large. Maximum upload size is 15 MB.");
  }
  const tempPath = path.join(os.tmpdir(), `${prefix}-${randomUUID()}${extensionFromName(file.name)}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}

export async function POST(request: Request) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  const createdPaths: string[] = [];
  try {
    const form = await request.formData();
    const paths: string[] = [];

    for (const [, value] of form.entries()) {
      if (value instanceof File && value.size > 0) {
        const tmpPath = await writeTempFile(value, "kyc");
        createdPaths.push(tmpPath);
        paths.push(tmpPath);
      }
    }

    if (paths.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }

    const data = await runBridge<Record<string, unknown>>("extract_kyc_docs", { paths });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "KYC extraction failed." },
      { status: 500 },
    );
  } finally {
    await Promise.all(
      createdPaths.map(async (p) => {
        try { await fs.unlink(p); } catch { /* best effort */ }
      }),
    );
  }
}
