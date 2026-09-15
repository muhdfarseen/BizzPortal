import { Injectable } from '@angular/core';
import { SheetCell, parseCsv, sheetKind } from '../models/sheet.model';

/**
 * Turns an uploaded file into a matrix of cells, header row included.
 *
 * <p>Shared by both bulk uploads, because reading the file is the one part of them
 * that is identical: the score sheet and the status sheet differ in what their
 * columns mean, not in how the bytes are read.
 *
 * <p>The Excel reader is imported on demand, so a session that only ever handles
 * CSV — the format the portal hands out — never pays for the Excel parser.
 */
@Injectable({ providedIn: 'root' })
export class SheetReaderService {
  /**
   * @throws Error when the file is neither a CSV nor an Excel workbook, naming it so
   *         the message can be shown as it is.
   */
  async read(file: File): Promise<SheetCell[][]> {
    const kind = sheetKind(file.name);
    if (kind === 'csv') {
      return parseCsv(await file.text());
    }
    if (kind === 'excel') {
      const { default: readXlsxFile } = await import('read-excel-file');
      return (await readXlsxFile(file)) as SheetCell[][];
    }
    throw new Error(`${file.name} is not a CSV or Excel file.`);
  }
}
