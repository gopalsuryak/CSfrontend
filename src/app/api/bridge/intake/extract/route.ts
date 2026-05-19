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
  const ext = path.extname(name || "").toLowerCase();
  if (!ext) {
    return ".bin";
  }
  return ext;
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
    const coi = form.get("coi");
    const moa = form.get("moa");
    const aoa = form.get("aoa");

    const payload: Record<string, unknown> = {};
    if (coi instanceof File && coi.size > 0) {
      payload.coiPath = await writeTempFile(coi, "coi");
      createdPaths.push(payload.coiPath as string);
    }
    if (moa instanceof File && moa.size > 0) {
      payload.moaPath = await writeTempFile(moa, "moa");
      createdPaths.push(payload.moaPath as string);
    }
    if (aoa instanceof File && aoa.size > 0) {
      payload.aoaPath = await writeTempFile(aoa, "aoa");
      createdPaths.push(payload.aoaPath as string);
    }

    const data = await runBridge<Record<string, unknown>>("extract_company_docs", payload);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed." },
      { status: 500 },
    );
  } finally {
    await Promise.all(
      createdPaths.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch {
          // Best effort cleanup.
        }
      }),
    );
  }
}
