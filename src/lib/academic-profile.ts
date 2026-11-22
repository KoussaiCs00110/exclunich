export const DEPARTMENTS = ["Formation de base", "Formation supérieure"] as const;
export const GROUPS = ["A1", "A2", "A3", "A4", "A5", "A6", "B1", "B2", "B3", "B4", "B5", "B6"] as const;

/** Recognize existing spelling/case variants without guessing a student's choice. */
export function normalizeDepartment(value: string): string {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  return DEPARTMENTS.find((department) => department.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized) ?? "";
}

export function normalizeGroup(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return GROUPS.find((group) => group === normalized) ?? "";
}
