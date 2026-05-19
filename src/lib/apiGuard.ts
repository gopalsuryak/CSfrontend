import { NextResponse } from "next/server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostnameFromHostHeader(host: string) {
  const trimmed = host.trim();
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    return trimmed.slice(1, trimmed.indexOf("]"));
  }
  return trimmed.split(":")[0];
}

export function assertLocalBridgeRequest(request: Request) {
  if (process.env.ALLOW_REMOTE_BRIDGE === "1") {
    return null;
  }

  const requestUrl = new URL(request.url);
  const hostHeader = request.headers.get("host") || requestUrl.host;
  const hostname = hostnameFromHostHeader(hostHeader).toLowerCase();

  if (!LOCAL_HOSTS.has(hostname)) {
    return NextResponse.json({ error: "Bridge API is restricted to local access." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
    if (originUrl.host.toLowerCase() !== hostHeader.toLowerCase()) {
      return NextResponse.json({ error: "Cross-origin bridge request denied." }, { status: 403 });
    }
  }

  return null;
}
