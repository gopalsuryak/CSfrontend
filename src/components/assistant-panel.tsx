"use client";

import { useMemo, useRef, useState } from "react";
import { Bot, Paperclip, Send, Sparkles, User, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantState = {
  transferDraft?: Record<string, unknown> | null;
  companyDraft?: Record<string, unknown> | null;
  reviseHoldingDraft?: Record<string, unknown> | null;
  extractedAttachment?: ExtractedAttachmentData | null;
  awaitingConfirmation?: boolean;
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
  person_address?: string;
  person_email?: string;
  person_phone?: string;
};

type ChatCache = { messages: ChatMessage[]; draftState: AssistantState };

const CACHE_PREFIX = "sharedesk_chat_v1_";

function saveCache(cid: number, messages: ChatMessage[], state: AssistantState) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${cid}`, JSON.stringify({ messages, draftState: state }));
  } catch { /* storage quota or unavailable */ }
}

function loadCache(cid: number): ChatCache | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${cid}`);
    return raw ? (JSON.parse(raw) as ChatCache) : null;
  } catch { return null; }
}

export function AssistantPanel({
  companyId,
  companyName,
  onTransferProcessed,
}: {
  companyId: number | null;
  companyName: string | null | undefined;
  onTransferProcessed: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I am your ShareDesk assistant. Select a company, then ask for shareholding pattern or describe a transfer and I will collect missing details before processing SH-4.",
    },
  ]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(companyId);
  const [draftState, setDraftState] = useState<AssistantState>({
    transferDraft: null,
    reviseHoldingDraft: null,
    awaitingConfirmation: false,
  });

  // Reset draft state and conversation when the user switches companies
  if (companyId !== activeCompanyId) {
    // Persist current company's session before switching
    if (activeCompanyId !== null) {
      saveCache(activeCompanyId, messages, draftState);
    }
    setActiveCompanyId(companyId);
    // Restore previous session for the new company, or start fresh
    const cached = companyId ? loadCache(companyId) : null;
    if (cached) {
      setMessages(cached.messages);
      setDraftState(cached.draftState);
    } else {
      setDraftState({ transferDraft: null, reviseHoldingDraft: null, awaitingConfirmation: false });
      setMessages([
        {
          role: "assistant",
          content: companyId
            ? `Switched to ${companyName || "selected company"}. How can I help?`
            : "No company selected. Ask me to create a company or attach incorporation documents.",
        },
      ]);
    }
  }
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const placeholder = useMemo(() => {
    if (!companyId) {
      return "No company selected. Ask me to create a company, or attach COI/MOA/AOA and I will draft it.";
    }
    return "Ask anything: current shareholding pattern, or transfer 50 shares from A to B...";
  }, [companyId]);

  function mapFilesToExtractForm(files: File[]) {
    const form = new FormData();
    const used = new Set<number>();

    const keywordSlots: Array<{ field: "coi" | "moa" | "aoa"; keywords: string[] }> = [
      { field: "coi", keywords: ["coi", "certificate of incorporation", "incorporation"] },
      { field: "moa", keywords: ["moa", "memorandum"] },
      { field: "aoa", keywords: ["aoa", "articles"] },
    ];

    for (const slot of keywordSlots) {
      const index = files.findIndex((file, fileIndex) => {
        if (used.has(fileIndex)) {
          return false;
        }
        const name = file.name.toLowerCase();
        return slot.keywords.some((keyword) => name.includes(keyword));
      });
      if (index >= 0) {
        form.append(slot.field, files[index]);
        used.add(index);
      }
    }

    const remaining = files.filter((_, index) => !used.has(index));
    const emptyFields = ["coi", "moa", "aoa"].filter((field) => !form.has(field));
    for (let index = 0; index < remaining.length && index < emptyFields.length; index += 1) {
      form.append(emptyFields[index], remaining[index]);
    }

    return form;
  }

  /** Returns true if a file looks like a KYC / identity document rather than a company doc */
  function isKycFile(file: File) {
    const name = file.name.toLowerCase();
    return /(aadhaar|aadhar|pan|passport|kyc|id[\s_-]?card|identity|voter)/i.test(name)
      && !/(coi|moa|aoa|certificate|memorandum|article)/i.test(name);
  }

  async function send() {
    const content = input.trim();
    if ((!content && attachments.length === 0) || busy) {
      return;
    }

    let composedContent = content || "Please use the attached documents to help with company setup.";
    let extractedAttachment: ExtractedAttachmentData | null = null;

    if (attachments.length > 0) {
      const kycFiles = attachments.filter(isKycFile);
      const companyFiles = attachments.filter((f) => !isKycFile(f));

      // Extract KYC / person documents
      if (kycFiles.length > 0) {
        const kycForm = new FormData();
        kycFiles.forEach((f) => kycForm.append("file", f));
        try {
          const kycResp = await fetch("/api/bridge/intake/extract-person", { method: "POST", body: kycForm });
          const kycPayload = (await kycResp.json()) as { extracted?: Record<string, unknown>; error?: string };
          if (kycResp.ok && kycPayload.extracted) {
            extractedAttachment = { ...(extractedAttachment ?? {}), ...(kycPayload.extracted as ExtractedAttachmentData) };
            composedContent += "\n\nI have attached KYC/identity document(s). Use the extracted person details from attachment context.";
          } else if (kycPayload.error) {
            composedContent += `\n\nKYC attachment note: extraction failed (${kycPayload.error}).`;
          }
        } catch {
          composedContent += "\n\nKYC attachment note: extraction request failed.";
        }
      }

      // Extract company incorporation documents
      if (companyFiles.length > 0) {
        const extractionForm = mapFilesToExtractForm(companyFiles);
        try {
          const extractResponse = await fetch("/api/bridge/intake/extract", {
            method: "POST",
            body: extractionForm,
          });
          const extractPayload = (await extractResponse.json()) as {
            extracted?: Record<string, unknown>;
            error?: string;
          };
          if (extractResponse.ok && extractPayload.extracted) {
            extractedAttachment = { ...(extractedAttachment ?? {}), ...(extractPayload.extracted as ExtractedAttachmentData) };
            composedContent += "\n\nI have attached incorporation documents. Use extracted fields from attachment context.";
          } else if (extractPayload.error) {
            composedContent += `\n\nAttachment note: extraction failed (${extractPayload.error}).`;
          }
        } catch {
          composedContent += "\n\nAttachment note: extraction request failed.";
        }
      }

      // Fallback: if no recognized type, try company extraction on all files
      if (kycFiles.length === 0 && companyFiles.length === 0 && attachments.length > 0) {
        const extractionForm = mapFilesToExtractForm(attachments);
        try {
          const extractResponse = await fetch("/api/bridge/intake/extract", { method: "POST", body: extractionForm });
          const extractPayload = (await extractResponse.json()) as { extracted?: Record<string, unknown>; error?: string };
          if (extractResponse.ok && extractPayload.extracted) {
            extractedAttachment = extractPayload.extracted as ExtractedAttachmentData;
            composedContent += "\n\nI have attached documents. Use extracted fields from attachment context.";
          }
        } catch { /* ignore */ }
      }
    }

    const nextMessages = [...messages, { role: "user" as const, content: composedContent }];
    setMessages(nextMessages);
    setInput("");
    setAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setBusy(true);

    try {
      const response = await fetch("/api/bridge/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId ?? null,
          messages: nextMessages,
          state: draftState,
          extractedAttachment,
        }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
        state?: AssistantState;
        result?: Record<string, unknown>;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Assistant request failed.");
      }

      const reply = payload.reply || "I could not generate a response.";
      const finalMessages = [...nextMessages, { role: "assistant" as const, content: reply }];
      const finalState: AssistantState = payload.state ?? draftState;
      setMessages(finalMessages);
      setDraftState(finalState);
      if (companyId) saveCache(companyId, finalMessages, finalState);
      if (payload.result) {
        onTransferProcessed();
      }
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Failed to contact assistant.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-0">
        <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#f6fbff_0%,#eef7ff_45%,#f6fffb_100%)] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-100 text-blue-700">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">AI Secretarial Assistant</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {companyId
                    ? `Live on ${companyName || "selected company"}. Ask questions, draft new patterns, and process SH-4 from chat.`
                    : "No company selected. Start by asking me to create a company or attach incorporation documents."}
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Sparkles className="h-3.5 w-3.5" /> Guided mode
            </div>
          </div>
        </div>

        <div className="h-[360px] overflow-y-auto p-5">
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" ? (
                  <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-900 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                ) : null}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "user"
                      ? "bg-blue-700 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  {message.content}
                </div>
                {message.role === "user" ? (
                  <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700">
                    <User className="h-4 w-4" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 p-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              setAttachments(files.slice(0, 3));
            }}
          />
          {attachments.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                  <Paperclip className="h-3 w-3" />
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              disabled={busy}
              placeholder={placeholder}
              className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none ring-0 transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="h-12 rounded-2xl"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button onClick={send} disabled={busy || (!input.trim() && attachments.length === 0)} className="h-12 rounded-2xl bg-blue-700 px-5 hover:bg-blue-800">
              <Send className="mr-2 h-4 w-4" />
              {busy ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
