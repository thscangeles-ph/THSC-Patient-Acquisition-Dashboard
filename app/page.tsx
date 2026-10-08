"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { AlertCircle, BarChart3, ListOrdered, CheckCircle2, FileSpreadsheet, HeartPulse, PhilippinePeso, RefreshCw, ShieldCheck, Upload, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataRow = { date: Date | null; transaction: string; patient: string; patientType: string; source: string; revenue: number; rowKey: string };
type FileSummary = { name: string; rows: number };
type PatientTypeFilter = "all" | "new" | "hmo";

declare global {
  interface Document {
    modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
  }
}

const REQUIRED_HEADERS = ["Date", "Transaction No.", "Patient Name", "Patient Type", "Source", "Total Payment"];
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-PH");
const clean = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => clean(value).replace(/\s+/g, " ").toUpperCase();

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)) : null;
  }
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (!match) return null;
  let hour = Number(match[4] || 0);
  const marker = (match[7] || "").toUpperCase();
  if (marker === "PM" && hour < 12) hour += 12;
  if (marker === "AM" && hour === 12) hour = 0;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), hour, Number(match[5] || 0), Number(match[6] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function patientTypeGroup(value: string): "NEW" | "HMO/NEW" | "OTHER" {
  const v = normalize(value);
  if (v === "HMO/NEW" || v === "HMO NEW") return "HMO/NEW";
  if (v === "NEW") return "NEW";
  return "OTHER";
}

const sourceLabel = (value: string) => clean(value) || "Not specified";
const shortSource = (value: string) => value.length > 22 ? `${value.slice(0, 21)}…` : value;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<PatientTypeFilter>("all");
  const [marketingSpend, setMarketingSpend] = useState(0);
  const [sourceSpend, setSourceSpend] = useState<Record<string, number>>({});

  const processFiles = useCallback(async (incoming: File[]) => {
    const excelFiles = incoming.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!excelFiles.length) { setError("Please upload an Excel file in .xlsx or .xls format."); return; }
    try {
      const parsedRows: DataRow[] = [];
      const parsedFiles: FileSummary[] = [];
      const problems: string[] = [];
      for (const file of excelFiles) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
        const headerIndex = grid.findIndex((row) => {
          const headers = (row || []).map(normalize);
          return REQUIRED_HEADERS.every((header) => headers.includes(normalize(header)));
        });
        if (headerIndex < 0) { problems.push(`${file.name}: required table headers were not found.`); continue; }
        const headers = (grid[headerIndex] || []).map(clean);
        const indexOf = (name: string) => headers.findIndex((header) => normalize(header) === normalize(name));
        const indexes = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, indexOf(header)]));
        const serviceIndex = headers.findIndex((header) => normalize(header) === "TEST EXAMINATION");
        let accepted = 0;
        grid.slice(headerIndex + 1).forEach((row, offset) => {
          const patient = clean(row[indexes["Patient Name"]]);
          const type = clean(row[indexes["Patient Type"]]);
          if (!patient || patientTypeGroup(type) === "OTHER") return;
          const transaction = clean(row[indexes["Transaction No."]]);
          const source = sourceLabel(clean(row[indexes.Source]));
          const revenue = Number(row[indexes["Total Payment"]]) || 0;
          const dateValue = row[indexes.Date];
          const service = serviceIndex >= 0 ? clean(row[serviceIndex]) : String(offset);
          const rowKey = [normalize(patient), normalize(transaction), normalize(service), revenue.toFixed(2), clean(dateValue)].join("|");
          parsedRows.push({ date: parseDate(dateValue), transaction, patient: normalize(patient), patientType: type, source, revenue, rowKey });
          accepted += 1;
        });
        parsedFiles.push({ name: file.name, rows: accepted });
      }
      if (!parsedRows.length) throw new Error(problems.join(" ") || "No NEW or HMO/NEW patient records were found.");
      const unique = new Map<string, DataRow>();
      [...rows, ...parsedRows].forEach((row) => unique.set(row.rowKey, row));
      setRows(Array.from(unique.values()));
      setFiles((current) => {
        const merged = new Map(current.map((item) => [item.name, item]));
        parsedFiles.forEach((item) => merged.set(item.name, item));
        return Array.from(merged.values());
      });
      setError(problems.join(" "));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The workbook could not be read."); }
  }, [rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const type = patientTypeGroup(row.patientType);
    return filter === "all" || (filter === "new" && type === "NEW") || (filter === "hmo" && type === "HMO/NEW");
  }), [rows, filter]);

  const metrics = useMemo(() => {
    const patients = new Map<string, { source: string; type: string }>();
    const transactions = new Set<string>();
    let revenue = 0;
    filteredRows.forEach((row) => {
      if (!patients.has(row.patient)) patients.set(row.patient, { source: row.source, type: patientTypeGroup(row.patientType) });
      if (row.transaction) transactions.add(row.transaction);
      revenue += row.revenue;
    });
    const validDates = filteredRows.map((row) => row.date).filter((date): date is Date => date instanceof Date);
    const minDate = validDates.length ? new Date(Math.min(...validDates.map((date) => date.getTime()))) : null;
    const maxDate = validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : null;
    const sources = new Map<string, { patients: Set<string>; revenue: number }>();
    patients.forEach((patient, patientName) => {
      if (!sources.has(patient.source)) sources.set(patient.source, { patients: new Set(), revenue: 0 });
      sources.get(patient.source)!.patients.add(patientName);
    });
    filteredRows.forEach((row) => {
      if (!sources.has(row.source)) sources.set(row.source, { patients: new Set(), revenue: 0 });
      sources.get(row.source)!.revenue += row.revenue;
    });
    const sourceRows = Array.from(sources.entries()).map(([source, data]) => ({ source, patients: data.patients.size, revenue: data.revenue })).sort((a, b) => b.patients - a.patients || b.revenue - a.revenue);
    const counts = { NEW: 0, "HMO/NEW": 0 };
    patients.forEach((patient) => { if (patient.type === "NEW" || patient.type === "HMO/NEW") counts[patient.type] += 1; });
    return { patients: patients.size, transactions: transactions.size, revenue, minDate, maxDate, sources: sourceRows, counts };
  }, [filteredRows]);

  const allocatedSpend = Object.values(sourceSpend).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const acquisitionCost = metrics.patients ? marketingSpend / metrics.patients : 0;
  const period = metrics.minDate && metrics.maxDate
    ? `${metrics.minDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} – ${metrics.maxDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
    : "Waiting for a workbook";

  const reset = () => {
    setRows([]); setFiles([]); setError(""); setMarketingSpend(0); setSourceSpend({}); setFilter("all");
    if (inputRef.current) inputRef.current.value = "";
  };

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "set_marketing_spend", title: "Set marketing spend",
        description: "Set total marketing spend used to calculate acquisition cost per unique new patient.",
        inputSchema: { type: "object", properties: { amountPhp: { type: "number", minimum: 0 } }, required: ["amountPhp"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) {
          const amount = Number((input as { amountPhp?: number })?.amountPhp);
          if (!Number.isFinite(amount) || amount < 0) throw new Error("amountPhp must be zero or greater.");
          setMarketingSpend(amount); return { amountPhp: amount, currency: "PHP" };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "filter_patient_type", title: "Filter patient type",
        description: "Show all new patients, cash NEW patients only, or HMO/NEW patients only.",
        inputSchema: { type: "object", properties: { patientType: { type: "string", enum: ["all", "new", "hmo"] } }, required: ["patientType"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) {
          const value = (input as { patientType?: PatientTypeFilter })?.patientType;
          if (!value || !["all", "new", "hmo"].includes(value)) throw new Error("Choose all, new, or hmo.");
          setFilter(value); return { patientType: value };
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const hasData = rows.length > 0;
  return (
    <main className="min-h-screen bg-[#f7f4ed] text-[#2e291f]">
      <header className="border-b border-[#5c4b2d] bg-[#2f281c] text-white">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/theheartspecialists.png" alt="The Heart Specialists Clinic logo" width="62" height="48" className="h-12 w-[62px] shrink-0 object-contain" />
            <div className="min-w-0"><p className="truncate text-sm font-semibold tracking-[0.08em] text-[#f0c864]">THE HEART SPECIALISTS CLINIC</p><h1 className="truncate text-lg font-bold tracking-tight text-white sm:text-xl">Patient Acquisition Dashboard</h1></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="outline" className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><Link href="/queue"><ListOrdered size={16} /> Queue board</Link></Button>
            {hasData && <Button variant="outline" onClick={reset} className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><RefreshCw size={16} /> Start over</Button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8 lg:py-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void processFiles(Array.from(e.dataTransfer.files)); }} className={`relative flex min-h-[176px] items-center rounded-2xl border-2 border-dashed bg-[#fffefb] p-6 transition ${dragging ? "border-[#d8a321] bg-[#fff9e9]" : "border-[#d3bf8e]"}`}>
            <div className="flex w-full flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#fff2c8] text-[#8b6512]"><Upload size={26} /></div>
              <div className="flex-1"><h2 className="text-xl font-bold tracking-tight">Upload your sales report</h2><p className="mt-1 max-w-2xl text-base leading-6 text-[#6a604f]">Use the same Detailed Sales Report format. You may upload the NEW and HMO/NEW files together.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => inputRef.current?.click()} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><FileSpreadsheet size={17} /> Choose Excel files</Button><span className="text-sm text-[#746957]">.xlsx or .xls</span></div>
                <input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="sr-only" onChange={(e) => void processFiles(Array.from(e.target.files || []))} />
              </div>
            </div>
          </div>
          <aside className="rounded-2xl border border-[#5b4a2d] bg-[#2f281c] p-6 text-white shadow-sm"><div className="flex items-center gap-2 text-[#f0c864]"><ShieldCheck size={19} /><span className="text-sm font-semibold">Private by design</span></div><p className="mt-3 text-lg font-semibold leading-7">Patient names stay on your device.</p><p className="mt-2 text-sm leading-6 text-[#e8dec7]">The workbook is analyzed in your browser. Names are used only to count unique patients and are never shown in the dashboard.</p></aside>
        </section>

        {error && <Alert variant="destructive" className="mt-5 border-[#efb5bf] bg-[#fff7f8]"><AlertCircle className="h-4 w-4" /><AlertTitle>Check the workbook</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {files.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Uploaded files">{files.map((file) => <span key={file.name} className="inline-flex items-center gap-2 rounded-full border border-[#dfd2b7] bg-[#fffefb] px-3 py-1.5 text-sm text-[#4c4436]"><CheckCircle2 size={15} className="text-[#8b6512]" /><span className="max-w-[260px] truncate">{file.name}</span><span className="text-[#7d725f]">{number.format(file.rows)} rows</span></span>)}</div>}

        <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 md:flex-row md:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#8b6512]">Reporting period</p><p className="mt-1 text-lg font-bold">{period}</p></div>
          <div className="grid gap-2 sm:grid-cols-[210px_240px] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Patient type<Select value={filter} onValueChange={(value) => setFilter(value as PatientTypeFilter)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All new patients</SelectItem><SelectItem value="new">NEW only</SelectItem><SelectItem value="hmo">HMO/NEW only</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Total marketing spend (PHP)<div className="relative"><PhilippinePeso className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b6512]" size={16} /><Input min={0} step="100" type="number" value={marketingSpend || ""} placeholder="0.00" onChange={(e) => setMarketingSpend(Math.max(0, Number(e.target.value) || 0))} className="pl-9 text-base font-semibold" /></div></label>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Users size={20} />} label="Unique new patients" value={hasData ? number.format(metrics.patients) : "—"} detail={hasData ? `${number.format(metrics.counts.NEW)} NEW · ${number.format(metrics.counts["HMO/NEW"])} HMO/NEW` : "Upload a workbook to begin"} />
          <MetricCard icon={<BarChart3 size={20} />} label="Transactions" value={hasData ? number.format(metrics.transactions) : "—"} detail="Unique transaction numbers" />
          <MetricCard icon={<PhilippinePeso size={20} />} label="Patient revenue" value={hasData ? money.format(metrics.revenue) : "—"} detail="Sum of Total Payment" />
          <MetricCard accent icon={<HeartPulse size={20} />} label="Acquisition cost / patient" value={hasData && marketingSpend > 0 ? money.format(acquisitionCost) : "—"} detail={marketingSpend > 0 ? `${money.format(marketingSpend)} ÷ ${number.format(metrics.patients)} patients` : "Enter total marketing spend"} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_minmax(620px,1.4fr)]">
          <div className="rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 shadow-sm sm:p-6">
            <div><h2 className="text-lg font-bold">Patients by acquisition source</h2><p className="mt-1 text-sm text-[#756b59]">Unique patients assigned to their first recorded source.</p></div>
            {metrics.sources.length ? <div className="mt-5 h-[330px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={metrics.sources.slice(0, 8)} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}><CartesianGrid stroke="#eee6d8" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#766b58", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="source" width={130} tickFormatter={shortSource} tick={{ fill: "#4d4435", fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${number.format(Number(value))} patients`, "Unique patients"]} contentStyle={{ borderRadius: 12, borderColor: "#e2d7c2", boxShadow: "0 10px 30px rgba(61,45,17,.10)" }} /><Bar dataKey="patients" fill="#d8a321" radius={[0, 7, 7, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div> : <EmptyPanel />}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e2d7c2] bg-[#fffefb] shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-[#e8dfce] p-5 sm:flex-row sm:items-end sm:p-6"><div><h2 className="text-lg font-bold">Cost by acquisition source</h2><p className="mt-1 text-sm text-[#756b59]">Enter the spend assigned to each source to calculate source-level cost per patient.</p></div>{marketingSpend > 0 && <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${Math.abs(marketingSpend - allocatedSpend) < 0.01 ? "bg-[#edf5e8] text-[#41612c]" : "bg-[#fff3d0] text-[#795600]"}`}>Allocated: {money.format(allocatedSpend)} of {money.format(marketingSpend)}</div>}</div>
            <div className="max-h-[420px] overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-[#faf5e9]"><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Patients</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="min-w-[150px] text-right">Spend (PHP)</TableHead><TableHead className="text-right">Cost / patient</TableHead></TableRow></TableHeader>
              <TableBody>{metrics.sources.length ? metrics.sources.map((item) => { const spend = sourceSpend[item.source] || 0; return <TableRow key={item.source}><TableCell className="max-w-[220px] font-semibold text-[#463d30]">{item.source}</TableCell><TableCell className="text-right tabular-nums">{number.format(item.patients)}</TableCell><TableCell className="text-right tabular-nums">{money.format(item.revenue)}</TableCell><TableCell><Input aria-label={`Spend for ${item.source}`} type="number" min={0} step="100" value={spend || ""} placeholder="0.00" onChange={(e) => setSourceSpend((current) => ({ ...current, [item.source]: Math.max(0, Number(e.target.value) || 0) }))} className="ml-auto w-36 text-right tabular-nums" /></TableCell><TableCell className="text-right font-bold tabular-nums text-[#8b6512]">{spend > 0 ? money.format(spend / item.patients) : "—"}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={5} className="h-52 text-center text-[#7d725f]">Source results will appear after upload.</TableCell></TableRow>}</TableBody>
            </Table></div>
          </div>
        </section>
        <footer className="mt-6 flex flex-col gap-2 border-t border-[#ddd2bd] py-5 text-sm text-[#756b59] sm:flex-row sm:items-center sm:justify-between"><p>Counting rule: one unique Patient Name equals one acquired patient.</p><p>Rows outside NEW and HMO/NEW are excluded automatically.</p></footer>
      </div>
    </main>
  );
}

function MetricCard({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? "border-[#d8a321] bg-[#4a3612] text-white" : "border-[#e2d7c2] bg-[#fffefb]"}`}><div className={`flex items-center gap-2 text-sm font-semibold ${accent ? "text-[#f0c864]" : "text-[#746957]"}`}>{icon}<span>{label}</span></div><p className="mt-4 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[1.7rem]">{value}</p><p className={`mt-1 text-sm ${accent ? "text-[#f4e8c7]" : "text-[#807562]"}`}>{detail}</p></div>;
}

function EmptyPanel() {
  return <div className="mt-5 grid h-[330px] place-items-center rounded-xl border border-dashed border-[#d8c8a6] bg-[#faf7f0] text-center"><div><FileSpreadsheet className="mx-auto text-[#b08a32]" size={30} /><p className="mt-3 font-semibold text-[#5e5443]">No workbook uploaded yet</p><p className="mt-1 text-sm text-[#857967]">Your source chart will appear here.</p></div></div>;
}
