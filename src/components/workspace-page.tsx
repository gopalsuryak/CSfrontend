"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Database,
  Download,
  Eye,
  FileSignature,
  FileText,
  Filter,
  History,
  Home,
  Layers3,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AssistantPanel } from "@/components/assistant-panel";
import { IntakeWorkbench } from "@/components/intake-workbench";
import {
  defaultWorkspace,
  formatDate,
  formatNumber,
  type Section,
  type WorkspacePayload,
} from "@/lib/workspace";

type NavItem = {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "intake", label: "Document Intake", icon: UploadCloud },
  { id: "captable", label: "Cap Table", icon: Users },
  { id: "certificates", label: "Share Certificates", icon: BadgeCheck },
  { id: "transfers", label: "Share Transfers", icon: ArrowRightLeft },
  { id: "registers", label: "Registers and Vault", icon: Database },
  { id: "audit", label: "Audit Trail", icon: History },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "green" | "amber" | "blue" | "purple" | "slate" | "dark" }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    dark: "bg-slate-900 text-white ring-slate-900",
  };

  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1", tones[tone] || tones.slate)}>
      {children}
    </span>
  );
}

function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function Sidebar({ activePage }: { activePage: Section }) {
  const router = useRouter();

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-screen w-[264px] flex-col border-r border-blue-950/50 bg-[#061a3a] px-4 py-5 text-white">
      <div className="flex items-center gap-3 px-2">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/40 bg-blue-500/10 text-cyan-200">
          <Layers3 className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-none">ShareLedger</p>
          <p className="mt-1 truncate text-xs text-blue-200">CA / CS firm workspace</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-xs uppercase tracking-wide text-blue-200">Firm login</p>
        <p className="mt-1 truncate text-sm font-semibold">Mehra and Jain Associates</p>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-blue-100">
          <span>Workspace live</span>
          <Pill tone="blue">Per company</Pill>
        </div>
      </div>

      <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.id === "dashboard" ? "/" : `/${item.id}`)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-medium transition",
                active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-blue-100 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-cyan-200" />
          <div>
            <p className="font-semibold">One login, many companies</p>
            <p className="mt-1 text-xs leading-5 text-blue-100">Manage all client-company secretarial records from one firm account.</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({
  selectedCompany,
  setSelectedCompany,
  workspace,
  onOpenAudit,
}: {
  selectedCompany: number | null;
  setSelectedCompany: (value: number | null) => void;
  workspace: WorkspacePayload;
  onOpenAudit: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between gap-5 border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative min-w-[360px] max-w-[560px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            placeholder="Search companies, CIN, folio, documents..."
          />
        </div>

        <div className="flex h-11 w-[320px] shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm">
          <Building2 className="h-4 w-4 shrink-0 text-slate-500" />
          <select
            value={selectedCompany ?? ""}
            onChange={(event) => setSelectedCompany(event.target.value ? Number(event.target.value) : null)}
            className="min-w-0 flex-1 bg-transparent font-medium text-slate-800 outline-none"
          >
            <option value="">Select company</option>
            {workspace.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={onOpenAudit}
          className="relative grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">AM</div>
          <div>
            <p className="whitespace-nowrap text-sm font-semibold text-slate-950">Arjun Mehta</p>
            <p className="text-xs text-slate-500">Firm Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function MetricCard({
  title,
  value,
  delta,
  icon: Icon,
  tone = "blue",
}: {
  title: string;
  value: string;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "blue" | "green" | "purple" | "amber";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    purple: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
  }[tone];

  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("rounded-2xl p-3", toneClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{delta}</span>
        </div>
        <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function DocumentVault({
  compact = false,
  workspace,
  onViewAll,
  onPreview,
  onDownload,
}: {
  compact?: boolean;
  workspace: WorkspacePayload;
  onViewAll: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const documents = [
    ["SH-4 Transfer Form", "SH-4", workspace.company?.name || "-", "DOCX + PDF", formatDate(workspace.audit_log[0]?.timestamp), "Generated"],
    ["Share Certificate Register", "Register", workspace.company?.name || "-", "PDF + CSV", formatDate(workspace.audit_log[1]?.timestamp), "Ready"],
    ["Cap Table Export", "Export", workspace.company?.name || "-", "XLSX + PDF", formatDate(workspace.audit_log[2]?.timestamp), "Ready"],
  ];

  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">Document Vault</h2>
          <button onClick={onViewAll} className="text-sm font-semibold text-blue-700">View all</button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-[44%] px-4 py-3">Document</th>
                {!compact ? <th className="w-[26%] px-4 py-3">Company</th> : null}
                <th className="w-[16%] px-4 py-3">Format</th>
                <th className="w-[16%] px-4 py-3">Status</th>
                <th className="w-[8%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map(([name, , company, format, date, status]) => (
                <tr key={String(name)}>
                  <td className="truncate px-4 py-3 font-medium text-slate-950">
                    {name}
                    <p className="truncate text-xs text-slate-400">{date}</p>
                  </td>
                  {!compact ? <td className="truncate px-4 py-3 text-slate-500">{company}</td> : null}
                  <td className="truncate px-4 py-3">{format}</td>
                  <td className="px-4 py-3">
                    <Pill tone="green">{status}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={onPreview} className="text-slate-500"><Eye className="h-4 w-4" /></button>
                      <button onClick={onDownload} className="text-slate-500"><Download className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditTrail({ compact = false, workspace, onViewAll }: { compact?: boolean; workspace: WorkspacePayload; onViewAll: () => void }) {
  const events = workspace.audit_log.map((e) => [
    e.action || "Action",
    e.entity_type || "System",
    formatDate(e.timestamp),
    "Completed",
  ]);

  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">Audit Trail</h2>
          <button onClick={onViewAll} className="text-sm font-semibold text-blue-700">View full audit trail</button>
        </div>
        <div className="mt-5 space-y-4">
          {(events.length ? events : [["No events yet", "System", "-", "Idle"]])
            .slice(0, compact ? 4 : 6)
            .map(([title, actor, time, status], index) => (
              <div key={`${title}-${time}-${index}`} className="flex gap-3">
                <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-blue-600 ring-4 ring-blue-100" />
                <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 p-4">
                  <div className="flex justify-between gap-4">
                    <p className="truncate font-semibold text-slate-950">{title}</p>
                    <Pill tone="green">{status}</Pill>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {actor} - {time}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ShareholderTable({ workspace }: { workspace: WorkspacePayload }) {
  // Build per-shareholder distinctive range from ISSUED certificates
  const rangeMap: Record<string, string> = {};
  for (const cert of workspace.certificate_register ?? []) {
    if (cert.status !== "ISSUED") continue;
    const key = cert.folio_number;
    const range = `${formatNumber(cert.distinctive_from)}–${formatNumber(cert.distinctive_to)}`;
    rangeMap[key] = rangeMap[key] ? `${rangeMap[key]}, ${range}` : range;
  }

  const rows = workspace.cap_table.map((row) => [
    row.name,
    row.folio_number,
    row.class_of_shares || "Equity",
    formatNumber(row.total_shares_held),
    `${Number(row.percentage_holding || 0).toFixed(2)}%`,
    row.email || "-",
    rangeMap[row.folio_number] ?? `${formatNumber(row.total_shares_held)} shares`,
  ]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="w-[4%] px-4 py-3">#</th>
            <th className="w-[22%] px-4 py-3">Shareholder</th>
            <th className="w-[12%] px-4 py-3">Folio</th>
            <th className="w-[9%] px-4 py-3">Class</th>
            <th className="w-[12%] px-4 py-3 text-right">Shares</th>
            <th className="w-[10%] px-4 py-3 text-right">Holding</th>
            <th className="w-[15%] px-4 py-3">Reference</th>
            <th className="w-[16%] px-4 py-3">Distinctive Range</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(rows.length ? rows : [["No members", "-", "-", "-", "-", "-", "-"]]).map((row, index) => (
            <tr key={`${row[1]}-${index}`} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-500">{index + 1}</td>
              <td className="truncate px-4 py-3 font-medium text-slate-950">{row[0]}</td>
              <td className="truncate px-4 py-3">{row[1]}</td>
              <td className="px-4 py-3">{row[2]}</td>
              <td className="px-4 py-3 text-right">{row[3]}</td>
              <td className="px-4 py-3 text-right">{row[4]}</td>
              <td className="truncate px-4 py-3">{row[5]}</td>
              <td className="truncate px-4 py-3">{row[6]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardPage({
  workspace,
  activeCompanyId,
  onAddCompany,
  onOpenRegisters,
  onOpenAudit,
  onPreview,
  onDownload,
  onTransferProcessed,
}: {
  workspace: WorkspacePayload;
  activeCompanyId: number | null;
  onAddCompany: () => void;
  onOpenRegisters: () => void;
  onOpenAudit: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onTransferProcessed: () => void;
}) {
  const activeCompany = workspace.companies.find((company) => company.id === activeCompanyId) || null;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Dashboard"
        subtitle="Firm-level control room with an AI assistant layer for company-wise shareholding and SH-4 workflows."
        action={
          <Button onClick={onAddCompany} className="rounded-2xl bg-blue-700 hover:bg-blue-800">
            <Plus className="mr-2 h-4 w-4" /> Add company
          </Button>
        }
      />
      <AssistantPanel
        companyId={activeCompanyId}
        companyName={activeCompany?.name || workspace.company?.name || null}
        onTransferProcessed={onTransferProcessed}
      />
      <div className="grid grid-cols-4 gap-5">
        <MetricCard title="Total Companies" value={formatNumber(workspace.companies.length)} delta="Live" icon={Building2} tone="blue" />
        <MetricCard title="Active Shareholders" value={formatNumber(workspace.metrics.members)} delta="Synced" icon={Users} tone="green" />
        <MetricCard title="Certificates Issued" value={formatNumber(workspace.metrics.issued_certificates)} delta="Synced" icon={BadgeCheck} tone="purple" />
        <MetricCard title="Transfer Reviews" value={formatNumber(workspace.metrics.transfers)} delta="Live" icon={AlertTriangle} tone="amber" />
      </div>
      <div className="grid grid-cols-[1.2fr_0.8fr] gap-5">
        <DocumentVault compact workspace={workspace} onViewAll={onOpenRegisters} onPreview={onPreview} onDownload={onDownload} />
        <AuditTrail compact workspace={workspace} onViewAll={onOpenAudit} />
      </div>
    </div>
  );
}

function CompaniesPage({
  workspace,
  onAddCompany,
  onSelectCompany,
  onDeleteCompany,
}: {
  workspace: WorkspacePayload;
  onAddCompany: () => void;
  onSelectCompany: (companyId: number) => void;
  onDeleteCompany: (companyId: number, companyName: string) => Promise<void>;
}) {
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Review">("All");
  const filteredCompanies = useMemo(() => {
    if (statusFilter === "All") {
      return workspace.companies;
    }
    if (statusFilter === "Review") {
      return workspace.companies.filter((_, index) => index % 3 === 0);
    }
    return workspace.companies;
  }, [statusFilter, workspace.companies]);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Companies"
        subtitle="One firm login can manage client companies in a single compliance workspace."
        action={
          <Button onClick={onAddCompany} className="rounded-2xl bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> Add company
          </Button>
        }
      />
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-5">
            <div className="flex gap-2">
              {["All", "Active", "Review"].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as "All" | "Active" | "Review")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium",
                    statusFilter === status ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setStatusFilter("All")} className="rounded-2xl">
              <Filter className="mr-2 h-4 w-4" /> Filters
            </Button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4">
            {filteredCompanies.map((company) => (
              <div
                key={company.id}
                onClick={() => onSelectCompany(company.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCompany(company.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 font-bold text-white">{String(company.name || "C").slice(0, 2).toUpperCase()}</div>
                  <div className="flex items-center gap-2">
                    <Pill tone="green">Active</Pill>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void onDeleteCompany(company.id, company.name || "this company").catch((error: unknown) => {
                          const message = error instanceof Error ? error.message : "Failed to delete company.";
                          window.alert(message);
                        });
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      aria-label={`Delete ${company.name || "company"}`}
                      title="Delete company"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-4 truncate font-semibold text-slate-950">{company.name}</h3>
                <p className="mt-1 truncate text-xs text-slate-500">{company.cin || "No CIN"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CapTablePage({ workspace, onExport }: { workspace: WorkspacePayload; onExport: () => void }) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Cap Table"
        subtitle="Maintain shareholder positions, certificate numbers, folios and distinctive number sequences."
        action={
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onExport} className="rounded-2xl">
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button className="rounded-2xl bg-blue-700" onClick={onExport}>
              <Plus className="mr-2 h-4 w-4" /> New allotment
            </Button>
          </div>
        }
      />
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <ShareholderTable workspace={workspace} />
        </CardContent>
      </Card>
    </div>
  );
}

function CertificatesPage({
  workspace,
  activeCompanyId,
  onIssue,
}: {
  workspace: WorkspacePayload;
  activeCompanyId: number | null;
  onIssue: (payload: { shareholderId: number; shares: number; issueDate: string }) => Promise<string>;
}) {
  const [shareholderId, setShareholderId] = useState<number | "">("");
  const [shares, setShares] = useState("1");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const shareholders = workspace.member_register;

  async function submitIssue() {
    if (!activeCompanyId) {
      setMessage("Select a company first.");
      return;
    }
    if (!shareholderId) {
      setMessage("Select a shareholder.");
      return;
    }
    const shareCount = Number(shares);
    if (!Number.isFinite(shareCount) || shareCount <= 0) {
      setMessage("Enter a valid number of shares.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = await onIssue({
        shareholderId: Number(shareholderId),
        shares: shareCount,
        issueDate,
      });
      setMessage(result);
      setShares("1");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not issue certificate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Share Certificates"
        subtitle="Issue SH-1 certificates directly from this React workflow with backend sequence and distinctive controls."
        action={
          <Button className="rounded-2xl bg-blue-700" onClick={submitIssue} disabled={busy}>
            <BadgeCheck className="mr-2 h-4 w-4" /> {busy ? "Issuing" : "Issue certificate"}
          </Button>
        }
      />
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm text-slate-700">
              Shareholder
              <select
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={shareholderId}
                onChange={(event) => setShareholderId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">Select shareholder</option>
                {shareholders.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.folio_number})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              Shares
              <input
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                type="number"
                min={1}
                value={shares}
                onChange={(event) => setShares(event.target.value)}
              />
            </label>
            <label className="text-sm text-slate-700">
              Issue Date
              <input
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>
          </div>
          {message ? <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TransfersPage({ workspace }: { workspace: WorkspacePayload }) {
  const transfers = workspace.transfer_register;
  const companyId = workspace.activeCompanyId;

  return (
    <div className="space-y-6">
      <PageTitle
        title="SH-4 Transfer Forms"
        subtitle="All generated SH-4 share transfer forms for this company."
      />

      {transfers.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-20">
            <FileSignature className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">No SH-4 forms generated yet. Use the AI assistant to process share transfers.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">SH-4 No.</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transferor</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transferee</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Shares</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Distinctive Nos.</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">SH-4 Form</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-700">{t.transfer_number}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{t.from_name}</p>
                      <p className="text-xs text-slate-400">{t.from_folio}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{t.to_name}</p>
                      <p className="text-xs text-slate-400">{t.to_folio || "—"}</p>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{formatNumber(t.shares)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">
                      {formatNumber(t.distinctive_from)}–{formatNumber(t.distinctive_to)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{t.transfer_date ? formatDate(t.transfer_date) : "—"}</td>
                    <td className="px-5 py-3">
                      <Pill tone="green">{t.status ?? "COMPLETED"}</Pill>
                    </td>
                    <td className="px-5 py-3">
                      {t.transfer_form_path ? (
                        <a
                          href={`/api/bridge/transfers/download?id=${t.id}&companyId=${companyId ?? 0}`}
                          download
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Download DOCX
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RegistersPage({
  workspace,
  onExportBundle,
  onOpenAudit,
  onPreview,
  onDownload,
}: {
  workspace: WorkspacePayload;
  onExportBundle: () => void;
  onOpenAudit: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Registers, Vault and Audit Trail"
        subtitle="All generated documents, statutory registers and immutable audit events in one desktop workspace."
        action={
          <Button className="rounded-2xl bg-blue-700" onClick={onExportBundle}>
            <Download className="mr-2 h-4 w-4" /> Export bundle
          </Button>
        }
      />
      <div className="grid grid-cols-4 gap-5">
        <MetricCard title="Generated Documents" value={formatNumber(workspace.certificate_register.length)} delta="Live" icon={FileText} tone="blue" />
        <MetricCard title="Register Entries" value={formatNumber(workspace.member_register.length)} delta="Live" icon={Database} tone="green" />
        <MetricCard title="Audit Events" value={formatNumber(workspace.audit_log.length)} delta="Live" icon={ShieldCheck} tone="purple" />
        <MetricCard title="Pending Reviews" value={formatNumber(workspace.metrics.kyc_pending)} delta="Live" icon={AlertTriangle} tone="amber" />
      </div>
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-900">Related Share Register (From Transactions)</h3>
            <span className="text-xs text-slate-500">{formatNumber(workspace.share_transaction_register.length)} entries</span>
          </div>
          {workspace.share_transaction_register.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No transfer-linked share movements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Trf No.</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transferor (Before → After)</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Transferee (Before → After)</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Moved Shares</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Distinctive Nos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {workspace.share_transaction_register.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-700">{row.transfer_number}</td>
                      <td className="px-5 py-3 text-slate-600">{row.transfer_date ? formatDate(row.transfer_date) : "-"}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{row.from_name} ({row.from_folio})</p>
                        <p className="text-xs text-slate-500">{formatNumber(row.from_before_shares)} → {formatNumber(row.from_after_shares)}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{row.to_name} ({row.to_folio})</p>
                        <p className="text-xs text-slate-500">{formatNumber(row.to_before_shares)} → {formatNumber(row.to_after_shares)}</p>
                      </td>
                      <td className="px-5 py-3 tabular-nums">{formatNumber(row.shares)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-600">
                        {formatNumber(row.distinctive_from)}-{formatNumber(row.distinctive_to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid grid-cols-[1.2fr_0.8fr] gap-5">
        <DocumentVault workspace={workspace} onViewAll={onExportBundle} onPreview={onPreview} onDownload={onDownload} />
        <AuditTrail workspace={workspace} onViewAll={onOpenAudit} />
      </div>
    </div>
  );
}

function BillingPage({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Billing"
        subtitle="Commercial model for CA/CS firms: one firm login, many companies, billed per active company workspace."
        action={
          <Button className="rounded-2xl bg-blue-700" onClick={onUpgrade}>
            <CreditCard className="mr-2 h-4 w-4" /> Upgrade plan
          </Button>
        }
      />
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm text-slate-600">Billing surface reserved for per-company pricing and usage analytics.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsPage({ workspace }: { workspace: WorkspacePayload }) {
  const settings = ["Firm Profile", "Users and Roles", "Template Library", "Numbering Series", "Approval Matrix", "Security", "Billing", "Integrations"];

  return (
    <div className="space-y-6">
      <PageTitle title="Settings" subtitle={`Schema version ${workspace.schemaVersion}. Configure workspace controls and templates.`} />
      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="p-8">
          <div className="grid grid-cols-4 gap-5">
            {settings.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <Settings2 className="h-5 w-5 text-blue-700" />
                <h3 className="mt-4 font-semibold text-slate-950">{item}</h3>
                <p className="mt-1 text-sm text-slate-500">Configure {item.toLowerCase()}.</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntakePage({
  activeCompanyId,
  onCompanyChanged,
  onRefreshRequested,
}: {
  activeCompanyId: number | null;
  onCompanyChanged: (companyId: number) => void;
  onRefreshRequested: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageTitle
        title="Document Intake"
        subtitle="Upload incorporation documents, extract fields, save company master, and add shareholders from the same React workflow."
      />
      <IntakeWorkbench
        activeCompanyId={activeCompanyId}
        onCompanyChanged={onCompanyChanged}
        onRefreshRequested={onRefreshRequested}
      />
    </div>
  );
}

export function WorkspacePage({ section }: { section: Section }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<WorkspacePayload>(defaultWorkspace);
  const [actionMessage, setActionMessage] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const selectedCompanyId = useMemo(() => {
    const raw = searchParams.get("companyId");
    return raw ? Number(raw) : null;
  }, [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function loadWorkspace() {
      const query = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const response = await fetch(`/api/bridge/workspace${query}`, { cache: "no-store" });
      const payload = (await response.json()) as WorkspacePayload & { error?: string };
      if (!mounted || !response.ok) {
        return;
      }
      setWorkspace(payload);
      if (!selectedCompanyId && payload.activeCompanyId) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("companyId", String(payload.activeCompanyId));
        router.replace(`${pathname}?${params.toString()}`);
      }
    }
    loadWorkspace();
    return () => {
      mounted = false;
    };
  }, [pathname, refreshNonce, router, searchParams, selectedCompanyId]);

  function refreshWorkspace() {
    setRefreshNonce((previous) => previous + 1);
  }

  function setSelectedCompany(companyId: number | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (companyId) {
      params.set("companyId", String(companyId));
    } else {
      params.delete("companyId");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function generateRegisters() {
    const companyId = selectedCompanyId ?? workspace.activeCompanyId;
    if (!companyId) {
      setActionMessage("Select a company first.");
      return;
    }
    try {
      const response = await fetch("/api/bridge/registers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const payload = (await response.json()) as {
        generated?: Record<string, { pdf: string; csv: string }>;
        errors?: Record<string, string>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Register generation failed.");
      }
      const generatedCount = Object.keys(payload.generated || {}).length;
      const errorCount = Object.keys(payload.errors || {}).length;
      setActionMessage(`Generated ${generatedCount} register sets${errorCount ? `, ${errorCount} with issues` : ""}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Could not generate registers.");
    }
  }

  function openRegistersPreview() {
    openSection("registers");
    setActionMessage("Preview is now in Registers and Vault. Use Export bundle to generate and review outputs.");
  }

  function openSection(sectionId: Section) {
    router.push(sectionId === "dashboard" ? "/" : `/${sectionId}`);
  }

  async function issueCertificate(payload: { shareholderId: number; shares: number; issueDate: string }) {
    const companyId = selectedCompanyId ?? workspace.activeCompanyId;
    if (!companyId) {
      throw new Error("Select a company first.");
    }
    const response = await fetch("/api/bridge/certificates/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, ...payload }),
    });
    const result = (await response.json()) as { certificateNumber?: string; error?: string };
    if (!response.ok) {
      throw new Error(result.error || "Certificate issuance failed.");
    }
    refreshWorkspace();
    const message = `Certificate ${result.certificateNumber || "issued"} created successfully.`;
    setActionMessage(message);
    return message;
  }

  async function processTransfer(payload: {
    fromCertificateId: number;
    shares: number;
    transferDate: string;
    pricePerShare: number;
    toShareholderId?: number;
    toName?: string;
    toAddress?: string;
    toEmail?: string;
    toPan?: string;
    toOccupation?: string;
    witnessName?: string;
    witnessAddress?: string;
  }) {
    const companyId = selectedCompanyId ?? workspace.activeCompanyId;
    if (!companyId) {
      throw new Error("Select a company first.");
    }
    const response = await fetch("/api/bridge/transfers/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, ...payload }),
    });
    const result = (await response.json()) as {
      transferNo?: string;
      newCertificateNo?: string;
      residualCertificateNo?: string | null;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "Transfer processing failed.");
    }
    refreshWorkspace();
    const message = `Transfer ${result.transferNo || "processed"} completed. New certificate: ${result.newCertificateNo || "created"}${result.residualCertificateNo ? `, residual: ${result.residualCertificateNo}` : ""}.`;
    setActionMessage(message);
    return message;
  }

  async function deleteCompany(companyId: number, companyName: string) {
    const confirmed = window.confirm(`Delete ${companyName}? This will remove shareholders, certificates, transfers, and cap table records.`);
    if (!confirmed) {
      return;
    }
    const response = await fetch("/api/bridge/company/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(result.error || "Failed to delete company.");
    }
    if ((selectedCompanyId ?? workspace.activeCompanyId) === companyId) {
      setSelectedCompany(null);
    }
    refreshWorkspace();
    setActionMessage(`${companyName} deleted successfully.`);
  }

  let page: React.ReactNode;
  switch (section) {
    case "companies":
      page = <CompaniesPage workspace={workspace} onAddCompany={() => openSection("intake")} onSelectCompany={setSelectedCompany} onDeleteCompany={deleteCompany} />;
      break;
    case "intake":
      page = <IntakePage activeCompanyId={selectedCompanyId ?? workspace.activeCompanyId ?? null} onCompanyChanged={setSelectedCompany} onRefreshRequested={refreshWorkspace} />;
      break;
    case "captable":
      page = <CapTablePage workspace={workspace} onExport={generateRegisters} />;
      break;
    case "certificates":
      page = <CertificatesPage workspace={workspace} activeCompanyId={selectedCompanyId ?? workspace.activeCompanyId ?? null} onIssue={issueCertificate} />;
      break;
    case "transfers":
      page = <TransfersPage workspace={workspace} />;
      break;
    case "registers":
      page = <RegistersPage workspace={workspace} onExportBundle={generateRegisters} onOpenAudit={() => openSection("audit")} onPreview={openRegistersPreview} onDownload={generateRegisters} />;
      break;
    case "audit":
      page = <RegistersPage workspace={workspace} onExportBundle={generateRegisters} onOpenAudit={() => openSection("audit")} onPreview={openRegistersPreview} onDownload={generateRegisters} />;
      break;
    case "billing":
      page = <BillingPage onUpgrade={() => setActionMessage("Billing module can be enabled after plan configuration.")} />;
      break;
    case "settings":
      page = <SettingsPage workspace={workspace} />;
      break;
    default:
      page = <DashboardPage workspace={workspace} activeCompanyId={selectedCompanyId ?? workspace.activeCompanyId ?? null} onAddCompany={() => openSection("intake")} onOpenRegisters={() => openSection("registers")} onOpenAudit={() => openSection("audit")} onPreview={openRegistersPreview} onDownload={generateRegisters} onTransferProcessed={refreshWorkspace} />;
      break;
  }

  return (
    <div className="min-h-screen min-w-[1440px] bg-slate-50 text-slate-950">
      <Sidebar activePage={section} />
      <div className="min-h-screen" style={{ marginLeft: 264 }}>
        <Topbar selectedCompany={selectedCompanyId ?? workspace.activeCompanyId ?? null} setSelectedCompany={setSelectedCompany} workspace={workspace} onOpenAudit={() => openSection("audit")} />
        <motion.main
          key={section}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="p-6 xl:p-8"
        >
          {actionMessage ? (
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
              {actionMessage}
            </div>
          ) : null}
          {page}
        </motion.main>
      </div>
    </div>
  );
}
