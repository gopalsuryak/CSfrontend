"use client";

import { useMemo, useRef, useState } from "react";
import { UploadCloud, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ExtractedData = {
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
  _openai_error?: string;
};

type CompanyForm = {
  name: string;
  cin: string;
  date_of_incorporation: string;
  registered_office: string;
  authorized_capital: string;
  class_of_shares: string;
  transfer_restrictions: string;
  face_value: string;
  premium: string;
  director1_name: string;
  director2_name: string;
  secretary_name: string;
};

type ShareholderForm = {
  name: string;
  father_husband_name: string;
  address: string;
  pan: string;
  aadhaar: string;
  mobile: string;
  email: string;
};

const defaultCompanyForm: CompanyForm = {
  name: "",
  cin: "",
  date_of_incorporation: "",
  registered_office: "",
  authorized_capital: "0",
  class_of_shares: "Equity",
  transfer_restrictions: "",
  face_value: "10",
  premium: "0",
  director1_name: "",
  director2_name: "",
  secretary_name: "",
};

const defaultShareholderForm: ShareholderForm = {
  name: "",
  father_husband_name: "",
  address: "",
  pan: "",
  aadhaar: "",
  mobile: "",
  email: "",
};

function toCompanyForm(extracted: ExtractedData): CompanyForm {
  return {
    name: String(extracted.company_name || ""),
    cin: String(extracted.cin || ""),
    date_of_incorporation: String(extracted.date_of_incorporation || ""),
    registered_office: String(extracted.registered_office || ""),
    authorized_capital: String(extracted.authorized_capital || 0),
    class_of_shares: String(extracted.class_of_shares || "Equity"),
    transfer_restrictions: String(extracted.transfer_restrictions || ""),
    face_value: String(extracted.face_value || 10),
    premium: "0",
    director1_name: String(extracted.director1_name || ""),
    director2_name: String(extracted.director2_name || ""),
    secretary_name: String(extracted.secretary_name || ""),
  };
}

function toShareholderForm(extracted: ExtractedData): Partial<ShareholderForm> {
  const firstSubscriber = Array.isArray(extracted.subscribers) && extracted.subscribers.length > 0
    ? extracted.subscribers[0]
    : null;

  return {
    name: String(firstSubscriber?.name || extracted.director1_name || ""),
    address: String(firstSubscriber?.address || extracted.registered_office || ""),
  };
}

export function IntakeWorkbench({
  activeCompanyId,
  onCompanyChanged,
  onRefreshRequested,
}: {
  activeCompanyId: number | null;
  onCompanyChanged: (companyId: number) => void;
  onRefreshRequested: () => void;
}) {
  const [extractBusy, setExtractBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [shareholderBusy, setShareholderBusy] = useState(false);
  const [autoCaptureBusy, setAutoCaptureBusy] = useState(false);
  const [extractMessage, setExtractMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [shareholderMessage, setShareholderMessage] = useState("");
  const [autoExtractEnabled, setAutoExtractEnabled] = useState(true);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(defaultCompanyForm);
  const [shareholderForm, setShareholderForm] = useState<ShareholderForm>(defaultShareholderForm);
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const extractFormRef = useRef<HTMLFormElement | null>(null);
  const autoExtractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canCreateShareholder = useMemo(() => {
    return Boolean(activeCompanyId) && shareholderForm.name.trim().length > 0;
  }, [activeCompanyId, shareholderForm.name]);

  async function handleExtract(formData: FormData) {
    setExtractBusy(true);
    setExtractMessage("");
    try {
      const response = await fetch("/api/bridge/intake/extract", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { extracted?: ExtractedData; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Extraction failed.");
      }
      const extractedData = payload.extracted || {};
      setExtracted(extractedData);
      setCompanyForm(toCompanyForm(extractedData));
      setShareholderForm((previous) => {
        const autoShareholder = toShareholderForm(extractedData);
        return {
          ...previous,
          name: previous.name || autoShareholder.name || "",
          address: previous.address || autoShareholder.address || "",
        };
      });
      if (extractedData._openai_error) {
        setExtractMessage(`Extraction completed with fallback: ${extractedData._openai_error}`);
      } else {
        setExtractMessage("Extraction completed. Company and subscriber details have been auto-captured where available.");
      }
    } catch (error) {
      setExtractMessage(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setExtractBusy(false);
    }
  }

  async function triggerAutoExtract() {
    if (!autoExtractEnabled || extractBusy || !extractFormRef.current) {
      return;
    }
    const formData = new FormData(extractFormRef.current);
    const hasAnyFile = ["coi", "moa", "aoa"].some((key) => {
      const file = formData.get(key);
      return file instanceof File && file.size > 0;
    });
    if (!hasAnyFile) {
      return;
    }
    await handleExtract(formData);
  }

  function scheduleAutoExtract() {
    if (!autoExtractEnabled) {
      return;
    }
    if (autoExtractTimerRef.current) {
      clearTimeout(autoExtractTimerRef.current);
    }
    autoExtractTimerRef.current = setTimeout(() => {
      void triggerAutoExtract();
    }, 450);
  }

  async function handleSaveCompany() {
    setSaveBusy(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/bridge/company/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...companyForm,
          companyId: activeCompanyId ?? undefined,
          authorized_capital: Number(companyForm.authorized_capital || 0),
          face_value: Number(companyForm.face_value || 10),
          premium: Number(companyForm.premium || 0),
        }),
      });
      const payload = (await response.json()) as { companyId?: number; error?: string };
      if (!response.ok || !payload.companyId) {
        throw new Error(payload.error || "Failed to save company.");
      }
      let summary = "Company saved successfully.";
      if (!activeCompanyId && extracted) {
        const subscriberCount = await createSubscribersAndAllotments(
          payload.companyId,
          extracted,
          companyForm.date_of_incorporation,
        );
        if (subscriberCount > 0) {
          summary += ` ${subscriberCount} subscriber allotment(s) created.`;
        }
      }
      setSaveMessage(summary);
      onCompanyChanged(payload.companyId);
      onRefreshRequested();
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Failed to save company.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveCompanyPayload(payload: CompanyForm): Promise<number> {
    const response = await fetch("/api/bridge/company/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        companyId: activeCompanyId ?? undefined,
        authorized_capital: Number(payload.authorized_capital || 0),
        face_value: Number(payload.face_value || 10),
        premium: Number(payload.premium || 0),
      }),
    });
    const saveResult = (await response.json()) as { companyId?: number; error?: string };
    if (!response.ok || !saveResult.companyId) {
      throw new Error(saveResult.error || "Failed to save company.");
    }
    return saveResult.companyId;
  }

  async function createShareholderPayload(companyId: number, payload: Partial<ShareholderForm>) {
    if (!payload.name?.trim()) {
      return null;
    }
    const response = await fetch("/api/bridge/shareholder/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        name: payload.name,
        father_husband_name: payload.father_husband_name || "",
        address: payload.address || "",
        pan: payload.pan || "",
        aadhaar: payload.aadhaar || "",
        mobile: payload.mobile || "",
        email: payload.email || "",
      }),
    });
    const shareholderResult = (await response.json()) as { folioNumber?: string; error?: string };
    if (!response.ok) {
      throw new Error(shareholderResult.error || "Failed to create subscriber shareholder.");
    }
    return shareholderResult.folioNumber || null;
  }

  async function createSubscribersAndAllotments(companyId: number, extractedData: ExtractedData, issueDate: string) {
    const subscribers = Array.isArray(extractedData.subscribers)
      ? extractedData.subscribers.filter((row) => row?.name && Number(row.shares) > 0)
      : [];

    let createdCount = 0;
    for (const subscriber of subscribers) {
      const createResponse = await fetch("/api/bridge/shareholder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: subscriber.name,
          address: subscriber.address || "",
        }),
      });
      const createPayload = (await createResponse.json()) as { shareholderId?: number; error?: string };
      if (!createResponse.ok || !createPayload.shareholderId) {
        throw new Error(createPayload.error || `Failed to create subscriber ${subscriber.name || ""}.`);
      }

      const issueResponse = await fetch("/api/bridge/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          shareholderId: createPayload.shareholderId,
          shares: Number(subscriber.shares),
          issueDate: issueDate || undefined,
        }),
      });
      const issuePayload = (await issueResponse.json()) as { error?: string };
      if (!issueResponse.ok) {
        throw new Error(issuePayload.error || `Failed to issue shares for ${subscriber.name || ""}.`);
      }
      createdCount += 1;
    }

    return createdCount;
  }

  async function runAutoCaptureAndSave() {
    if (!extractFormRef.current) {
      setExtractMessage("Upload at least one document to start automation.");
      return;
    }

    setAutoCaptureBusy(true);
    setExtractMessage("");
    setSaveMessage("");
    setShareholderMessage("");

    try {
      const extractionFormData = new FormData(extractFormRef.current);
      const hasAnyFile = ["coi", "moa", "aoa"].some((key) => {
        const file = extractionFormData.get(key);
        return file instanceof File && file.size > 0;
      });
      if (!hasAnyFile) {
        throw new Error("Upload at least one document before running automation.");
      }

      setExtractBusy(true);
      const extractResponse = await fetch("/api/bridge/intake/extract", {
        method: "POST",
        body: extractionFormData,
      });
      const extractPayload = (await extractResponse.json()) as { extracted?: ExtractedData; error?: string };
      if (!extractResponse.ok) {
        throw new Error(extractPayload.error || "Extraction failed.");
      }

      const extractedData = extractPayload.extracted || {};
      const companyPayload = toCompanyForm(extractedData);
      const shareholderPayload = toShareholderForm(extractedData);

      setExtracted(extractedData);
      setCompanyForm(companyPayload);
      setShareholderForm((previous) => ({
        ...previous,
        name: previous.name || shareholderPayload.name || "",
        address: previous.address || shareholderPayload.address || "",
      }));

      const companyId = await saveCompanyPayload(companyPayload);
      onCompanyChanged(companyId);
      setSaveMessage("Company auto-saved from extracted data.");

      if (!activeCompanyId) {
        const subscriberCount = await createSubscribersAndAllotments(
          companyId,
          extractedData,
          companyPayload.date_of_incorporation,
        );
        if (subscriberCount > 0) {
          setShareholderMessage(`${subscriberCount} subscriber shareholder(s) created with initial allotments.`);
        } else {
          const folioNumber = await createShareholderPayload(companyId, shareholderPayload);
          if (folioNumber) {
            setShareholderMessage(`First subscriber shareholder created. Folio ${folioNumber}.`);
          } else {
            setShareholderMessage("No subscriber name found in documents. Shareholder was not auto-created.");
          }
        }
      } else {
        setShareholderMessage("Company updated from extracted data.");
      }

      if (extractedData._openai_error) {
        setExtractMessage(`Auto-capture completed with fallback: ${extractedData._openai_error}`);
      } else {
        setExtractMessage("Auto-capture completed: extraction, company save, and subscriber capture finished.");
      }

      onRefreshRequested();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auto-capture failed.";
      setExtractMessage(message);
    } finally {
      setExtractBusy(false);
      setAutoCaptureBusy(false);
    }
  }

  async function handleCreateShareholder() {
    if (!activeCompanyId) {
      setShareholderMessage("Select a company first.");
      return;
    }

    setShareholderBusy(true);
    setShareholderMessage("");
    try {
      const response = await fetch("/api/bridge/shareholder/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ...shareholderForm,
        }),
      });
      const payload = (await response.json()) as { folioNumber?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to add shareholder.");
      }
      setShareholderMessage(`Shareholder created. Folio ${payload.folioNumber || "assigned"}.`);
      setShareholderForm(defaultShareholderForm);
      onRefreshRequested();
    } catch (error) {
      setShareholderMessage(error instanceof Error ? error.message : "Failed to add shareholder.");
    } finally {
      setShareholderBusy(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <Card>
        <CardContent>
          <h3 className="text-lg font-bold">1. Extract company documents</h3>
          <p className="mt-1 text-sm text-[#607995]">Upload COI, MOA, and AOA. Extraction runs automatically and prefills company plus subscriber details.</p>

          <form
            ref={extractFormRef}
            className="mt-3 grid gap-3 md:grid-cols-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              await handleExtract(new FormData(form));
            }}
          >
            <label className="rounded-lg border border-[#d6e1ee] bg-[#f8fbff] p-3 text-sm">
              <span className="mb-2 block font-semibold">COI</span>
              <input name="coi" type="file" className="w-full text-xs" onChange={scheduleAutoExtract} />
            </label>
            <label className="rounded-lg border border-[#d6e1ee] bg-[#f8fbff] p-3 text-sm">
              <span className="mb-2 block font-semibold">MOA</span>
              <input name="moa" type="file" className="w-full text-xs" onChange={scheduleAutoExtract} />
            </label>
            <label className="rounded-lg border border-[#d6e1ee] bg-[#f8fbff] p-3 text-sm">
              <span className="mb-2 block font-semibold">AOA</span>
              <input name="aoa" type="file" className="w-full text-xs" onChange={scheduleAutoExtract} />
            </label>
            <div className="md:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-[#607995]">
                  <input
                    type="checkbox"
                    checked={autoExtractEnabled}
                    onChange={(event) => setAutoExtractEnabled(event.target.checked)}
                  />
                  Auto extract on file upload
                </label>
                <Button type="submit" disabled={extractBusy || autoCaptureBusy}>
                  <UploadCloud className="h-4 w-4" /> {extractBusy ? "Extracting" : "Extract company data"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-3">
            <Button onClick={runAutoCaptureAndSave} disabled={autoCaptureBusy || extractBusy || saveBusy || shareholderBusy}>
              {autoCaptureBusy ? "Running automation" : "Auto capture and save all"}
            </Button>
          </div>

          {extractBusy ? <p className="mt-3 rounded-md bg-[#fff8e8] px-3 py-2 text-sm text-[#8f5b02]">Running document extraction and auto-capture...</p> : null}

          {extractMessage ? <p className="mt-3 rounded-md bg-[#edf6ff] px-3 py-2 text-sm text-[#1c4f7f]">{extractMessage}</p> : null}

          {extracted ? (
            <div className="mt-3 rounded-lg border border-[#dae4f0] bg-[#f9fbff] p-3 text-xs text-[#57718c]">
              <p>Extracted company: <strong>{extracted.company_name || "-"}</strong></p>
              <p>CIN: {extracted.cin || "-"}</p>
              <p>Subscribers detected: {Array.isArray(extracted.subscribers) ? extracted.subscribers.length : 0}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="text-lg font-bold">2. Save company master</h3>
          <p className="mt-1 text-sm text-[#607995]">Review the extracted fields before saving.</p>
          <div className="mt-3 grid gap-2">
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Company name" value={companyForm.name} onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="CIN" value={companyForm.cin} onChange={(e) => setCompanyForm((p) => ({ ...p, cin: e.target.value.toUpperCase() }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Date of incorporation (DD-MM-YYYY)" value={companyForm.date_of_incorporation} onChange={(e) => setCompanyForm((p) => ({ ...p, date_of_incorporation: e.target.value }))} />
            <textarea className="rounded-lg border border-[#cfdbeb] px-3 py-2 text-sm" placeholder="Registered office" value={companyForm.registered_office} onChange={(e) => setCompanyForm((p) => ({ ...p, registered_office: e.target.value }))} rows={3} />
            <div className="grid grid-cols-2 gap-2">
              <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Authorized capital" value={companyForm.authorized_capital} onChange={(e) => setCompanyForm((p) => ({ ...p, authorized_capital: e.target.value }))} />
              <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Face value" value={companyForm.face_value} onChange={(e) => setCompanyForm((p) => ({ ...p, face_value: e.target.value }))} />
            </div>
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Director 1" value={companyForm.director1_name} onChange={(e) => setCompanyForm((p) => ({ ...p, director1_name: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Director 2" value={companyForm.director2_name} onChange={(e) => setCompanyForm((p) => ({ ...p, director2_name: e.target.value }))} />
          </div>
          <Button className="mt-3" onClick={handleSaveCompany} disabled={saveBusy}>
            {saveBusy ? "Saving" : "Save company"}
          </Button>
          {saveMessage ? <p className="mt-3 rounded-md bg-[#edf6ff] px-3 py-2 text-sm text-[#1c4f7f]">{saveMessage}</p> : null}
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardContent>
          <h3 className="text-lg font-bold">3. Add shareholder and KYC</h3>
          <p className="mt-1 text-sm text-[#607995]">This writes directly to shareholder + KYC fields in the same operation.</p>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Shareholder name" value={shareholderForm.name} onChange={(e) => setShareholderForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Father or husband name" value={shareholderForm.father_husband_name} onChange={(e) => setShareholderForm((p) => ({ ...p, father_husband_name: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="PAN" value={shareholderForm.pan} onChange={(e) => setShareholderForm((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Aadhaar" value={shareholderForm.aadhaar} onChange={(e) => setShareholderForm((p) => ({ ...p, aadhaar: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Mobile" value={shareholderForm.mobile} onChange={(e) => setShareholderForm((p) => ({ ...p, mobile: e.target.value }))} />
            <input className="h-9 rounded-lg border border-[#cfdbeb] px-3 text-sm" placeholder="Email" value={shareholderForm.email} onChange={(e) => setShareholderForm((p) => ({ ...p, email: e.target.value }))} />
            <textarea className="md:col-span-3 rounded-lg border border-[#cfdbeb] px-3 py-2 text-sm" placeholder="Address" value={shareholderForm.address} onChange={(e) => setShareholderForm((p) => ({ ...p, address: e.target.value }))} rows={2} />
          </div>

          <Button className="mt-3" onClick={handleCreateShareholder} disabled={shareholderBusy || !canCreateShareholder}>
            <UserPlus className="h-4 w-4" /> {shareholderBusy ? "Adding" : "Add shareholder"}
          </Button>
          {shareholderMessage ? <p className="mt-3 rounded-md bg-[#edf6ff] px-3 py-2 text-sm text-[#1c4f7f]">{shareholderMessage}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
