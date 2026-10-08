"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertCircle, BarChart3, CheckCircle2, FileSpreadsheet, HeartPulse, PhilippinePeso, RefreshCw, ShieldCheck, Upload, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InstallAppButton } from "@/components/pwa";

type PatientGroup = "NEW" | "HMO/NEW" | "SCHEDULED" | "WALK-IN" | "HMO" | "HOME SERVICE" | "SEND-IN" | "CLINICAL TRIAL";
type DataRow = { date: Date | null; transaction: string; patient: string; group: PatientGroup; source: string; revenue: number; rowKey: string };
type FileSummary = { name: string; rows: number; skipped: number };

const PATIENT_TYPES = [
  { id: "new", label: "NEW", description: "NEW and HMO/NEW patients", groups: ["NEW", "HMO/NEW"] },
  { id: "scheduled", label: "SCHEDULED", description: "Returning scheduled patients", groups: ["SCHEDULED"] },
  { id: "walk-in", label: "WALK-IN", description: "Returning walk-in patients", groups: ["WALK-IN"] },
  { id: "returning", label: "RETURNING PATIENTS", description: "SCHEDULED, WALK-IN, and HMO", groups: ["SCHEDULED", "WALK-IN", "HMO"] },
  { id: "home-service", label: "HOME SERVICE", description: "Home service patients", groups: ["HOME SERVICE"] },
  { id: "send-in", label: "SEND-IN", description: "Send-in patients", groups: ["SEND-IN"] },
  { id: "clinical-trial", label: "CLINICAL TRIAL", description: "Clinical trial patients", groups: ["CLINICAL TRIAL"] },
] as const satisfies readonly { id: string; label: string; description: string; groups: readonly PatientGroup[] }[];
type PatientType = (typeof PATIENT_TYPES)[number];
type PatientTypeFilter = "all" | PatientType["id"];
const FILTER_VALUES: PatientTypeFilter[] = ["all", ...PATIENT_TYPES.map((type) => type.id)];

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

const GROUP_BY_KEY: Record<string, PatientGroup> = {
  NEW: "NEW", HMONEW: "HMO/NEW", SCHEDULED: "SCHEDULED", WALKIN: "WALK-IN", HMO: "HMO",
  HOMESERVICE: "HOME SERVICE", SENDIN: "SEND-IN", CLINICALTRIAL: "CLINICAL TRIAL",
};

// Matches spelling variants such as "HMO NEW", "WALK IN", or "Home-Service". Other types (company accounts, blanks) return null.
const patientTypeGroup = (value: string): PatientGroup | null => GROUP_BY_KEY[normalize(value).replace(/[^A-Z0-9]/g, "")] ?? null;

const filterLabel = (filter: PatientTypeFilter) => filter === "all" ? "All patient types" : PATIENT_TYPES.find((type) => type.id === filter)!.label;
const matchesFilter = (group: PatientGroup, filter: PatientTypeFilter) => filter === "all" || (PATIENT_TYPES.find((type) => type.id === filter)!.groups as readonly PatientGroup[]).includes(group);

// Only NEW and HMO/NEW patients are asked where they learned about the clinic. Blank, N/A, and NONE are not answers.
const isNewGroup = (group: PatientGroup) => group === "NEW" || group === "HMO/NEW";
const hasSource = (source: string) => !/^(N\/?A|NONE|-*)$/.test(normalize(source));
const shortSource = (value: string) => value.length > 22 ? `${value.slice(0, 21)}…` : value;

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<PatientTypeFilter>("new");
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
        let skipped = 0;
        grid.slice(headerIndex + 1).forEach((row, offset) => {
          const patient = clean(row[indexes["Patient Name"]]);
          if (!patient) return;
          const group = patientTypeGroup(clean(row[indexes["Patient Type"]]));
          if (!group) { skipped += 1; return; }
          const transaction = clean(row[indexes["Transaction No."]]);
          const source = clean(row[indexes.Source]);
          const revenue = Number(row[indexes["Total Payment"]]) || 0;
          const dateValue = row[indexes.Date];
          const service = serviceIndex >= 0 ? clean(row[serviceIndex]) : String(offset);
          const rowKey = [normalize(patient), normalize(transaction), normalize(service), revenue.toFixed(2), clean(dateValue)].join("|");
          parsedRows.push({ date: parseDate(dateValue), transaction, patient: normalize(patient), group, source, revenue, rowKey });
          accepted += 1;
        });
        parsedFiles.push({ name: file.name, rows: accepted, skipped });
      }
      if (!parsedRows.length) throw new Error(problems.join(" ") || "No records with a supported patient type were found.");
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

  const filteredRows = useMemo(() => rows.filter((row) => matchesFilter(row.group, filter)), [rows, filter]);

  const patientTypes = useMemo(() => {
    const summarize = (subset: DataRow[]) => {
      const patients = new Set<string>();
      const transactions = new Set<string>();
      const byGroup = new Map<PatientGroup, Set<string>>();
      let revenue = 0;
      subset.forEach((row) => {
        patients.add(row.patient);
        if (row.transaction) transactions.add(row.transaction);
        if (!byGroup.has(row.group)) byGroup.set(row.group, new Set());
        byGroup.get(row.group)!.add(row.patient);
        revenue += row.revenue;
      });
      return { patients: patients.size, transactions: transactions.size, revenue, byGroup: new Map(Array.from(byGroup, ([group, names]) => [group, names.size])) };
    };
    const total = summarize(rows);
    const types = PATIENT_TYPES.map((type) => ({ ...type, ...summarize(rows.filter((row) => matchesFilter(row.group, type.id))) }));
    return { total, types };
  }, [rows]);

  const metrics = useMemo(() => {
    const patients = new Set<string>();
    const transactions = new Set<string>();
    let revenue = 0;
    filteredRows.forEach((row) => {
      patients.add(row.patient);
      if (row.transaction) transactions.add(row.transaction);
      revenue += row.revenue;
    });
    const validDates = filteredRows.map((row) => row.date).filter((date): date is Date => date instanceof Date);
    const minDate = validDates.length ? new Date(Math.min(...validDates.map((date) => date.getTime()))) : null;
    const maxDate = validDates.length ? new Date(Math.max(...validDates.map((date) => date.getTime()))) : null;
    return { patients: patients.size, transactions: transactions.size, revenue, minDate, maxDate };
  }, [filteredRows]);

  // Sources always cover new patients, whatever the patient type filter. Each patient is credited, with all of their revenue, to the first source they gave.
  const acquisition = useMemo(() => {
    const patients = new Map<string, { source: string; revenue: number }>();
    rows.forEach((row) => {
      if (!isNewGroup(row.group)) return;
      const patient = patients.get(row.patient) ?? { source: "", revenue: 0 };
      if (!patient.source && hasSource(row.source)) patient.source = row.source;
      patient.revenue += row.revenue;
      patients.set(row.patient, patient);
    });
    const sources = new Map<string, { patients: number; revenue: number }>();
    let noSource = 0;
    patients.forEach((patient) => {
      if (!patient.source) { noSource += 1; return; }
      const item = sources.get(patient.source) ?? { patients: 0, revenue: 0 };
      item.patients += 1; item.revenue += patient.revenue;
      sources.set(patient.source, item);
    });
    const sourceRows = Array.from(sources, ([source, data]) => ({ source, ...data })).sort((a, b) => b.patients - a.patients || b.revenue - a.revenue);
    return { newPatients: patients.size, noSource, sources: sourceRows };
  }, [rows]);
  const sourceNote = `Only NEW and HMO/NEW patients are asked where they learned about us, so this covers new patients whatever the patient type filter.${acquisition.noSource ? ` ${number.format(acquisition.noSource)} new patient${acquisition.noSource === 1 ? "" : "s"} without a source ${acquisition.noSource === 1 ? "is" : "are"} not included.` : ""}`;

  const selectedType = PATIENT_TYPES.find((type) => type.id === filter);
  const selectedSummary = patientTypes.types.find((type) => type.id === filter);
  const patientDetail = selectedType && selectedSummary
    ? selectedType.groups.length > 1 ? groupBreakdown(selectedType.groups, selectedSummary.byGroup) : selectedType.description
    : "Across all patient types";

  const allocatedSpend = Object.values(sourceSpend).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const acquisitionCost = acquisition.newPatients ? marketingSpend / acquisition.newPatients : 0;
  const period = metrics.minDate && metrics.maxDate
    ? `${metrics.minDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} – ${metrics.maxDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
    : "Waiting for a workbook";

  const reset = () => {
    setRows([]); setFiles([]); setError(""); setMarketingSpend(0); setSourceSpend({}); setFilter("new");
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
        description: "Show one patient type: new (NEW and HMO/NEW), scheduled, walk-in, returning (scheduled, walk-in, and HMO), home-service, send-in, clinical-trial, or all.",
        inputSchema: { type: "object", properties: { patientType: { type: "string", enum: FILTER_VALUES } }, required: ["patientType"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) {
          const value = (input as { patientType?: PatientTypeFilter })?.patientType;
          if (!value || !FILTER_VALUES.includes(value)) throw new Error(`Choose one of: ${FILTER_VALUES.join(", ")}.`);
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
            <InstallAppButton className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white" />
            {hasData && <Button variant="outline" onClick={reset} className="border-[#d8a321] bg-transparent text-white hover:bg-[#4a3d27] hover:text-white"><RefreshCw size={16} /> Start over</Button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-5 py-6 lg:px-8 lg:py-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div onDragEnter={(e) => { e.preventDefault(); setDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void processFiles(Array.from(e.dataTransfer.files)); }} className={`relative flex min-h-[176px] items-center rounded-2xl border-2 border-dashed bg-[#fffefb] p-6 transition ${dragging ? "border-[#d8a321] bg-[#fff9e9]" : "border-[#d3bf8e]"}`}>
            <div className="flex w-full flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#fff2c8] text-[#8b6512]"><Upload size={26} /></div>
              <div className="flex-1"><h2 className="text-xl font-bold tracking-tight">Upload your sales report</h2><p className="mt-1 max-w-2xl text-base leading-6 text-[#6a604f]">Use the Detailed Sales Report format. Upload the full report with all patient types, or several files together.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => inputRef.current?.click()} className="bg-[#8b6512] text-white hover:bg-[#6f4e0a]"><FileSpreadsheet size={17} /> Choose Excel files</Button><span className="text-sm text-[#746957]">.xlsx or .xls</span></div>
                <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" onChange={(e) => void processFiles(Array.from(e.target.files || []))} />
              </div>
            </div>
          </div>
          <aside className="rounded-2xl border border-[#5b4a2d] bg-[#2f281c] p-6 text-white shadow-sm"><div className="flex items-center gap-2 text-[#f0c864]"><ShieldCheck size={19} /><span className="text-sm font-semibold">Private by design</span></div><p className="mt-3 text-lg font-semibold leading-7">Patient names stay on your device.</p><p className="mt-2 text-sm leading-6 text-[#e8dec7]">The workbook is analyzed in your browser. Names are used only to count unique patients and are never shown in the dashboard.</p></aside>
        </section>

        {error && <Alert variant="destructive" className="mt-5 border-[#efb5bf] bg-[#fff7f8]"><AlertCircle className="h-4 w-4" /><AlertTitle>Check the workbook</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {files.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Uploaded files">{files.map((file) => <span key={file.name} className="inline-flex items-center gap-2 rounded-full border border-[#dfd2b7] bg-[#fffefb] px-3 py-1.5 text-sm text-[#4c4436]"><CheckCircle2 size={15} className="text-[#8b6512]" /><span className="max-w-[260px] truncate">{file.name}</span><span className="text-[#7d725f]">{number.format(file.rows)} rows</span>{file.skipped > 0 && <span className="text-[#7d725f]" title="Rows with a patient type outside the dashboard's patient types, such as company accounts">· {number.format(file.skipped)} other</span>}</span>)}</div>}

        <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 md:flex-row md:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-[0.08em] text-[#8b6512]">Reporting period</p><p className="mt-1 text-lg font-bold">{period}</p></div>
          <div className="grid gap-2 sm:grid-cols-[210px_240px] sm:items-end">
            <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Patient type<Select value={filter} onValueChange={(value) => setFilter(value as PatientTypeFilter)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{PATIENT_TYPES.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}<SelectItem value="all">All patient types</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1.5 text-sm font-semibold text-[#514838]">Total marketing spend (PHP)<div className="relative"><PhilippinePeso className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b6512]" size={16} /><Input min={0} step="100" type="number" value={marketingSpend || ""} placeholder="0.00" onChange={(e) => setMarketingSpend(Math.max(0, Number(e.target.value) || 0))} className="pl-9 text-base font-semibold" /></div></label>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Users size={20} />} label={`Unique patients · ${filterLabel(filter)}`} value={hasData ? number.format(metrics.patients) : "—"} detail={hasData ? patientDetail : "Upload a workbook to begin"} />
          <MetricCard icon={<BarChart3 size={20} />} label="Transactions" value={hasData ? number.format(metrics.transactions) : "—"} detail="Unique transaction numbers" />
          <MetricCard icon={<PhilippinePeso size={20} />} label="Patient revenue" value={hasData ? money.format(metrics.revenue) : "—"} detail="Sum of Total Payment" />
          <MetricCard accent icon={<HeartPulse size={20} />} label="Acquisition cost / new patient" value={hasData && marketingSpend > 0 ? money.format(acquisitionCost) : "—"} detail={marketingSpend > 0 ? `${money.format(marketingSpend)} ÷ ${number.format(acquisition.newPatients)} new patients` : "Enter total marketing spend"} />
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-[#e2d7c2] bg-[#fffefb] shadow-sm">
          <div className="border-b border-[#e8dfce] p-5 sm:p-6"><h2 className="text-lg font-bold">Patients by type</h2><p className="mt-1 text-sm text-[#756b59]">Unique patients, transactions, and revenue for each patient type. Select a row to filter the dashboard.</p></div>
          <Table><TableHeader className="bg-[#faf5e9]"><TableRow><TableHead>Patient type</TableHead><TableHead>Includes</TableHead><TableHead className="text-right">Unique patients</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Share of revenue</TableHead></TableRow></TableHeader>
            <TableBody>
              {patientTypes.types.map((type) => {
                const active = filter === type.id;
                const rollup = type.id === "returning";
                return <TableRow key={type.id} onClick={() => setFilter(type.id)} aria-selected={active} className={`cursor-pointer ${active ? "bg-[#fff3d0] hover:bg-[#ffecb8]" : rollup ? "bg-[#faf7f0]" : ""}`}>
                  <TableCell><button type="button" onClick={(e) => { e.stopPropagation(); setFilter(type.id); }} className={`text-left font-semibold ${active ? "text-[#6f4e0a]" : "text-[#463d30]"} ${rollup ? "font-extrabold" : ""}`}>{type.label}</button></TableCell>
                  <TableCell className="text-[#756b59]">{hasData && type.groups.length > 1 ? groupBreakdown(type.groups, type.byGroup) : type.description}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{hasData ? number.format(type.patients) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{hasData ? number.format(type.transactions) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{hasData ? money.format(type.revenue) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{hasData && patientTypes.total.revenue > 0 ? `${(type.revenue / patientTypes.total.revenue * 100).toFixed(1)}%` : "—"}</TableCell>
                </TableRow>;
              })}
              <TableRow onClick={() => setFilter("all")} aria-selected={filter === "all"} className={`cursor-pointer border-t-2 border-[#e2d7c2] ${filter === "all" ? "bg-[#fff3d0] hover:bg-[#ffecb8]" : ""}`}>
                <TableCell><button type="button" onClick={(e) => { e.stopPropagation(); setFilter("all"); }} className="text-left font-extrabold text-[#463d30]">ALL PATIENT TYPES</button></TableCell>
                <TableCell className="text-[#756b59]">Each patient counted once</TableCell>
                <TableCell className="text-right font-bold tabular-nums">{hasData ? number.format(patientTypes.total.patients) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{hasData ? number.format(patientTypes.total.transactions) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{hasData ? money.format(patientTypes.total.revenue) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{hasData ? "100%" : "—"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_minmax(620px,1.4fr)]">
          <div className="rounded-2xl border border-[#e2d7c2] bg-[#fffefb] p-5 shadow-sm sm:p-6">
            <div><h2 className="text-lg font-bold">New patients by acquisition source</h2><p className="mt-1 text-sm text-[#756b59]">{sourceNote}</p></div>
            {acquisition.sources.length ? <div className="mt-5 h-[330px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={acquisition.sources.slice(0, 8)} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}><CartesianGrid stroke="#eee6d8" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: "#766b58", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="source" width={130} tickFormatter={shortSource} tick={{ fill: "#4d4435", fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [`${number.format(Number(value))} patients`, "Unique patients"]} contentStyle={{ borderRadius: 12, borderColor: "#e2d7c2", boxShadow: "0 10px 30px rgba(61,45,17,.10)" }} /><Bar dataKey="patients" fill="#d8a321" radius={[0, 7, 7, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div> : <EmptyPanel />}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e2d7c2] bg-[#fffefb] shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-[#e8dfce] p-5 sm:flex-row sm:items-end sm:p-6"><div><h2 className="text-lg font-bold">Cost by acquisition source</h2><p className="mt-1 text-sm text-[#756b59]">Enter the spend assigned to each source to calculate cost per new patient.</p></div>{marketingSpend > 0 && <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${Math.abs(marketingSpend - allocatedSpend) < 0.01 ? "bg-[#edf5e8] text-[#41612c]" : "bg-[#fff3d0] text-[#795600]"}`}>Allocated: {money.format(allocatedSpend)} of {money.format(marketingSpend)}</div>}</div>
            <div className="max-h-[420px] overflow-auto"><Table><TableHeader className="sticky top-0 z-10 bg-[#faf5e9]"><TableRow><TableHead>Source</TableHead><TableHead className="text-right">New patients</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="min-w-[150px] text-right">Spend (PHP)</TableHead><TableHead className="text-right">Cost / patient</TableHead></TableRow></TableHeader>
              <TableBody>{acquisition.sources.length ? acquisition.sources.map((item) => { const spend = sourceSpend[item.source] || 0; return <TableRow key={item.source}><TableCell className="max-w-[220px] font-semibold text-[#463d30]">{item.source}</TableCell><TableCell className="text-right tabular-nums">{number.format(item.patients)}</TableCell><TableCell className="text-right tabular-nums">{money.format(item.revenue)}</TableCell><TableCell><Input aria-label={`Spend for ${item.source}`} type="number" min={0} step="100" value={spend || ""} placeholder="0.00" onChange={(e) => setSourceSpend((current) => ({ ...current, [item.source]: Math.max(0, Number(e.target.value) || 0) }))} className="ml-auto w-36 text-right tabular-nums" /></TableCell><TableCell className="text-right font-bold tabular-nums text-[#8b6512]">{spend > 0 ? money.format(spend / item.patients) : "—"}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={5} className="h-52 text-center text-[#7d725f]">Source results will appear after upload.</TableCell></TableRow>}</TableBody>
            </Table></div>
          </div>
        </section>
        <footer className="mt-6 flex flex-col gap-2 border-t border-[#ddd2bd] py-5 text-sm text-[#756b59] sm:flex-row sm:items-center sm:justify-between"><p>Counting rule: one unique Patient Name equals one patient. Only new patients (NEW and HMO/NEW) have a source.</p><p>RETURNING PATIENTS combines SCHEDULED, WALK-IN, and HMO. Other patient types are excluded.</p></footer>
      </div>
    </main>
  );
}

function MetricCard({ icon, label, value, detail, accent = false }: { icon: React.ReactNode; label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? "border-[#d8a321] bg-[#4a3612] text-white" : "border-[#e2d7c2] bg-[#fffefb]"}`}><div className={`flex items-center gap-2 text-sm font-semibold ${accent ? "text-[#f0c864]" : "text-[#746957]"}`}>{icon}<span>{label}</span></div><p className="mt-4 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[1.7rem]">{value}</p><p className={`mt-1 text-sm ${accent ? "text-[#f4e8c7]" : "text-[#807562]"}`}>{detail}</p></div>;
}

function groupBreakdown(groups: readonly PatientGroup[], counts: Map<PatientGroup, number>) {
  return groups.map((group) => `${number.format(counts.get(group) ?? 0)} ${group}`).join(" · ");
}

function EmptyPanel() {
  return <div className="mt-5 grid h-[330px] place-items-center rounded-xl border border-dashed border-[#d8c8a6] bg-[#faf7f0] text-center"><div><FileSpreadsheet className="mx-auto text-[#b08a32]" size={30} /><p className="mt-3 font-semibold text-[#5e5443]">No workbook uploaded yet</p><p className="mt-1 text-sm text-[#857967]">Your source chart will appear here.</p></div></div>;
}
