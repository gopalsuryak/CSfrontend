export const sections = [
  "dashboard",
  "companies",
  "intake",
  "captable",
  "certificates",
  "transfers",
  "registers",
  "audit",
  "billing",
  "settings",
] as const;

export type Section = (typeof sections)[number];

export type Company = {
  id: number;
  name: string;
  cin?: string;
  date_of_incorporation?: string;
  authorized_capital?: number;
};

export type WorkspacePayload = {
  companies: Company[];
  activeCompanyId: number | null;
  schemaVersion: string;
  company: {
    id: number | null;
    name: string | null;
    cin: string | null;
    registered_office?: string | null;
  } | null;
  metrics: {
    members: number;
    issued_certificates: number;
    transfers: number;
    kyc_pending: number;
  };
  automation: {
    company_extraction: number;
    kyc_autofill: number;
    register_generation: number;
    transfer_workflow: number;
  };
  recent_audit: AuditEntry[];
  audit_log: AuditEntry[];
  member_register: MemberRow[];
  cap_table: CapTableRow[];
  certificate_register: CertificateRow[];
  transfer_register: TransferRow[];
  share_transaction_register: ShareTransactionRow[];
  folders: {
    root: string;
    uploads: string;
    document_vault: string;
    generated: string;
    reports: string;
    certificates: string;
    transfers: string;
  } | null;
};

export type AuditEntry = {
  id?: number;
  action?: string;
  entity_type?: string;
  details?: string;
  timestamp?: string;
};

export type MemberRow = {
  id: number;
  folio_number: string;
  name: string;
  pan?: string;
  address?: string;
  email?: string;
  kyc_verified?: number;
  total_shares?: number;
  paid_up_value?: number;
};

export type CapTableRow = {
  shareholder_id: number;
  folio_number: string;
  name: string;
  pan?: string;
  email?: string;
  total_shares_held?: number;
  paid_up_value?: number;
  percentage_holding?: number;
  class_of_shares?: string;
};

export type CertificateRow = {
  id: number;
  certificate_number: string;
  folio_number: string;
  shareholder_name: string;
  shares: number;
  distinctive_from: number;
  distinctive_to: number;
  face_value: number;
  premium?: number;
  issue_date?: string;
  status?: string;
};

export type TransferRow = {
  id: number;
  transfer_number: string;
  from_name: string;
  from_folio: string;
  to_name: string;
  to_folio: string;
  shares: number;
  distinctive_from: number;
  distinctive_to: number;
  consideration: number;
  transfer_price_per_share?: number;
  transfer_date?: string;
  status?: string;
  from_cert_no?: string;
  transfer_form_path?: string;
  pdf_path?: string;
};

export type ShareTransactionRow = {
  id: number;
  transfer_number: string;
  transfer_date?: string;
  created_at?: string;
  from_name: string;
  from_folio: string;
  to_name: string;
  to_folio: string;
  shares: number;
  distinctive_from: number;
  distinctive_to: number;
  from_before_shares: number;
  from_after_shares: number;
  to_before_shares: number;
  to_after_shares: number;
};

export const defaultWorkspace: WorkspacePayload = {
  companies: [],
  activeCompanyId: null,
  schemaVersion: "unknown",
  company: null,
  metrics: {
    members: 0,
    issued_certificates: 0,
    transfers: 0,
    kyc_pending: 0,
  },
  automation: {
    company_extraction: 0,
    kyc_autofill: 0,
    register_generation: 0,
    transfer_workflow: 0,
  },
  recent_audit: [],
  audit_log: [],
  member_register: [],
  cap_table: [],
  certificate_register: [],
  transfer_register: [],
  share_transaction_register: [],
  folders: null,
};

export function isSection(value: string): value is Section {
  return sections.includes(value as Section);
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
