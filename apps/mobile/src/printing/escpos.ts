import type { ReceiptTemplate } from "@workshop-pos/core";

/**
 * ESC/POS command encoder for 58/80 mm thermal paper.
 *
 * The bytes are produced here, independent of any SDK, so a printer pilot can
 * swap the transport without touching layout. Characters outside the printer's
 * default code page are transliterated (`−` → `-`, `—` → `-`, `×` → `x`) so an
 * amount or a stamp never turns into a control byte.
 */

const ESC = 0x1b;
const GS = 0x1d;

const TRANSLITERATION: Record<string, string> = {
  "\u2212": "-",
  "\u2014": "-",
  "\u2013": "-",
  "\u2022": "*",
  "\u00d7": "x",
  "\u00a0": " ",
};

export function toPrinterAscii(text: string): string {
  let output = "";
  for (const character of text.normalize("NFKD")) {
    const replacement = TRANSLITERATION[character];
    if (replacement !== undefined) {
      output += replacement;
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    output += code >= 0x20 && code <= 0x7e ? character : "?";
  }
  return output;
}

export function encodeEscPos(template: ReceiptTemplate): Uint8Array {
  const bytes: number[] = [ESC, 0x40]; // initialize
  bytes.push(ESC, 0x61, 0x00); // left align
  for (const row of template.rows) {
    const line = toPrinterAscii(row).slice(0, template.columns);
    for (const character of line) {
      bytes.push(character.charCodeAt(0));
    }
    bytes.push(0x0a);
  }
  bytes.push(0x0a, 0x0a, 0x0a);
  bytes.push(GS, 0x56, 0x00); // full cut
  return Uint8Array.from(bytes);
}
