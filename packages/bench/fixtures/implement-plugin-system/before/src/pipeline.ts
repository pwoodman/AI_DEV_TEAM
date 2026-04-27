import { csvParser } from "./parsers/csv.js";
import { jsonParser } from "./parsers/json.js";
import { tsvParser } from "./parsers/tsv.js";
import { xmlParser } from "./parsers/xml.js";

export type Format = "csv" | "json" | "xml" | "tsv";

export function parse(input: string, format: Format): string[] {
  switch (format) {
    case "csv": return csvParser.parse(input);
    case "json": return jsonParser.parse(input);
    case "xml": return xmlParser.parse(input);
    case "tsv": return tsvParser.parse(input);
    default: throw new Error(`unknown format: ${format}`);
  }
}
