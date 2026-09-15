import { TestBed } from '@angular/core/testing';
import { SheetReaderService } from './sheet-reader.service';

/**
 * A real .xlsx workbook (header row plus one trainee), base64-encoded so the
 * spec needs no filesystem access. Generated once with a zip writer; the
 * numeric score 70 is stored as a number, as Excel stores a typed score.
 */
const XLSX_BASE64 =
  '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';

/** Decodes the workbook into the bytes a file input would hand over. */
function xlsxBytes(): ArrayBuffer {
  const binary = atob(XLSX_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

describe('SheetReaderService', () => {
  let service: SheetReaderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SheetReaderService);
  });

  it('reads a CSV file into a matrix of cells', async () => {
    const file = new File(['Emp ID,Name,Score\r\n41201,Aarav Nair,45'], 'scores.csv', {
      type: 'text/csv',
    });

    expect(await service.read(file)).toEqual([
      ['Emp ID', 'Name', 'Score'],
      ['41201', 'Aarav Nair', '45'],
    ]);
  });

  it('reads a .txt file as CSV, since that is how Excel saves one', async () => {
    const file = new File(['Emp ID,Name\r\n41201,Aarav Nair'], 'scores.txt');

    expect(await service.read(file)).toEqual([
      ['Emp ID', 'Name'],
      ['41201', 'Aarav Nair'],
    ]);
  });

  it('refuses a file that is neither CSV nor Excel', async () => {
    const file = new File(['%PDF-1.4'], 'scores.pdf');

    await expect(service.read(file)).rejects.toThrow('is not a CSV or Excel file');
  });

  it('reads an Excel workbook, keeping scores as numbers', async () => {
    const file = new File([xlsxBytes()], 'scores.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    expect(await service.read(file)).toEqual([
      ['Emp ID', 'Name', 'Score'],
      ['EMP-1', 'Aarav Nair', 70],
    ]);
  });
});
