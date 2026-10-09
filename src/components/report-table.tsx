import Link from "next/link";
import type { ReportRow } from "@/lib/reports";
export function ReportTable({
  columns,
  rows,
  empty = "No records match these filters.",
}: {
  columns: string[];
  rows: ReportRow[];
  empty?: string;
}) {
  if (!rows.length) return <p className="empty-state">{empty}</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {r.cells.map((c, i) => (
                <td key={i}>
                  {i === 0 ? (
                    <Link href={r.href}>{c ?? "Open record"}</Link>
                  ) : (
                    (c ?? "—")
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
