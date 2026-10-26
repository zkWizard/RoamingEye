const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface ParsedDate {
  year: number;
  month: number;
  label: string;
}

function yearOk(year: number): boolean {
  return year >= 1900 && year <= 2200;
}

/**
 * A query that is only a date: "Aug 2023", "2023-08", or a bare year.
 * Anything with extra words is left for another provider.
 */
export function parseDateQuery(query: string): ParsedDate | null {
  const text = query
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
  const named = text.match(/^([a-z]+)\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1]];
    const year = Number(named[2]);
    if (month && yearOk(year)) {
      return { year, month, label: `${MONTH_LABELS[month - 1]} ${year}` };
    }
  }
  const numeric = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (numeric) {
    const year = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (yearOk(year) && month >= 1 && month <= 12) {
      return { year, month, label: `${MONTH_LABELS[month - 1]} ${year}` };
    }
  }
  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (yearOk(year)) return { year, month: 1, label: String(year) };
  }
  return null;
}
