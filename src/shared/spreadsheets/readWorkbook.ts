import * as XLSX from 'xlsx';

/**
 * Excel normally writes Vietnamese CSV as UTF-8 with BOM. Older Excel versions
 * may use Windows-1258 instead. Decode CSV explicitly before handing it to
 * SheetJS; XLSX files keep their original binary decoding.
 */
function decodeCsv(buffer: Buffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1258').decode(bytes).replace(/^\uFEFF/, '');
  }
}

function delimiterOf(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  return firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
}

export function readWorkbookForImport(buffer: Buffer, fileName = ''): XLSX.WorkBook {
  if (!/\.csv$/i.test(fileName)) return XLSX.read(buffer, { type: 'buffer', raw: true });
  const text = decodeCsv(buffer);
  return XLSX.read(text, { type: 'string', raw: true, codepage: 65001, FS: delimiterOf(text) });
}
