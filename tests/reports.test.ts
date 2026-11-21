import { describe, it, expect } from "vitest";
import { attendanceCsv, attendancePdf, csvCell } from "../src/lib/reports";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { AppData } from "../src/lib/types";
describe("CSV export integrity", () => {
  it("quotes commas, newlines, and quotes", () => {
    expect(csvCell('note, "reason"\nline')).toBe('"note, ""reason""\nline"');
  });
  it("neutralizes spreadsheet formula injection in user text", () => {
    for (const prefix of ["=", "+", "-", "@", " ="])
      expect(csvCell(`${prefix}SUM(A1)`)).toContain("'");
  });
  it("retains the Algiers calendar date at a UTC boundary", () => {
    const csv = attendanceCsv(
      [
        {
          moduleName: "Networks",
          moduleCode: "NET",
          occurrence: {
            id: "1",
            session_id: "2",
            module_id: "3",
            starts_at: "2026-11-19T23:30:00Z",
            ends_at: "2026-11-20T00:30:00Z",
            session_type: "TD",
            classroom: "A1",
            cancelled: false,
          },
        },
      ],
      "Africa/Algiers",
    );
    expect(csv).toContain('"2026-11-20","00:30","01:30"');
    expect(csv).toContain("unrecorded");
  });
});
it("exports multipage PDFs with Unicode names and long notes without truncating rows", async () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    moduleName: "Réseaux et télécommunications",
    moduleCode: "NET",
    occurrence: {
      id: `${i}`,
      session_id: "s",
      module_id: "m",
      starts_at: "2026-11-20T08:00:00Z",
      ends_at: "2026-11-20T09:00:00Z",
      session_type: "TD" as const,
      classroom: "Salle A",
      cancelled: false,
    },
    record: {
      id: `r${i}`,
      occurrence_id: `${i}`,
      module_id: "m",
      attendance_status: "justified" as const,
      note: "Justification médicale. ".repeat(80),
      created_at: "",
      updated_at: "",
    },
  }));
  const data = {
    student: {
      full_name: "Étudiant أمين",
      semester: "Semester 1",
      academic_year: "2026–2027",
      timezone: "Africa/Algiers",
    },
  } as AppData;
  const font = new Uint8Array(
    await readFile(new URL("../public/fonts/DejaVuSans.ttf", import.meta.url)),
  );
  const bytes = await attendancePdf(entries, data, font);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBeGreaterThan(5);
  expect(pdf.getAuthor()).toBe(data.student.full_name);
});
