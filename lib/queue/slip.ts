import { TIME_ZONE } from "./reducer";

const slipTime = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A small paper ticket for receipt/thermal printers (about 72 mm wide) showing the arrival queue number. */
export function slipHtml(label: string, issuedAt: number, logoUrl: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Queue ${escapeHtml(label)}</title><style>
@page { size: 80mm auto; margin: 4mm; }
body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #000; text-align: center; width: 72mm; }
img { height: 22mm; margin-top: 2mm; }
.c { font-size: 10pt; font-weight: 700; letter-spacing: .06em; margin: 2mm 0 0; }
.k { font-size: 10pt; margin: 4mm 0 0; }
.n { font: 800 34pt ui-monospace, Consolas, monospace; margin: 1mm 0; letter-spacing: .04em; }
.t { font-size: 9pt; margin: 0; }
.m { font-size: 10pt; line-height: 1.35; margin: 4mm 2mm 2mm; border-top: 1px dashed #000; padding-top: 3mm; }
</style></head><body>
<img src="${logoUrl}" alt="">
<p class="c">THE HEART SPECIALISTS CLINIC</p>
<p class="k">Your queue number</p>
<p class="n">${escapeHtml(label)}</p>
<p class="t">${escapeHtml(slipTime.format(new Date(issuedAt)))}</p>
<p class="m">Please take a seat. Watch the TV screen — your number will be called for registration. Keep this number for every service today.</p>
<script>window.onload = function () { window.focus(); window.print(); setTimeout(function () { window.close(); }, 500); };<\/script>
</body></html>`;
}

/** Opens the slip in a small window and sends it to the printer. */
export function printSlip(label: string, issuedAt: number, logoUrl: string) {
  const win = window.open("", "thsc-queue-slip", "width=360,height=560");
  if (!win) return false;
  win.document.open();
  win.document.write(slipHtml(label, issuedAt, logoUrl));
  win.document.close();
  return true;
}
