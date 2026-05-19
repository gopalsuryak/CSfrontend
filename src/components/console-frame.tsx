"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightLeft,
  BadgeCheck,
  Building2,
  CreditCard,
  Database,
  History,
  Home,
  Settings2,
  UploadCloud,
  Users,
} from "lucide-react";

import { cn } from "@/lib/cn";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/intake", label: "Document Intake", icon: UploadCloud },
  { href: "/captable", label: "Cap Table", icon: Users },
  { href: "/certificates", label: "Certificates", icon: BadgeCheck },
  { href: "/transfers", label: "Transfers", icon: ArrowRightLeft },
  { href: "/registers", label: "Registers", icon: Database },
  { href: "/audit", label: "Audit Trail", icon: History },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function ConsoleFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen text-[#0f1f33]">
      <div className="mx-auto grid w-[min(1440px,calc(100%-1.5rem))] gap-4 py-4 lg:grid-cols-[276px_1fr]">
        <aside className="rounded-2xl border border-[#d7e1ec] bg-[linear-gradient(180deg,#ffffff_0%,#f5f9ff_100%)] p-3 shadow-[0_24px_55px_rgba(27,53,86,0.12)] backdrop-blur">
          <div className="mb-4 rounded-xl bg-[linear-gradient(145deg,#0c2547,#14558f,#0f766e)] p-4 text-white">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">Equity Desk</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight">Operations HQ</h1>
            <p className="mt-1 text-xs text-white/85">Share register automation workspace</p>
            <div className="mt-3 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[11px] text-white/90">
              Live with Python bridge
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-[linear-gradient(90deg,#e8f2ff,#ecf7ff)] text-[#17477b] shadow-[inset_0_0_0_1px_rgba(23,71,123,0.15)]"
                      : "text-[#2c4058] hover:bg-[#f0f5fb]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 rounded-xl border border-[#d8e3ef] bg-white/80 p-3 text-xs text-[#49627f]">
            Migrated routes are now live. Remaining depth is workflow-level, not navigation-level.
          </div>
        </aside>

        <main className="space-y-4">{children}</main>
      </div>
    </div>
  );
}
