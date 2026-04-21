import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

export function parseTraceRows(xmlText: string): Array<Record<string, string>> {
  const parsed = parser.parse(xmlText) as {
    'trace-query-result'?: {
      node?: {
        row?: Array<Record<string, string>> | Record<string, string>;
      };
    };
  };

  const rowValue = parsed['trace-query-result']?.node?.row;
  if (!rowValue) {
    return [];
  }

  const rows = Array.isArray(rowValue) ? rowValue : [rowValue];
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key !== '#text')
        .map(([key, value]) => [key, String(value)]),
    ),
  );
}
