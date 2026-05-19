import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type BridgeResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

function getPaths() {
  const workspaceRoot = path.resolve(process.cwd(), "..");
  const pythonExe = process.env.PYTHON_EXE || path.join(workspaceRoot, ".venv", "Scripts", "python.exe");
  const bridgeScript = process.env.BRIDGE_SCRIPT || path.join(workspaceRoot, "web_api_bridge.py");
  return { pythonExe, bridgeScript };
}

export async function runBridge<T>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { pythonExe, bridgeScript } = getPaths();
  const payloadJson = JSON.stringify(payload);

  let rawStdout = "";
  try {
    const { stdout } = await execFileAsync(pythonExe, [bridgeScript, command, payloadJson], {
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });
    rawStdout = stdout?.trim() ?? "";
  } catch (execErr: unknown) {
    // execFile rejects on non-zero exit code; stdout may still contain the JSON error from Python
    const errObj = execErr as { stdout?: string; stderr?: string; message?: string };
    rawStdout = errObj.stdout?.trim() ?? "";
    if (!rawStdout) {
      throw new Error(errObj.stderr?.trim() || errObj.message || "Bridge process failed.");
    }
  }

  if (!rawStdout) {
    throw new Error("Bridge returned empty output.");
  }

  let parsed: BridgeResult<T>;
  try {
    parsed = JSON.parse(rawStdout) as BridgeResult<T>;
  } catch {
    throw new Error(`Invalid bridge response: ${rawStdout}`);
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || "Bridge command failed.");
  }

  return parsed.data as T;
}
