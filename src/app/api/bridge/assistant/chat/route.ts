import { NextResponse } from "next/server";

import { runBridge } from "@/lib/pythonBridge";
import { assertLocalBridgeRequest } from "@/lib/apiGuard";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type TransferDraft = {
  fromShareholderName?: string;
  toShareholderName?: string;
  shares?: number;
  pricePerShare?: number;
  transferDate?: string;
  toEmail?: string;
  toAddress?: string;
  toPan?: string;
  toOccupation?: string;
  witnessName?: string;
  witnessAddress?: string;
};

type CompanyDraft = {
  name?: string;
  cin?: string;
  registered_office?: string;
  director1_name?: string;
  director2_name?: string;
  date_of_incorporation?: string;
  authorized_capital?: number;
  class_of_shares?: string;
  face_value?: number;
  premium?: number;
  transfer_restrictions?: string;
  secretary_name?: string;
};

type NewShareholderContact = {
  email?: string;
  address?: string;
  pan?: string;
  phone?: string;
  occupation?: string;
  fatherName?: string;
};

type ReviseHoldingEntry = {
  name: string;
  targetPct: number;
  targetShares?: number;
};

type PlannedTransfer = {
  from: string;
  to: string;
  shares: number;
  fromCertificateId?: number;
  toMemberId?: number;
};

type ReviseHoldingDraft = {
  targetPattern: ReviseHoldingEntry[];
  pricePerShare?: number;
  transferDate?: string;
  plannedTransfers?: PlannedTransfer[];
  /** Contact details for new (unregistered) transferees, keyed by normalized name */
  newShareholderDetails?: Record<string, NewShareholderContact>;
};

type AssistantState = {
  transferDraft?: TransferDraft | null;
  companyDraft?: CompanyDraft | null;
  extractedAttachment?: ExtractedAttachmentData | null;
  reviseHoldingDraft?: ReviseHoldingDraft | null;
  awaitingConfirmation?: boolean;
};

type ParsedAssistantResult = {
  intent: "qa" | "draft_transfer" | "process_transfer" | "create_company" | "revise_shareholding" | "unknown";
  reply: string;
  transferDraft?: TransferDraft;
  companyDraft?: CompanyDraft;
  /** Extracted by OpenAI when intent is revise_shareholding */
  reviseHoldingPattern?: ReviseHoldingEntry[];
  /** Contact details for new shareholders, extracted from message or attached KYC docs */
  newShareholderDetails?: Record<string, NewShareholderContact>;
  missingFields?: string[];
};

type WorkspaceShape = {
  company?: { id?: number; name?: string | null; cin?: string | null; face_value?: number; authorized_capital?: number } | null;
  cap_table?: Array<{
    shareholder_id?: number;
    folio_number?: string;
    name?: string;
    total_shares_held?: number;
    percentage_holding?: number;
    paid_up_value?: number;
  }>;
  member_register?: Array<{ id?: number; name?: string; address?: string; email?: string; pan?: string; folio_number?: string }>;
  certificate_register?: Array<{
    id?: number;
    certificate_number?: string;
    shareholder_name?: string;
    shares?: number;
    distinctive_from?: number;
    distinctive_to?: number;
    face_value?: number;
    status?: string;
  }>;
  companies?: Array<{ id?: number; name?: string; cin?: string }>;
};

type ExtractedAttachmentData = {
  company_name?: string;
  cin?: string;
  date_of_incorporation?: string;
  registered_office?: string;
  authorized_capital?: number;
  class_of_shares?: string;
  transfer_restrictions?: string;
  face_value?: number;
  director1_name?: string;
  director2_name?: string;
  secretary_name?: string;
  subscribers?: Array<{ name?: string; address?: string; shares?: number }>;
  // KYC / person document fields
  person_name?: string;
  person_pan?: string;
  person_father_name?: string;
  person_address?: string;
  person_email?: string;
  person_phone?: string;
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/**
 * Fuzzy name finder: tries exact, then substring, then startsWith.
 * Returns the matching item or undefined.
 */
function fuzzyFind<T>(list: T[], key: (item: T) => string | null | undefined, query: string): T | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  // 1. Exact normalized match
  let found = list.find((item) => normalize(key(item)) === q);
  if (found) return found;
  // 2. DB entry starts with query (e.g. query="gopal", db="gopal kumar")
  found = list.find((item) => normalize(key(item)).startsWith(q));
  if (found) return found;
  // 3. Query starts with DB name (e.g. query="gopal kumar", db="gopal")
  found = list.find((item) => q.startsWith(normalize(key(item))));
  return found;
}

function firstUserLine(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return messages[index].content.trim();
    }
  }
  return "";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseNumber(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/,/g, "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseTransferDraft(raw: unknown): TransferDraft | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  return {
    fromShareholderName: typeof value.fromShareholderName === "string" ? value.fromShareholderName.trim() : undefined,
    toShareholderName: typeof value.toShareholderName === "string" ? value.toShareholderName.trim() : undefined,
    shares: parseNumber(value.shares),
    pricePerShare: parseNumber(value.pricePerShare),
    transferDate: typeof value.transferDate === "string" ? value.transferDate.trim() : undefined,
    toEmail: typeof value.toEmail === "string" ? value.toEmail.trim() : undefined,
    toAddress: typeof value.toAddress === "string" ? value.toAddress.trim() : undefined,
    toPan: typeof value.toPan === "string" ? value.toPan.trim().toUpperCase() : undefined,
    toOccupation: typeof value.toOccupation === "string" ? value.toOccupation.trim() : undefined,
    witnessName: typeof value.witnessName === "string" ? value.witnessName.trim() : undefined,
    witnessAddress: typeof value.witnessAddress === "string" ? value.witnessAddress.trim() : undefined,
  };
}

function parseCompanyDraft(raw: unknown): CompanyDraft | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Record<string, unknown>;
  return {
    name: typeof value.name === "string" ? value.name.trim() : undefined,
    cin: typeof value.cin === "string" ? value.cin.trim().toUpperCase() : undefined,
    registered_office: typeof value.registered_office === "string" ? value.registered_office.trim() : undefined,
    director1_name: typeof value.director1_name === "string" ? value.director1_name.trim() : undefined,
    director2_name: typeof value.director2_name === "string" ? value.director2_name.trim() : undefined,
    date_of_incorporation: typeof value.date_of_incorporation === "string" ? value.date_of_incorporation.trim() : undefined,
    authorized_capital: parseNumber(value.authorized_capital),
    class_of_shares: typeof value.class_of_shares === "string" ? value.class_of_shares.trim() : undefined,
    face_value: parseNumber(value.face_value),
    premium: parseNumber(value.premium),
    transfer_restrictions: typeof value.transfer_restrictions === "string" ? value.transfer_restrictions.trim() : undefined,
    secretary_name: typeof value.secretary_name === "string" ? value.secretary_name.trim() : undefined,
  };
}

function heuristicDraftFromMessage(message: string): TransferDraft {
  const draft: TransferDraft = {};
  const transferRegex = /transfer\s+(\d+)\s+shares?\s+from\s+(.+?)\s+to\s+(.+?)(?:\.|,|$)/i;
  const transferMatch = message.match(transferRegex);
  if (transferMatch) {
    draft.shares = Number(transferMatch[1]);
    draft.fromShareholderName = transferMatch[2].trim();
    draft.toShareholderName = transferMatch[3].trim();
  }

  const fromRegex = /from\s+([a-z0-9 .,&'-]{3,})/i;
  const toRegex = /to\s+([a-z0-9 .,&'-]{3,})/i;
  if (!draft.fromShareholderName) {
    const fromMatch = message.match(fromRegex);
    if (fromMatch) {
      draft.fromShareholderName = fromMatch[1].trim();
    }
  }
  if (!draft.toShareholderName) {
    const toMatch = message.match(toRegex);
    if (toMatch) {
      draft.toShareholderName = toMatch[1].trim();
    }
  }

  const ppsRegex = /(price\s*per\s*share|pps|at)\s*(?:is\s*)?(?:rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i;
  const ppsMatch = message.match(ppsRegex);
  if (ppsMatch) {
    draft.pricePerShare = Number(ppsMatch[2]);
  }

  const emailRegex = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
  const emailMatch = message.match(emailRegex);
  if (emailMatch) {
    draft.toEmail = emailMatch[1].trim();
  }

  const dateRegex = /(\d{4}-\d{2}-\d{2})/;
  const dateMatch = message.match(dateRegex);
  if (dateMatch) {
    draft.transferDate = dateMatch[1];
  }

  const addressRegex = /address\s*(?:is|:)\s*([^\n]+)/i;
  const addressMatch = message.match(addressRegex);
  if (addressMatch) {
    draft.toAddress = addressMatch[1].trim();
  }

  return draft;
}

function heuristicCompanyDraftFromMessage(message: string): CompanyDraft {
  const draft: CompanyDraft = {};

  const nameMatch = message.match(/(?:create|add)\s+(?:company\s+)?(?:named|name\s+)?([a-z0-9 .,&'()-]{4,})/i);
  if (nameMatch) {
    const candidate = nameMatch[1].trim();
    if (!/^(?:a|an|the)?\s*company$/i.test(candidate) && !/^new\s+company$/i.test(candidate)) {
      draft.name = candidate;
    }
  }

  const cinMatch = message.match(/\b(cin)\s*(?:is|:)?\s*([a-z0-9]{8,25})\b/i);
  if (cinMatch) {
    draft.cin = cinMatch[2].trim().toUpperCase();
  }

  const officeMatch = message.match(/(?:registered office|office address|address)\s*(?:is|:)?\s*([^\n]+)/i);
  if (officeMatch) {
    draft.registered_office = officeMatch[1].trim();
  }

  const d1Match = message.match(/director\s*1\s*(?:is|:)?\s*([^,\n]+)/i);
  if (d1Match) {
    draft.director1_name = d1Match[1].trim();
  }

  const d2Match = message.match(/director\s*2\s*(?:is|:)?\s*([^,\n]+)/i);
  if (d2Match) {
    draft.director2_name = d2Match[1].trim();
  }

  const doiMatch = message.match(/(?:incorporation date|date of incorporation|doi)\s*(?:is|:)?\s*(\d{4}-\d{2}-\d{2})/i);
  if (doiMatch) {
    draft.date_of_incorporation = doiMatch[1];
  }

  const authCapMatch = message.match(/(?:authorized capital|authorised capital)\s*(?:is|:)?\s*(?:inr|rs\.?\s*)?([0-9,]+(?:\.\d+)?)/i);
  if (authCapMatch) {
    draft.authorized_capital = Number(authCapMatch[1].replace(/,/g, ""));
  }

  return draft;
}

function mergeDraft(previous: TransferDraft | null | undefined, next: TransferDraft | null | undefined): TransferDraft | null {
  const merged = {
    ...(previous || {}),
    ...(next || {}),
  };
  return Object.keys(merged).length ? merged : null;
}

function mergeCompanyDraft(previous: CompanyDraft | null | undefined, next: CompanyDraft | null | undefined): CompanyDraft | null {
  const merged = {
    ...(previous || {}),
    ...(next || {}),
  };
  return Object.keys(merged).length ? merged : null;
}

function companyDraftFromExtraction(extracted: ExtractedAttachmentData | null | undefined): CompanyDraft | null {
  if (!extracted) {
    return null;
  }
  const mapped: CompanyDraft = {
    name: extracted.company_name?.trim() || undefined,
    cin: extracted.cin?.trim().toUpperCase() || undefined,
    registered_office: extracted.registered_office?.trim() || undefined,
    director1_name: extracted.director1_name?.trim() || undefined,
    director2_name: extracted.director2_name?.trim() || undefined,
    date_of_incorporation: extracted.date_of_incorporation?.trim() || undefined,
    authorized_capital: typeof extracted.authorized_capital === "number" ? extracted.authorized_capital : undefined,
    class_of_shares: extracted.class_of_shares?.trim() || undefined,
    face_value: typeof extracted.face_value === "number" ? extracted.face_value : undefined,
    transfer_restrictions: extracted.transfer_restrictions?.trim() || undefined,
    secretary_name: extracted.secretary_name?.trim() || undefined,
  };
  return Object.values(mapped).some((value) => value !== undefined && value !== "") ? mapped : null;
}

function isLikelyExecution(message: string) {
  return /(confirm|go ahead|proceed|process|execute|run|create\s+sh-?4|do\s+it|retry)/i.test(message);
}

/** Scan recent assistant messages for ✗ FROM → TO: N shares lines and rebuild PlannedTransfer[]. */
function recoverFailedTransfers(conversation: { role: string; content: string }[]): PlannedTransfer[] {
  // Look at the last few assistant messages for failure lines
  const assistantMessages = [...conversation].reverse().filter((m) => m.role === "assistant").slice(0, 5);
  const recovered: PlannedTransfer[] = [];
  const lineRe = /✗\s+(.+?)\s*→\s*(.+?):\s*([\d,]+)\s*shares/gi;
  for (const msg of assistantMessages) {
    let match: RegExpExecArray | null;
    while ((match = lineRe.exec(msg.content)) !== null) {
      const shares = parseInt(match[3].replace(/,/g, ""), 10);
      if (!isNaN(shares) && shares > 0) {
        recovered.push({ from: match[1].trim(), to: match[2].trim(), shares });
      }
    }
    if (recovered.length > 0) break; // use the most recent failure block
  }
  return recovered;
}

function renderShareholdingPattern(workspace: WorkspaceShape, extractedAttachment?: ExtractedAttachmentData | null, companyName?: string | null) {
  const rows = (workspace.cap_table || []).slice(0, 20);
  if (!rows.length) {
    const subscribers = extractedAttachment?.subscribers || [];
    if (subscribers.length) {
      const totalShares = subscribers.reduce((sum, row) => sum + Number(row.shares || 0), 0);
      const lines = [
        companyName
          ? `Shareholding pattern from attached incorporation documents for ${companyName}:`
          : "Shareholding pattern from attached incorporation documents:",
      ];
      for (const row of subscribers.slice(0, 20)) {
        const shares = Number(row.shares || 0);
        const percentage = totalShares > 0 ? ` (${((shares / totalShares) * 100).toFixed(2)}%)` : "";
        lines.push(`- ${row.name || "Unknown"}: ${shares} shares${percentage}`);
      }
      return lines.join("\n");
    }
    return "No shareholding rows are available for the selected company yet.";
  }
  const lines = ["Current shareholding pattern:"];
  for (const row of rows) {
    lines.push(`- ${row.name || "Unknown"}: ${Number(row.total_shares_held || 0)} shares (${Number(row.percentage_holding || 0).toFixed(2)}%)`);
  }
  return lines.join("\n");
}

function inferActionHint(params: {
  latestMessage: string;
  state: AssistantState;
  companyId: number | null;
}) {
  if (/create\s+company|add\s+company|new\s+company|register\s+company/i.test(params.latestMessage) || params.state.companyDraft) {
    return "create_company" as const;
  }
  // Detect cap-table revision patterns before transfer detection
  if (
    /revised?\s+(cap\s*table|captable|shareholding|pattern)|new\s+(captable|pattern|shareholding)|change\s+(captable|shareholding|pattern)|\d+\s*%.*\d+\s*%|remaining\s+[a-z]/i.test(
      params.latestMessage,
    ) ||
    params.state.reviseHoldingDraft
  ) {
    return "revise_shareholding" as const;
  }
  if (/transfer|sh-?4|transferee|transferor/i.test(params.latestMessage) || params.state.transferDraft) {
    return "transfer" as const;
  }
  if (/shareholding|holding pattern|cap table|who holds/i.test(params.latestMessage)) {
    return "shareholding_qa" as const;
  }
  if (!params.companyId) {
    return "create_company" as const;
  }
  return "general" as const;
}

function requiredDetailsForAction(
  action: "create_company" | "transfer" | "shareholding_qa" | "revise_shareholding" | "general",
) {
  if (action === "create_company") {
    return [
      "name",
      "cin",
      "registered_office",
      "director1_name",
      "director2_name",
    ];
  }
  if (action === "transfer") {
    return [
      "fromShareholderName",
      "toShareholderName",
      "shares",
      "pricePerShare",
      "transferDate",
      "toEmail (required if transferee is new)",
      "toAddress (required if transferee is new)",
    ];
  }
  if (action === "revise_shareholding") {
    return [
      "target shareholding pattern (names + percentages or shares)",
      "price per share (0 for gift transfer)",
      "transfer date",
    ];
  }
  if (action === "shareholding_qa") {
    return ["question about current shareholding/cap table"]; 
  }
  return ["user intent", "contextually required details"];
}

function resolveCompanyCreate(draft: CompanyDraft) {
  const missing: string[] = [];
  if (!draft.name) {
    missing.push("company name");
  }
  if (!draft.cin) {
    missing.push("CIN");
  }
  if (!draft.registered_office) {
    missing.push("registered office");
  }
  if (!draft.director1_name) {
    missing.push("director 1 name");
  }
  if (!draft.director2_name) {
    missing.push("director 2 name");
  }

  const payload: Record<string, unknown> = {
    name: draft.name || "",
    cin: draft.cin || "",
    registered_office: draft.registered_office || "",
    director1_name: draft.director1_name || "",
    director2_name: draft.director2_name || "",
    date_of_incorporation: draft.date_of_incorporation || "",
    authorized_capital: draft.authorized_capital ?? 0,
    class_of_shares: draft.class_of_shares || "Equity",
    face_value: draft.face_value ?? 10,
    premium: draft.premium ?? 0,
    transfer_restrictions: draft.transfer_restrictions || "",
    secretary_name: draft.secretary_name || "",
  };

  return {
    missing,
    payload,
    summary: {
      name: draft.name,
      cin: draft.cin,
      registered_office: draft.registered_office,
      director1_name: draft.director1_name,
      director2_name: draft.director2_name,
    },
  };
}

function firstSubscriberFromExtraction(extractedAttachment: ExtractedAttachmentData | null | undefined) {
  const subscriber = extractedAttachment?.subscribers?.find((item) => (item?.name || "").trim());
  if (!subscriber?.name) {
    return null;
  }
  return {
    name: subscriber.name.trim(),
    address: (subscriber.address || "").trim(),
  };
}

async function parseWithOpenAI(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  workspace: WorkspaceShape;
  actionHint: "create_company" | "transfer" | "shareholding_qa" | "revise_shareholding" | "general";
  currentCompanyDraft?: CompanyDraft | null;
  currentTransferDraft?: TransferDraft | null;
  currentReviseHoldingDraft?: ReviseHoldingDraft | null;
  extractedAttachment?: ExtractedAttachmentData | null;
}): Promise<ParsedAssistantResult | null> {
  const totalIssuedShares = (params.workspace.cap_table || []).reduce(
    (sum, r) => sum + Number(r.total_shares_held || 0),
    0,
  );

  const richContext = {
    company: {
      ...params.workspace.company,
      total_issued_shares: totalIssuedShares,
    },
    // Full shareholder register with folio numbers and current holdings
    shareholders: (params.workspace.cap_table || []).map((r) => ({
      id: r.shareholder_id,
      name: r.name,
      folio: r.folio_number,
      shares_held: r.total_shares_held,
      percentage: Number((r.percentage_holding || 0)).toFixed(2),
      paid_up_value: r.paid_up_value,
    })),
    // All registered members (for email/address lookups)
    member_register: (params.workspace.member_register || []).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      folio: m.folio_number,
    })),
    // All issued certificates (for transfer planning)
    issued_certificates: (params.workspace.certificate_register || [])
      .filter((c) => c.status === "ISSUED")
      .map((c) => ({
        id: c.id,
        cert_no: c.certificate_number,
        holder: c.shareholder_name,
        shares: c.shares,
        dn_from: c.distinctive_from,
        dn_to: c.distinctive_to,
      })),
    extractedAttachment: params.extractedAttachment || null,
    currentCompanyDraft: params.currentCompanyDraft || null,
    currentTransferDraft: params.currentTransferDraft || null,
    currentReviseHoldingDraft: params.currentReviseHoldingDraft || null,
  };

  const conversation = params.messages.slice(-14);
  const prompt = [
    "You are an expert company secretary AI assistant for Indian share certificate workflow.",
    `Conversation context hint: ${params.actionHint}`,
    "",
    "INTENT RULES (classify the LATEST user message):",
    "- 'revise_shareholding': user describes a NEW desired shareholding pattern, cap table layout, or how shares should be distributed (any format: percentages, bare numbers, mix, 'remaining X', 'NEW-name'). This includes messages like 'new shareholding should look like gopal 33, vijay 10'.",
    "- 'draft_transfer': user mentions a single share transfer between two specific parties.",
    "- 'process_transfer': user confirms/approves a previously drafted transfer.",
    "- 'create_company': user wants to register or add a new company.",
    "- 'qa': user asks a question about current shareholding, certificates, company data, or status.",
    "- 'unknown': anything else (greetings, unclear statements).",
    "",
    "RESPONSE JSON keys: intent, reply, transferDraft, companyDraft, reviseHoldingPattern, missingFields.",
    "",
    "reviseHoldingPattern rules (populate ONLY when intent is revise_shareholding):",
    "  - Extract every name+target from the user message into [{name: string, targetPct: number}].",
    "  - targetPct is always 0-100 (a percentage).",
    "  - If user provides bare numbers without % (e.g. 'gopal 33, vijay 10'):",
    "      - If all values sum to approximately 100 → treat as percentages directly.",
    "      - Otherwise → treat as share counts and divide by company.total_issued_shares * 100.",
    "  - 'NEW-name' or 'NEW name' means the person is a new shareholder; strip the NEW prefix, use the name.",
    "  - 'remaining <name>' or '<name> remaining' → that person gets (100 - sum of all others)%.",
    "  - Do NOT populate transferDraft when intent is revise_shareholding.",
    "",
    "transferDraft rules (populate only when intent is draft_transfer or process_transfer):",
    "  keys: fromShareholderName,toShareholderName,shares,pricePerShare,transferDate,toEmail,toAddress,toPan,toOccupation,witnessName,witnessAddress",
    "",
    "companyDraft rules (populate only when intent is create_company):",
    "  keys: name,cin,registered_office,director1_name,director2_name,date_of_incorporation,authorized_capital,class_of_shares,face_value,premium,transfer_restrictions,secretary_name",
    "",
    "newShareholderDetails rules (populate whenever contact info is available for any person):",
    "  - When user provides email/address/phone/PAN/occupation for someone in the revise flow, extract it.",
    "  - Key = normalized person name (lowercase, trimmed). Value = {email, address, pan, phone, occupation, fatherName}.",
    "  - Example: 'Email: xyz@gmail.com Mobile: 9876543210 Occupation: Doctor' while revising → extract for the pending new shareholders.",
    "  - If extractedAttachment contains person_name/person_pan/person_address/person_father_name (KYC doc), map those to newShareholderDetails[normalize(person_name)] with fatherName=person_father_name.",
    "  - Also extract if user says 'Yashaswini address is ...' or 'Swathi pan is ABCDE1234F' or 'Swathi occupation is Business'.",
    "  - If occupation is not explicitly stated, default it to 'Business'.",
    "  - ALWAYS include newShareholderDetails when you can extract any contact data, even partial.",
    "",
    "  - For qa, answer using the DATABASE CONTEXT below.",
    "  - NEVER ask for details already present in context or conversation.",
    "  - NEVER hallucinate values not in the conversation or context.",
    "  - Use the shareholder register and certificate data to match names (case-insensitive, partial OK).",
    "  - If extractedAttachment has company data, use it to populate companyDraft without re-asking.",
    "  - If user confirms (confirm/proceed/yes/go ahead), advance intent to process_transfer or create_company.",
    "  - missingFields: array of missing field name strings, only when required fields are absent.",
    "",
    `DATABASE CONTEXT (full live data): ${JSON.stringify(richContext)}`,
    `CONVERSATION: ${JSON.stringify(conversation)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Respond in JSON object only. No markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload.choices?.[0]?.message?.content || "";
  const json = extractJsonObject(content);
  if (!json) {
    return null;
  }

  const intentRaw = typeof json.intent === "string" ? json.intent : "unknown";
  const intent = (
    intentRaw === "qa" ||
    intentRaw === "draft_transfer" ||
    intentRaw === "process_transfer" ||
    intentRaw === "create_company" ||
    intentRaw === "revise_shareholding" ||
    intentRaw === "unknown"
  )
    ? (intentRaw as ParsedAssistantResult["intent"])
    : "unknown";

  // Parse newShareholderDetails extracted by OpenAI
  let newShareholderDetails: Record<string, NewShareholderContact> | undefined;
  if (json.newShareholderDetails && typeof json.newShareholderDetails === "object" && !Array.isArray(json.newShareholderDetails)) {
    newShareholderDetails = {};
    for (const [k, v] of Object.entries(json.newShareholderDetails as Record<string, unknown>)) {
      if (typeof v === "object" && v !== null) {
        const c = v as Record<string, unknown>;
        newShareholderDetails[k.trim().toLowerCase()] = {
          email: typeof c.email === "string" ? c.email.trim() : undefined,
          address: typeof c.address === "string" ? c.address.trim() : undefined,
          pan: typeof c.pan === "string" ? c.pan.trim().toUpperCase() : undefined,
          phone: typeof c.phone === "string" ? c.phone.trim() : undefined,
          occupation: typeof c.occupation === "string" ? c.occupation.trim() : undefined,
          fatherName: typeof c.fatherName === "string" ? c.fatherName.trim() : undefined,
        };
      }
    }
  }

  // Parse reviseHoldingPattern extracted by OpenAI
  const reviseHoldingPattern: ReviseHoldingEntry[] | undefined = Array.isArray(json.reviseHoldingPattern)
    ? (json.reviseHoldingPattern as unknown[])
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({
          name: typeof e.name === "string" ? e.name.replace(/^new[-\s]*/i, "").trim() : "",
          targetPct: typeof e.targetPct === "number" ? e.targetPct : Number(e.targetPct ?? 0),
        }))
        .filter((e) => e.name.length > 0 && e.targetPct >= 0)
    : undefined;

  return {
    intent,
    reply: typeof json.reply === "string" ? json.reply : "",
    transferDraft: parseTransferDraft(json.transferDraft),
    companyDraft: parseCompanyDraft(json.companyDraft),
    reviseHoldingPattern: reviseHoldingPattern?.length ? reviseHoldingPattern : undefined,
    newShareholderDetails: newShareholderDetails && Object.keys(newShareholderDetails).length ? newShareholderDetails : undefined,
    missingFields: Array.isArray(json.missingFields)
      ? json.missingFields.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

/**
 * Parse a free-text shareholding pattern like:
 *   "yashashvini- 33%, swathi- 5%, vijay- 10%, anand 19% remaining gopal"
 * into [{name, targetPct}].
 * "remaining" / "rest" / "balance" gets whatever is left after explicit entries.
 */
function parseTargetPattern(message: string): ReviseHoldingEntry[] {
  const entries: ReviseHoldingEntry[] = [];
  let remainingName: string | null = null;

  // Match "name - pct%" or "name pct%" patterns.
  // The name group captures 1-3 words to avoid grabbing entire sentences.
  const pctRegex = /([a-zA-Z][a-zA-Z]{1,20}(?:\s+[a-zA-Z]{1,20}){0,2})\s*[-–,:]?\s*(\d{1,3}(?:\.\d+)?)\s*%/g;
  let m = pctRegex.exec(message);
  while (m !== null) {
    const raw = m[1].trim().toLowerCase();
    // Skip stop-words and non-name matches
    if (!/(remaining|rest|balance|others?|captable|cap|table|pattern|shareholding|revised?|new|change|with)/i.test(raw)) {
      entries.push({ name: m[1].trim(), targetPct: Number(m[2]) });
    }
    m = pctRegex.exec(message);
  }

  // Find "remaining <name>" or "<name> remaining"
  const remainAfter = message.match(/remaining\s+([a-zA-Z][a-zA-Z .'-]{1,50})/i);
  const remainBefore = message.match(/([a-zA-Z][a-zA-Z .'-]{1,50})\s+remaining/i);
  if (remainAfter) {
    remainingName = remainAfter[1].trim();
  } else if (remainBefore) {
    const candidate = remainBefore[1].trim();
    // Avoid matching percentage words
    if (!/^\d+$/.test(candidate) && !/^(the|and|or|for|from|to)$/i.test(candidate)) {
      remainingName = candidate;
    }
  }

  if (remainingName) {
    const explicit = entries.reduce((s, e) => s + e.targetPct, 0);
    const remainder = Math.max(0, 100 - explicit);
    entries.push({ name: remainingName, targetPct: remainder });
  }

  // Validate: explicit sum must not exceed 100
  const total = entries.reduce((s, e) => s + e.targetPct, 0);
  if (total > 100.5) {
    // Return empty so caller can re-prompt
    return [];
  }

  return entries;
}

/**
 * Given a target pattern and current cap table, calculate the net share delta
 * per holder and plan the minimal set of peer-to-peer transfers needed.
 */
function planTransfersForPattern(
  target: ReviseHoldingEntry[],
  workspace: WorkspaceShape,
): { plannedTransfers: PlannedTransfer[]; missing: string[] } {
  const capTable = workspace.cap_table || [];
  const certs = (workspace.certificate_register || []).filter((c) => c.status === "ISSUED");
  const members = workspace.member_register || [];

  const totalShares = capTable.reduce((s, r) => s + Number(r.total_shares_held || 0), 0);
  if (totalShares === 0) {
    return { plannedTransfers: [], missing: ["No shares have been issued yet — issue initial allotments first."] };
  }

  // Normalize current holdings
  const currentHoldings = new Map<string, { shares: number; normalizedName: string; memberId?: number }>();
  for (const row of capTable) {
    const n = normalize(row.name);
    const memberId = fuzzyFind(members, (m) => m.name, row.name ?? "")?.id;
    currentHoldings.set(n, { shares: Number(row.total_shares_held || 0), normalizedName: n, memberId });
  }

  // Compute target shares per person — fuzzy-match names
  const deltas: Array<{ name: string; normalizedName: string; delta: number; memberId?: number }> = [];
  for (const entry of target) {
    const targetShares = Math.round((entry.targetPct / 100) * totalShares);
    // Fuzzy-find in current cap table
    const capRow = fuzzyFind(capTable, (r) => r.name, entry.name);
    const normalizedName = capRow ? normalize(capRow.name) : normalize(entry.name);
    const current = capRow ? Number(capRow.total_shares_held || 0) : 0;
    const memberId = capRow ? currentHoldings.get(normalizedName)?.memberId : undefined;
    const delta = targetShares - current;
    if (delta !== 0) {
      deltas.push({ name: capRow?.name ?? entry.name, normalizedName, delta, memberId });
    }
  }

  const givers = deltas.filter((d) => d.delta < 0).map((d) => ({ ...d, remaining: -d.delta }));
  const receivers = deltas.filter((d) => d.delta > 0).map((d) => ({ ...d, remaining: d.delta }));

  const plannedTransfers: PlannedTransfer[] = [];

  let gi = 0;
  let ri = 0;
  while (gi < givers.length && ri < receivers.length) {
    const giver = givers[gi];
    const receiver = receivers[ri];
    const sharesToMove = Math.min(giver.remaining, receiver.remaining);

    // Find a certificate for the giver (fuzzy name match)
    const cert = certs
      .filter((c) => {
        const cn = normalize(c.shareholder_name);
        return (cn === giver.normalizedName || cn.startsWith(giver.normalizedName) || giver.normalizedName.startsWith(cn))
          && Number(c.shares || 0) >= sharesToMove;
      })
      .sort((a, b) => Number(a.shares || 0) - Number(b.shares || 0))[0];

    plannedTransfers.push({
      from: giver.name,
      to: receiver.name,
      shares: sharesToMove,
      fromCertificateId: cert?.id,
      toMemberId: receiver.memberId,
    });

    giver.remaining -= sharesToMove;
    receiver.remaining -= sharesToMove;
    if (giver.remaining === 0) gi++;
    if (receiver.remaining === 0) ri++;
  }

  const missing: string[] = [];
  if (givers.some((g) => g.remaining > 0)) {
    missing.push("could not fully allocate shares from some givers — check issued certificate totals");
  }

  return { plannedTransfers, missing };
}

function summarisePlannedTransfers(transfers: PlannedTransfer[], pricePerShare?: number): string {
  if (!transfers.length) return "No transfers are needed — pattern is already satisfied.";
  const lines = [
    `${transfers.length} transfer(s) needed to implement the new pattern:`,
    ...transfers.map(
      (t, i) =>
        `  ${i + 1}. ${t.from} → ${t.to}: ${t.shares} shares` +
        (pricePerShare !== undefined ? ` @ ₹${pricePerShare}/share` : ""),
    ),
  ];
  return lines.join("\n");
}

function resolveTransfer(workspace: WorkspaceShape, draft: TransferDraft) {
  const missing: string[] = [];
  const members = workspace.member_register || [];
  const certificates = (workspace.certificate_register || []).filter((c) => c.status === "ISSUED");

  const fromName = draft.fromShareholderName?.trim();
  const toName = draft.toShareholderName?.trim();
  const shares = draft.shares;

  if (!fromName) {
    missing.push("transferor shareholder name");
  }
  if (!toName) {
    missing.push("transferee shareholder name");
  }
  if (!shares || shares <= 0) {
    missing.push("number of shares to transfer");
  }
  if (draft.pricePerShare === undefined || draft.pricePerShare < 0) {
    missing.push("price per share (use 0 for gift transfer)");
  }

  const normalizedFrom = normalize(fromName);
  const toMember = fuzzyFind(members, (m) => m.name, toName ?? "");

  let selectedCertificate: { id?: number; shareholder_name?: string; shares?: number } | undefined;
  if (normalizedFrom && shares && shares > 0) {
    const options = certificates
      .filter((c) => {
        const cn = normalize(c.shareholder_name);
        return (cn === normalizedFrom || cn.startsWith(normalizedFrom) || normalizedFrom.startsWith(cn))
          && Number(c.shares || 0) >= shares;
      })
      .sort((a, b) => Number(a.shares || 0) - Number(b.shares || 0));
    selectedCertificate = options[0];
  }

  if (fromName && !selectedCertificate) {
    missing.push("a valid issued certificate with enough shares for the transferor");
  }

  const transferDate = draft.transferDate || new Date().toISOString().slice(0, 10);

  const payload: Record<string, unknown> = {
    fromCertificateId: selectedCertificate?.id ?? 0,
    fromShareholderName: fromName,
    shares,
    transferDate,
    pricePerShare: draft.pricePerShare,
    witnessName: draft.witnessName || "",
    witnessAddress: draft.witnessAddress || "",
  };

  if (toMember?.id) {
    payload.toShareholderId = toMember.id;
  } else {
    if (!draft.toAddress) {
      missing.push("transferee address (required for new transferee)");
    }
    if (!draft.toEmail) {
      missing.push("transferee email (required for SH-4)");
    }
    payload.toName = toName;
    payload.toAddress = draft.toAddress;
    payload.toEmail = draft.toEmail;
    payload.toPan = draft.toPan || "";
    payload.toOccupation = draft.toOccupation || "Business";
  }

  return {
    missing,
    payload,
    summary: {
      fromName,
      toName,
      shares,
      pricePerShare: draft.pricePerShare,
      transferDate,
      fromCertificateId: selectedCertificate?.id,
      toMode: toMember?.id ? "existing" : "new",
    },
  };
}

export async function POST(request: Request) {
  const blocked = assertLocalBridgeRequest(request);
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as {
      companyId?: number | null;
      messages?: ChatMessage[];
      state?: AssistantState;
      extractedAttachment?: ExtractedAttachmentData | null;
    };

    const companyId = typeof body.companyId === "number" ? body.companyId : null;
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && typeof m.content === "string") : [];
    const previousState = body.state || {};
    const extractedAttachment = body.extractedAttachment || previousState.extractedAttachment || null;

    const workspace = await runBridge<WorkspaceShape>("workspace", {
      companyId,
    });
    const latestUserMessage = firstUserLine(messages);

    const openaiKey = process.env.OPENAI_API_KEY || "";
    const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!openaiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is missing. Add it in web/.env.local to use the chat assistant." },
        { status: 500 },
      );
    }

    const actionHint = inferActionHint({
      latestMessage: latestUserMessage,
      state: previousState,
      companyId,
    });
    const requiredDetails = requiredDetailsForAction(actionHint);

    const parsedFromModel = await parseWithOpenAI({
      apiKey: openaiKey,
      model: openaiModel,
      messages,
      workspace,
      actionHint,
      currentCompanyDraft: mergeCompanyDraft(previousState.companyDraft, companyDraftFromExtraction(extractedAttachment)),
      currentTransferDraft: previousState.transferDraft,
      currentReviseHoldingDraft: previousState.reviseHoldingDraft,
      extractedAttachment,
    });

    if (!parsedFromModel) {
      return NextResponse.json(
        { error: "OpenAI response could not be parsed. Please retry." },
        { status: 502 },
      );
    }

    const heuristicDraft = heuristicDraftFromMessage(latestUserMessage);
    const mergedDraft = mergeDraft(
      previousState.transferDraft,
      mergeDraft(parsedFromModel?.transferDraft, heuristicDraft),
    );

    const heuristicCompanyDraft = heuristicCompanyDraftFromMessage(latestUserMessage);
    const extractedCompanyDraft = companyDraftFromExtraction(extractedAttachment);
    const mergedCompanyDraft = mergeCompanyDraft(
      previousState.companyDraft,
      mergeCompanyDraft(mergeCompanyDraft(heuristicCompanyDraft, parsedFromModel?.companyDraft), extractedCompanyDraft),
    );

    // ── Intent routing: OpenAI is the primary signal; state draft is the fallback ──
    const intentFromAI = parsedFromModel?.intent ?? "unknown";

    // If an existing draft is in state, keep that flow alive regardless of AI intent
    // Also recover from history when user says "retry" with no active draft
    const isRetryRequest = /^\s*retry/i.test(latestUserMessage);
    const recoveredTransfers =
      isRetryRequest && !previousState.reviseHoldingDraft
        ? recoverFailedTransfers(messages)
        : [];

    const likelyReviseHolding =
      intentFromAI === "revise_shareholding" ||
      !!previousState.reviseHoldingDraft ||
      recoveredTransfers.length > 0;

    const likelyCompanyCreate =
      intentFromAI === "create_company" ||
      // keep alive when a draft is accumulating across turns
      (actionHint === "create_company" && !!mergedCompanyDraft && Object.keys(mergedCompanyDraft).length > 0);

    const likelyTransfer =
      !likelyReviseHolding &&
      !likelyCompanyCreate &&
      (intentFromAI === "draft_transfer" || intentFromAI === "process_transfer" || !!previousState.transferDraft);

    const likelyShareholdingQuestion = intentFromAI === "qa" && !likelyReviseHolding;

    if (!companyId && !likelyCompanyCreate && !likelyShareholdingQuestion && !likelyReviseHolding) {
      return NextResponse.json({
        reply: parsedFromModel.reply || "Select a company first for shareholding/SH-4 tasks, or ask me to create a new company.",
        state: {
          transferDraft: mergedDraft,
          companyDraft: mergedCompanyDraft,
          reviseHoldingDraft: previousState.reviseHoldingDraft ?? null,
          extractedAttachment,
          awaitingConfirmation: false,
        },
      });
    }

    if (likelyCompanyCreate || (mergedCompanyDraft && actionHint === "create_company")) {
      const creation = resolveCompanyCreate(mergedCompanyDraft || {});
      const firstSubscriber = firstSubscriberFromExtraction(extractedAttachment);
      if (creation.missing.length) {
        return NextResponse.json({
          reply: `I can create the company now. Please share: ${creation.missing.join(", ")}.`,
          state: {
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
          companySummary: creation.summary,
        });
      }

      const wantsExecution = isLikelyExecution(latestUserMessage);
      if (!wantsExecution) {
        const subscriberLine = firstSubscriber
          ? `\nFirst subscriber from MOA: ${firstSubscriber.name}${firstSubscriber.address ? `, ${firstSubscriber.address}` : ""}`
          : "\nNo subscriber shareholder was extracted from MOA.";
        return NextResponse.json({
          reply: (
            `I have all required company details. Reply "confirm" to create now.\n` +
            `Name: ${creation.summary.name}\n` +
            `CIN: ${creation.summary.cin}\n` +
            `Registered office: ${creation.summary.registered_office}\n` +
            `Director 1: ${creation.summary.director1_name}\n` +
            `Director 2: ${creation.summary.director2_name}` +
            subscriberLine
          ),
          state: {
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
          companySummary: creation.summary,
        });
      }

      const result = await runBridge<Record<string, unknown>>("save_company_basic", creation.payload);
      // Add all MOA subscribers as shareholders and issue their shares
      let subscriberResults: Array<{ folioNumber?: string | null; name?: string | null; shares?: number }> = [];
      const subscribers = Array.isArray(extractedAttachment?.subscribers)
        ? extractedAttachment.subscribers.filter(s => s && s.name && Number(s.shares) > 0)
        : [];
      for (const sub of subscribers) {
        // Create shareholder
        const created = await runBridge<Record<string, unknown>>("create_shareholder", {
          companyId: Number(result.companyId),
          name: sub.name,
          address: sub.address || "",
        });
        // Issue incorporation allotment certificate
        if (created && created.shareholderId && Number(sub.shares) > 0) {
          await runBridge<Record<string, unknown>>("issue_certificate", {
            companyId: Number(result.companyId),
            shareholderId: created.shareholderId,
            shares: Number(sub.shares),
            faceValue: creation.payload.face_value ?? 10,
            issueDate: creation.payload.date_of_incorporation || undefined,
            status: "ISSUED",
          });
        }
        subscriberResults.push({
          folioNumber: typeof created.folioNumber === "string" ? created.folioNumber : null,
          name: sub.name,
          shares: Number(sub.shares),
        });
      }
      // If no valid subscribers, fallback to firstSubscriber logic for legacy cases
      if (subscriberResults.length === 0 && firstSubscriber) {
        const created = await runBridge<Record<string, unknown>>("create_shareholder", {
          companyId: Number(result.companyId),
          name: firstSubscriber.name,
          address: firstSubscriber.address,
        });
        subscriberResults.push({
          folioNumber: typeof created.folioNumber === "string" ? created.folioNumber : null,
          name: firstSubscriber.name,
        });
      }
      // Rebuild cap table after all subscribers and certificates
      await runBridge("rebuild_cap_table", { companyId: Number(result.companyId) });
      return NextResponse.json({
        reply:
          `Company ${String(result.name || "created")} has been created successfully.` +
          (subscriberResults.length
            ? ` Subscribers captured: ${subscriberResults.map(s => `${s.name}${s.shares ? ` (${s.shares} shares)` : ""}${s.folioNumber ? ` [Folio ${s.folioNumber}]` : ""}`).join(", ")}.`
            : ""),
        state: {
          transferDraft: mergedDraft,
          companyDraft: null,
          extractedAttachment,
          awaitingConfirmation: false,
        },
        result,
      });
    }

    if (likelyReviseHolding) {
      // OpenAI extracts the pattern; fall back to local regex parser if model returns nothing
      const parsedPattern =
        (parsedFromModel?.reviseHoldingPattern?.length ?? 0) > 0
          ? parsedFromModel!.reviseHoldingPattern!
          : parseTargetPattern(latestUserMessage);
      const existingDraft: ReviseHoldingDraft | null | undefined =
        recoveredTransfers.length > 0
          ? {
              targetPattern: [],
              plannedTransfers: recoveredTransfers,
              pricePerShare: (() => {
                // Try to recover price from conversation history
                for (const msg of [...messages].reverse()) {
                  const m = msg.content.match(/₹([\d.]+)\/share/);
                  if (m) return Number(m[1]);
                }
                return 0;
              })(),
              transferDate: new Date().toISOString().slice(0, 10),
              newShareholderDetails: parsedFromModel?.newShareholderDetails ?? {},
            }
          : previousState.reviseHoldingDraft;

      // Extract price per share from message.
      // Accept: "price per share 10", "pps 10", "at Rs.10", or a bare number reply when awaiting price.
      const ppsMsgMatch = latestUserMessage.match(
        /(?:price\s*per\s*share|pps|at)\s*(?:rs\.?|₹|inr)?\s*(\d+(?:\.\d+)?)/i,
      );
      const bareNumberMatch = !ppsMsgMatch ? latestUserMessage.match(/^\s*(\d+(?:\.\d+)?)\s*$/) : null;
      const dateMatch = latestUserMessage.match(/(\d{4}-\d{2}-\d{2})/);

      const targetPattern = parsedPattern.length > 0 ? parsedPattern : (existingDraft?.targetPattern ?? []);

      // Accept bare number as price only when draft exists without a price yet (user answered the question)
      const pricePerShare =
        ppsMsgMatch ? Number(ppsMsgMatch[1]) :
        (bareNumberMatch && existingDraft && existingDraft.pricePerShare === undefined) ? Number(bareNumberMatch[1]) :
        existingDraft?.pricePerShare !== undefined ? existingDraft.pricePerShare :
        undefined;
      const transferDate = dateMatch ? dateMatch[1] : (existingDraft?.transferDate ?? new Date().toISOString().slice(0, 10));

      if (targetPattern.length === 0) {
        const invalidSum = parseTargetPattern(latestUserMessage).length === 0 && /\d+\s*%/.test(latestUserMessage);
        return NextResponse.json({
          reply: invalidSum
            ? "The percentages you entered add up to more than 100%. Please re-enter the pattern (e.g. \"Yashashvini 33%, Swathi 5%, remaining Gopal\")."
            : "Please describe the new shareholding pattern, e.g.: \"revised captable Yashashvini 33%, Swathi 5%, remaining Gopal\"",
          state: { ...previousState, extractedAttachment },
        });
      }

      // Merge new shareholder contact details from:
      // 1. Previously stored in draft
      // 2. Extracted from this turn's message via OpenAI
      // 3. Extracted from uploaded KYC document (person_* fields in extractedAttachment)
      const mergedContacts: Record<string, NewShareholderContact> = {
        ...(existingDraft?.newShareholderDetails ?? {}),
        ...(parsedFromModel?.newShareholderDetails ?? {}),
      };
      // Auto-import from KYC document attachment
      if (extractedAttachment?.person_name) {
        const key = normalize(extractedAttachment.person_name);
        if (key) {
          mergedContacts[key] = {
            ...(mergedContacts[key] ?? {}),
            address: extractedAttachment.person_address || mergedContacts[key]?.address,
            pan: extractedAttachment.person_pan || mergedContacts[key]?.pan,
            email: extractedAttachment.person_email || mergedContacts[key]?.email,
            phone: extractedAttachment.person_phone || mergedContacts[key]?.phone,
            fatherName: extractedAttachment.person_father_name || mergedContacts[key]?.fatherName,
          };
          // occupation is not extracted from KYC docs; keep whatever was stated by the user
        }
      }

      // Compute the planned transfers
      const { plannedTransfers, missing } = planTransfersForPattern(targetPattern, workspace);

      if (missing.length) {
        return NextResponse.json({
          reply: `I analysed the new pattern but hit an issue: ${missing.join("; ")}`,
          state: {
            reviseHoldingDraft: { targetPattern, pricePerShare, transferDate, newShareholderDetails: mergedContacts },
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: false,
          },
        });
      }

      // If we don't have price yet, ask for it
      if (pricePerShare === undefined) {
        const updatedDraft: ReviseHoldingDraft = { targetPattern, plannedTransfers, transferDate, newShareholderDetails: mergedContacts };
        return NextResponse.json({
          reply:
            `New pattern parsed. ${summarisePlannedTransfers(plannedTransfers)}\n\n` +
            `What is the price per share? (Enter 0 for gift / off-market transfers.)`,
          state: {
            reviseHoldingDraft: updatedDraft,
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
        });
      }

      // Show plan and ask for confirmation unless already confirmed
      const wantsExecution = isLikelyExecution(latestUserMessage);
      const updatedDraft: ReviseHoldingDraft = { targetPattern, plannedTransfers, pricePerShare, transferDate, newShareholderDetails: mergedContacts };

      if (!wantsExecution && parsedPattern.length > 0) {
        // Just parsed a new pattern, show it and ask for price/confirm
        return NextResponse.json({
          reply:
            `New shareholding pattern understood.\n` +
            `${summarisePlannedTransfers(plannedTransfers, pricePerShare)}\n\n` +
            `Reply "confirm" to process all ${plannedTransfers.length} SH-4 transfer(s), or adjust the pattern.`,
          state: {
            reviseHoldingDraft: updatedDraft,
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
        });
      }

      if (!wantsExecution) {
        return NextResponse.json({
          reply:
            summarisePlannedTransfers(plannedTransfers, pricePerShare) +
            `\n\nReply "confirm" to process all ${plannedTransfers.length} SH-4 transfer(s).`,
          state: {
            reviseHoldingDraft: updatedDraft,
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
        });
      }

      // Before executing, check if any receiver is a new (unregistered) shareholder without minimum contact info
      const unknownReceivers = plannedTransfers.filter(
        (t) => !fuzzyFind(workspace.member_register || [], (m) => m.name, t.to),
      );

      // Build list of receivers still missing required contact info
      // We need at least an email for SH-4; address is preferred but not hard-blocked
      const stillMissingContacts: string[] = [];
      for (const t of unknownReceivers) {
        const key = normalize(t.to);
        // Also try fuzzy key match in mergedContacts
        const contactKey = Object.keys(mergedContacts).find(
          (k) => k === key || k.startsWith(key) || key.startsWith(k),
        );
        const contact = contactKey ? mergedContacts[contactKey] : undefined;
        if (!contact?.email && !contact?.address) {
          stillMissingContacts.push(t.to);
        }
      }

      // Deduplicate
      const stillMissingUniq = [...new Set(stillMissingContacts)];
      if (stillMissingUniq.length > 0) {
        const alreadyHave = unknownReceivers
          .filter((t) => !stillMissingContacts.includes(t.to))
          .map((t) => t.to);
        const replyLines = [
          `Please provide contact details for the new shareholder(s): ${stillMissingUniq.join(", ")}.`,
          `You can type: "Yashaswini email yashaswinidadhirao@gmail.com, address 12 Main St Bangalore"`,
          `Or upload their Aadhaar / PAN card as an attachment.`,
        ];
        if (alreadyHave.length) {
          replyLines.push(`(Already have details for: ${alreadyHave.join(", ")})`);
        }
        return NextResponse.json({
          reply: replyLines.join("\n"),
          state: {
            reviseHoldingDraft: updatedDraft,
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
        });
      }

      // Execute all planned transfers sequentially
      const results: string[] = [];
      const errors: string[] = [];
      for (const t of plannedTransfers) {
        const toMember = fuzzyFind(workspace.member_register || [], (m) => m.name, t.to);
        const fromCert = (workspace.certificate_register || [])
          .filter((c) => {
            const cn = normalize(c.shareholder_name);
            const fn = normalize(t.from);
            return c.status === "ISSUED" && (cn === fn || cn.startsWith(fn) || fn.startsWith(cn)) && Number(c.shares || 0) >= t.shares;
          })
          .sort((a, b) => Number(a.shares || 0) - Number(b.shares || 0))[0];

        // Resolve contact details for new shareholder
        const toKey = normalize(t.to);
        const contactKey = Object.keys(mergedContacts).find(
          (k) => k === toKey || k.startsWith(toKey) || toKey.startsWith(k),
        );
        const contact = contactKey ? mergedContacts[contactKey] : undefined;

        const transferPayload: Record<string, unknown> = {
          companyId,
          shares: t.shares,
          transferDate,
          pricePerShare,
          fromCertificateId: fromCert?.id ?? t.fromCertificateId ?? 0,
          fromShareholderName: t.from,   // fallback: backend re-resolves if cert is no longer ISSUED
          witnessName: "",
          witnessAddress: "",
        };
        if (toMember?.id) {
          transferPayload.toShareholderId = toMember.id;
        } else {
          transferPayload.toName = t.to;
          transferPayload.toAddress = contact?.address || "";
          transferPayload.toEmail = contact?.email || "";
          transferPayload.toPan = contact?.pan || "";
          transferPayload.toMobile = contact?.phone || "";
          transferPayload.toOccupation = contact?.occupation || "Business";
          transferPayload.toFatherHusbandName = contact?.fatherName || "";
        }

        try {
          const res = await runBridge<Record<string, unknown>>("process_transfer", transferPayload);
          results.push(`${t.from} → ${t.to}: ${t.shares} shares (SH-4 ${String(res.transferNumber || "processed")})`);
        } catch (err) {
          errors.push(`${t.from} → ${t.to}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }

      const replyLines = [`Cap table revision processed.`];
      if (results.length) replyLines.push(`\nCompleted:\n${results.map((r) => `  ✓ ${r}`).join("\n")}`);
      if (errors.length) {
        replyLines.push(`\nFailed:\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`);
        replyLines.push(`\nType "retry" to attempt the failed transfer(s) again.`);
      }

      // If some transfers failed, keep the draft alive with only the failed ones
      // so the user can type "retry" to try again.
      const failedNames = new Set(errors.map((e) => e.split("→")[1]?.split(":")[0]?.trim()));
      const failedTransfers = errors.length > 0
        ? plannedTransfers.filter((t) => failedNames.has(t.to) || failedNames.has(t.to.toUpperCase()))
        : [];
      const retryDraft: ReviseHoldingDraft | null = failedTransfers.length > 0
        ? { ...updatedDraft, plannedTransfers: failedTransfers }
        : null;

      return NextResponse.json({
        reply: replyLines.join(""),
        // result key triggers onTransferProcessed() → refreshes workspace in UI
        result: { revised: true, completedTransfers: results.length, failedTransfers: errors.length },
        state: {
          reviseHoldingDraft: retryDraft,
          transferDraft: null,
          companyDraft: mergedCompanyDraft,
          extractedAttachment,
          awaitingConfirmation: retryDraft !== null,
        },
      });
    }

    if (!likelyTransfer && likelyShareholdingQuestion) {
      return NextResponse.json({
        reply: renderShareholdingPattern(
          workspace,
          extractedAttachment,
          extractedAttachment?.company_name || workspace.company?.name || null,
        ),
        state: {
          transferDraft: mergedDraft,
          companyDraft: mergedCompanyDraft,
          extractedAttachment,
          awaitingConfirmation: false,
        },
      });
    }

    if (likelyTransfer || mergedDraft) {
      const resolution = resolveTransfer(workspace, mergedDraft || {});
      if (resolution.missing.length) {
        const ask = `I can prepare SH-4 now. Please share: ${resolution.missing.join(", ")}.`;
        return NextResponse.json({
          reply: ask,
          state: {
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
          transferSummary: resolution.summary,
        });
      }

      const wantsExecution = isLikelyExecution(latestUserMessage) || parsedFromModel?.intent === "process_transfer";
      if (!wantsExecution) {
        return NextResponse.json({
          reply: (
            `I have all details for SH-4. Reply "confirm" to process now.\n` +
            `Transferor: ${resolution.summary.fromName}\n` +
            `Transferee: ${resolution.summary.toName}\n` +
            `Shares: ${resolution.summary.shares}\n` +
            `Price per share: ${resolution.summary.pricePerShare}\n` +
            `Transfer date: ${resolution.summary.transferDate}`
          ),
          state: {
            transferDraft: mergedDraft,
            companyDraft: mergedCompanyDraft,
            extractedAttachment,
            awaitingConfirmation: true,
          },
          transferSummary: resolution.summary,
        });
      }

      const result = await runBridge<Record<string, unknown>>("process_transfer", {
        companyId,
        ...resolution.payload,
        // Inject father name from KYC attachment or AI-parsed contacts for new transferees
        toFatherHusbandName: (() => {
          if (resolution.payload.toShareholderId) return undefined; // existing shareholder — DB has it
          const toKey = normalize(resolution.summary.toName ?? "");
          const aiContacts = parsedFromModel?.newShareholderDetails ?? {};
          const contactKey = Object.keys(aiContacts).find(
            (k) => k === toKey || toKey.startsWith(k.slice(0, 6)) || k.startsWith(toKey.slice(0, 6))
          );
          return (contactKey ? aiContacts[contactKey]?.fatherName : undefined)
            || extractedAttachment?.person_father_name
            || "";
        })(),
      });
      return NextResponse.json({
        reply:
          `SH-4 processed successfully. Transfer number ${String(result.transferNumber || "generated")}. ` +
          `New certificate created and registers/audit updated.`,
        state: {
          transferDraft: null,
          companyDraft: mergedCompanyDraft,
          extractedAttachment,
          awaitingConfirmation: false,
        },
        result,
      });
    }

    return NextResponse.json({
      reply: parsedFromModel.reply || "I can help with current shareholding, company setup, and SH-4 transfer processing.",
      state: {
        transferDraft: mergedDraft,
        companyDraft: mergedCompanyDraft,
        extractedAttachment,
        awaitingConfirmation: previousState.awaitingConfirmation || false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Assistant request failed." },
      { status: 500 },
    );
  }
}
