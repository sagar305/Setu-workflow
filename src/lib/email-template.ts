// ---------------------------------------------------------------------------
// The one email layout every Setu Workflow message uses — the same card as
// setutechnology.com's emails (Setu_main/lib/qrMenuOrders.ts): indigo header,
// white card on cream, one clear button, an optional details table.
//
// Table-based with inline styles, because that is what Gmail, Outlook and
// Apple Mail all render the same way. Every email also has a plain-text part
// built from the same content, so nothing is lost in text-only clients.
// ---------------------------------------------------------------------------

const INDIGO = "#26306B";
const SAFFRON = "#F2A03D";
const INK = "#0E1124";
const MUTED = "#5F6478";
const CREAM = "#F7F5F0";
const LINE = "#E6E3DC";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailContent = {
  /** Short line shown next to the subject in the inbox. */
  preheader: string;
  heading: string;
  /** "Hi Anita," — optional. */
  greeting?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Key/value rows under the button (plan, dates, workspace…). */
  details?: [string, string][];
  /** Numbered steps, e.g. "How to use it". */
  steps?: { title: string; items: string[] };
  /** Small print under everything (link expiry, "didn't request this?"). */
  note?: string;
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** **bold** in content strings becomes <strong> in HTML (and stays plain in text). */
function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${INK};">$1</strong>`);
}
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${MUTED};">${inline(text)}</p>`;

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px;">
         <tr><td align="center" bgcolor="${INDIGO}" style="border-radius:10px;">
           <a href="${escapeHtml(content.button.url)}" target="_blank"
              style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(content.button.label)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 24px;font-size:12px;line-height:1.6;color:${MUTED};">
         Button not working? Copy this link into your browser:<br>
         <a href="${escapeHtml(content.button.url)}" style="color:${INDIGO};word-break:break-all;">${escapeHtml(content.button.url)}</a>
       </p>`
    : "";

  const steps = content.steps
    ? `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${INK};">${escapeHtml(content.steps.title)}</p>
       <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.7;color:${MUTED};">
         ${content.steps.items.map((item) => `<li style="margin:0 0 4px;">${inline(item)}</li>`).join("")}
       </ol>`
    : "";

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="border-collapse:collapse;border-top:1px solid ${LINE};margin:0 0 20px;">
         ${content.details
           .map(
             ([label, value]) => `<tr>
               <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${MUTED};">${escapeHtml(label)}</td>
               <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:13px;font-weight:600;color:${INK};">${escapeHtml(value)}</td>
             </tr>`,
           )
           .join("")}
       </table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(content.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="background:${CREAM};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;font-family:${FONT};">
        <tr><td bgcolor="${INDIGO}" style="background:${INDIGO};padding:22px 28px;">
          <span style="font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#ffffff;">Setu<span style="color:${SAFFRON};">.</span></span>
          <span style="display:block;margin-top:2px;font-size:10px;font-weight:600;letter-spacing:3px;color:#C8CAD9;">WORKFLOW</span>
        </td></tr>
        <tr><td style="padding:32px 28px 12px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(content.heading)}</h1>
          ${content.greeting ? p(content.greeting) : ""}
          ${content.paragraphs.map(p).join("")}
          ${button}
          ${steps}
          ${details}
          ${content.note ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:${MUTED};">${inline(content.note)}</p>` : ""}
        </td></tr>
        <tr><td style="border-top:1px solid ${LINE};padding:18px 28px;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#9A9DAA;">
            Setu Technology &middot; Setu Workflow<br>
            Practice management for CA/CPA &amp; accounting firms &middot;
            <a href="https://setutechnology.com" style="color:#9A9DAA;">setutechnology.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    content.heading,
    "",
    ...(content.greeting ? [plain(content.greeting), ""] : []),
    ...content.paragraphs.flatMap((para) => [plain(para), ""]),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ""] : []),
    ...(content.steps
      ? [content.steps.title, ...content.steps.items.map((item, i) => `${i + 1}. ${plain(item)}`), ""]
      : []),
    ...(content.details?.length ? [...content.details.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(content.note ? [plain(content.note), ""] : []),
    "— Setu Technology · Setu Workflow",
    "https://setutechnology.com",
  ].join("\n");

  return { html, text };
}
