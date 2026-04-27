export type Parser = { parse(input: string): string[] };

export const xmlParser: Parser = {
  parse(input: string): string[] {
    return Array.from(input.matchAll(/<item>(.*?)<\/item>/g)).map((m) => m[1] ?? "");
  },
};
