import type { AppData, Attendance, Occurrence } from "./types";
import { formatInZone } from "./timezone";
export type ReportEntry = {
  record?: Attendance;
  occurrence: Occurrence;
  moduleName: string;
  moduleCode: string;
};
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function attendanceCsv(
  entries: ReportEntry[],
  timezone: string,
): string {
  const header = [
    "Date",
    "Start",
    "End",
    "Module",
    "Code",
    "Session type",
    "Room",
    "Status",
    "Note",
  ];
  const rows = entries.map(
    ({ record, occurrence: o, moduleName, moduleCode }) => [
      formatInZone(o.starts_at, "yyyy-MM-dd", timezone),
      formatInZone(o.starts_at, "HH:mm", timezone),
      formatInZone(o.ends_at, "HH:mm", timezone),
      moduleName,
      moduleCode,
      o.session_type,
      o.classroom,
      o.cancelled ? "cancelled" : record?.attendance_status || "unrecorded",
      record?.note || "",
    ],
  );
  return (
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
export async function attendancePdf(
  entries: ReportEntry[],
  data: AppData,
  fontBytes?: Uint8Array,
): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const { default: fontkit } = await import("@pdf-lib/fontkit");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle("Exclunich Attendance Report");
  doc.setAuthor(data.student.full_name);
  if (!fontBytes) {
    const response = await fetch("/fonts/DejaVuSans.ttf");
    if (!response.ok)
      throw new Error("The report font could not be loaded. Please try again.");
    fontBytes = new Uint8Array(await response.arrayBuffer());
  }
  const regular = await doc.embedFont(fontBytes, { subset: true });
  const bold = regular;
  const safe = (value: string) =>
    value.replace(/[\u0000-\u0008\u000b-\u001f]/g, "");
  const glyphWidths = new Map<string, number>();
  const wrap = (value: string, width: number, size = 9): string[] => {
    const lines: string[] = [];
    let line = "";
    let lineWidth = 0;
    for (const character of safe(value || "-")) {
      const key = `${size}:${character}`;
      const glyphWidth =
        glyphWidths.get(key) ?? regular.widthOfTextAtSize(character, size);
      glyphWidths.set(key, glyphWidth);
      if (character === "\n" || (line && lineWidth + glyphWidth > width)) {
        lines.push(line);
        line = "";
        lineWidth = 0;
      }
      if (character !== "\n" && character !== "\r") {
        line += character;
        lineWidth += glyphWidth;
      }
    }
    lines.push(line);
    return lines;
  };
  let page = doc.addPage([842, 595]);
  let y = 0;
  let pageNumber = 0;
  const text = (
    value: string,
    x: number,
    position: number,
    size = 9,
    strong = false,
  ) =>
    page.drawText(safe(value), {
      x,
      y: position,
      size,
      font: strong ? bold : regular,
      color: rgb(0.12, 0.17, 0.26),
    });
  const newPage = () => {
    if (pageNumber) page = doc.addPage([842, 595]);
    pageNumber++;
    y = 552;
    text("Exclunich", 35, y, 20, true);
    text("ATTENDANCE REPORT", 655, y, 10, true);
    y -= 24;
    text(
      `${data.student.full_name} | ${data.student.semester} | ${data.student.academic_year}`,
      35,
      y,
      10,
    );
    y -= 18;
    text(
      `Generated ${formatInZone(new Date(), "dd MMM yyyy HH:mm", data.student.timezone)} | ${data.student.timezone} | ${entries.length} filtered sessions`,
      35,
      y,
      8,
    );
    y -= 30;
    [
      ["Date / time", 35],
      ["Module", 150],
      ["Type", 340],
      ["Status", 390],
      ["Room", 495],
      ["Note", 560],
    ].forEach(([label, x]) => text(String(label), Number(x), y, 9, true));
    y -= 9;
    page.drawLine({
      start: { x: 35, y },
      end: { x: 807, y },
      thickness: 0.5,
      color: rgb(0.8, 0.84, 0.89),
    });
    y -= 20;
  };
  newPage();
  for (const { record, occurrence: o, moduleName, moduleCode } of entries) {
    const columns = [
      wrap(
        formatInZone(o.starts_at, "dd MMM yy HH:mm", data.student.timezone),
        108,
      ),
      wrap(`${moduleCode} - ${moduleName}`, 180),
      [o.session_type],
      wrap(
        o.cancelled ? "cancelled" : record?.attendance_status || "unrecorded",
        95,
      ),
      wrap(o.classroom, 58),
      wrap(record?.note || "-", 245, 8),
    ];
    for (
      let line = 0;
      line < Math.max(...columns.map((column) => column.length));
      line++
    ) {
      if (y < 55) newPage();
      columns.forEach((column, index) => {
        if (column[line])
          text(
            column[line],
            [35, 150, 340, 390, 495, 560][index],
            y,
            index === 5 ? 8 : 9,
          );
      });
      y -= 13;
    }
    y -= 10;
  }
  for (const [i, p] of doc.getPages().entries())
    p.drawText(
      `Exclunich | Page ${i + 1} of ${doc.getPageCount()} | Self-reported attendance`,
      { x: 35, y: 25, size: 8, font: regular, color: rgb(0.4, 0.45, 0.53) },
    );
  return doc.save();
}
