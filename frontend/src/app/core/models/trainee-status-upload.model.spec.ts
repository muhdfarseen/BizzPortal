import {
  TraineeStatusLookup,
  acceptedStatusText,
  buildStatusErrorCsv,
  parseSheetDate,
  parseTraineeStatus,
  readyRows,
  statusSheetEmployeeIds,
  validateStatusUpload,
} from './trainee-status-upload.model';

/** The header the server writes, which is what a downloaded sheet carries. */
const HEADER = [
  'Emp ID',
  'Name',
  'Pre',
  'Current Status',
  'New Status',
  'Effective Date',
  'Remark',
];

/** The day the sheet is judged on, fixed so the specs do not depend on the clock. */
const TODAY = '2026-06-01';

/**
 * A group of two: one regular, one on Remedial since 2 February. Between them they
 * cover every "what do they hold now" rule the preview enforces.
 */
const GROUP: TraineeStatusLookup = {
  trainees: [
    { employeeId: '41201', name: 'Aarav Nair', status: null, startDate: null },
    { employeeId: '41202', name: 'Meera Iyer', status: 'remedial', startDate: '2026-02-02' },
  ],
};

/** A sheet built from the template's header plus the rows given. */
function sheet(...rows: readonly string[][]): string[][] {
  return [HEADER, ...rows.map((row) => [...row])];
}

/** One row of the template's shape, with the columns a spec does not care about blank. */
function row(
  employeeId: string,
  status: string,
  effectiveDate = '',
  remark = '',
  name = '',
  current = '',
): string[] {
  return [employeeId, name, '', current, status, effectiveDate, remark];
}

function judge(rows: readonly (readonly string[])[]) {
  return validateStatusUpload({ rows, group: GROUP, today: TODAY });
}

/** The error codes of the first data row. */
function codes(rows: readonly (readonly string[])[]) {
  return judge(rows).rows[0]?.errors.map((error) => error.code) ?? [];
}

describe('validateStatusUpload', () => {
  describe('the sheet itself', () => {
    it('refuses an empty file', () => {
      expect(judge([]).sheetError).toBe('The file is empty.');
    });

    it('names the columns a sheet is missing rather than judging every row against them', () => {
      const result = judge([
        ['Emp ID', 'Name'],
        ['41201', 'Aarav Nair'],
      ]);

      expect(result.sheetError).toContain('New Status');
      expect(result.sheetError).toContain('Effective Date');
      expect(result.sheetError).toContain('Remark');
      expect(result.rows).toEqual([]);
    });

    it('reads the reference columns being deleted as a usable sheet', () => {
      // The marks, the name and the current status are there for the person reading
      // the sheet, so a sheet without them still says everything the upload needs.
      const result = judge([
        ['Emp ID', 'New Status', 'Effective Date', 'Remark'],
        ['41201', 'lap', '2026-06-01', 'Needs more than remedial.'],
      ]);

      expect(result.sheetError).toBeNull();
      expect(result.readyRows).toBe(1);
    });

    it('accepts the column names however they were spelled', () => {
      const result = judge([
        ['Employee ID', 'Status', 'Date', 'Reason'],
        ['41201', 'lap', '2026-06-01', 'Needs more than remedial.'],
      ]);

      expect(result.readyRows).toBe(1);
    });

    it('skips a row that holds nothing at all', () => {
      const result = judge(sheet(row('41201', ''), ['', '', '', '', '', '', '']));

      expect(result.rows).toHaveLength(1);
      expect(result.unchangedRows).toBe(1);
    });
  });

  describe('a row left blank', () => {
    it('asks for nothing, whatever else it holds', () => {
      // A stray date or note beside an empty status is not an instruction, and
      // failing the row for it would make the sheet unusable.
      const result = judge(sheet(row('41201', '', '2026-06-01', 'Something to say later.')));

      expect(result.sheetError).toBeNull();
      expect(result.rows[0].errors).toEqual([]);
      expect(result.rows[0].ok).toBe(false);
      expect(result.unchangedRows).toBe(1);
      expect(result.readyRows).toBe(0);
      expect(result.errorRows).toBe(0);
    });
  });

  describe('the status column', () => {
    it('accepts a status however it was written', () => {
      expect(parseTraineeStatus('LAP')).toBe('lap');
      expect(parseTraineeStatus(' lap ')).toBe('lap');
      expect(parseTraineeStatus('Discontinued')).toBe('discontinued');
      expect(parseTraineeStatus('Regular')).toBe('regular');
      expect(parseTraineeStatus('none')).toBe('regular');
    });

    it('does not know a word that is not a status', () => {
      expect(parseTraineeStatus('promoted')).toBeNull();
      expect(parseTraineeStatus('')).toBeNull();
    });

    it('refuses a status it does not know, and says which it does', () => {
      const result = judge(sheet(row('41201', 'promoted', '2026-06-01', 'A reason.')));

      expect(codes(sheet(row('41201', 'promoted', '2026-06-01', 'A reason.')))).toEqual([
        'invalid-status',
      ]);
      expect(result.rows[0].errors[0].message).toContain(acceptedStatusText());
    });

    it('refuses the status the trainee already holds, rather than discarding the reason', () => {
      const result = judge(sheet(row('41202', 'remedial', '2026-06-01', 'Typed again.')));

      expect(codes(sheet(row('41202', 'remedial', '2026-06-01', 'Typed again.')))).toEqual([
        'already-holds',
      ]);
      expect(result.rows[0].errors[0].message).toBe('41202 already holds Remedial.');
    });

    it('refuses to end a status for a trainee who holds none', () => {
      const result = judge(sheet(row('41201', 'regular', '2026-06-01', 'Nothing to end.')));

      expect(codes(sheet(row('41201', 'regular', '2026-06-01', 'Nothing to end.')))).toEqual([
        'nothing-to-end',
      ]);
      expect(result.rows[0].errors[0].message).toBe(
        '41201 is already regular — they hold no status to end.',
      );
    });

    it('lets a trainee who holds a status return to regular', () => {
      expect(codes(sheet(row('41202', 'regular', '2026-06-01', 'Completed.')))).toEqual([]);
    });
  });

  describe('the trainee column', () => {
    it('refuses a number that is not in the group', () => {
      const rows = sheet(row('41999', 'lap', '2026-06-01', 'A reason.'));
      expect(codes(rows)).toEqual(['unknown-empid']);
      expect(judge(rows).rows[0].errors[0].message).toBe('41999 is not in this group.');
    });

    it('refuses a cell that is not a number at all', () => {
      expect(codes(sheet(row('EMP-1', 'lap', '2026-06-01', 'A reason.')))).toEqual([
        'invalid-empid',
      ]);
    });

    it('refuses a number listed twice, which would contradict itself', () => {
      const result = judge(
        sheet(
          row('41201', 'lap', '2026-06-01', 'First.'),
          row('41201', 'cleared', '2026-06-01', 'Second.'),
        ),
      );

      expect(result.rows[1].errors.map((error) => error.code)).toEqual(['duplicate-empid']);
      expect(result.readyRows).toBe(1);
      expect(result.errorRows).toBe(1);
    });

    it('finds the trainee behind a leading zero or a stray space', () => {
      // A spreadsheet that formatted the column as a number should still match.
      expect(codes(sheet(row('041201', 'lap', '2026-06-01', 'A reason.')))).toEqual([]);
      expect(codes(sheet(row(' 41201 ', 'lap', '2026-06-01', 'A reason.')))).toEqual([]);
    });

    it('reports a missing number rather than silently skipping the row', () => {
      expect(codes(sheet(row('', 'lap', '2026-06-01', 'A reason.')))).toEqual(['missing-empid']);
    });
  });

  describe('the date column', () => {
    it('reads the format the template asks for', () => {
      expect(parseSheetDate('2026-02-02')).toBe('2026-02-02');
      expect(parseSheetDate('2026-2-2')).toBe('2026-02-02');
    });

    it('reads a date written the day-first way, as a hand-filled sheet may be', () => {
      expect(parseSheetDate('02/02/2026')).toBe('2026-02-02');
      expect(parseSheetDate('2-2-2026')).toBe('2026-02-02');
    });

    it('reads a date cell Excel formatted as a date', () => {
      expect(parseSheetDate(new Date('2026-02-02T00:00:00.000Z'))).toBe('2026-02-02');
    });

    it('refuses a day that does not exist rather than rolling it forward', () => {
      expect(parseSheetDate('2026-02-31')).toBeNull();
      expect(parseSheetDate('31/02/2026')).toBeNull();
      expect(parseSheetDate('not a date')).toBeNull();
    });

    it('dates a blank cell today, which is what the dialog offers for one change', () => {
      const result = judge(sheet(row('41201', 'lap', '', 'A reason.')));

      expect(result.rows[0].errors).toEqual([]);
      expect(result.rows[0].effectiveDate).toBe(TODAY);
      expect(result.rows[0].effectiveDateText).toBe('');
    });

    it('refuses a date in the future', () => {
      expect(codes(sheet(row('41201', 'lap', '2099-01-01', 'A reason.')))).toEqual(['future-date']);
    });

    it('allows tomorrow, because a user east of the server is already on it', () => {
      expect(codes(sheet(row('41201', 'lap', '2026-06-02', 'A reason.')))).toEqual([]);
    });

    it('refuses a date before the status it replaces began', () => {
      const rows = sheet(row('41202', 'lap', '2026-01-05', 'Too early.'));
      expect(codes(rows)).toEqual(['backdated']);
      expect(judge(rows).rows[0].errors[0].message).toBe(
        'This trainee has been on Remedial since 2026-02-02. Choose that date or later.',
      );
    });

    it('allows the very day the current status began', () => {
      expect(codes(sheet(row('41202', 'lap', '2026-02-02', 'Same day.')))).toEqual([]);
    });
  });

  describe('the reason column', () => {
    it('requires one, because an unexplained change is not auditable', () => {
      expect(codes(sheet(row('41201', 'lap', '2026-06-01', '')))).toEqual(['missing-remark']);
    });

    it('treats a column of spaces as no reason at all', () => {
      expect(codes(sheet(row('41201', 'lap', '2026-06-01', '    ')))).toEqual(['missing-remark']);
    });

    it('refuses a reason longer than the server takes', () => {
      expect(codes(sheet(row('41201', 'lap', '2026-06-01', 'x'.repeat(501))))).toEqual([
        'remark-too-long',
      ]);
      expect(codes(sheet(row('41201', 'lap', '2026-06-01', 'x'.repeat(500))))).toEqual([]);
    });
  });

  describe('the counts the preview reports', () => {
    it('separates what will be applied from what failed and what was left alone', () => {
      const result = judge(
        sheet(
          row('41201', 'lap', '2026-06-01', 'Needs more than remedial.'),
          row('41202', 'remedial', '2026-06-01', 'Typed again by mistake.'),
          row('41201', '', '', ''),
        ),
      );

      expect(result.readyRows).toBe(1);
      expect(result.errorRows).toBe(1);
      expect(result.unchangedRows).toBe(1);
      expect(result.rows).toHaveLength(3);
    });

    it('reports every problem on a row at once, so the file is fixed once', () => {
      const result = judge(sheet(row('41999', 'promoted', '2099-01-01', '')));

      expect(result.rows[0].errors.map((error) => error.code)).toEqual([
        'unknown-empid',
        'invalid-status',
        'missing-remark',
        'future-date',
      ]);
    });
  });
});

describe('readyRows', () => {
  it('keeps only the rows that will be applied', () => {
    const preview = judge(
      sheet(
        row('41201', 'lap', '2026-06-01', 'Needs more than remedial.'),
        row('41999', 'lap', '2026-06-01', 'Unknown trainee.'),
      ),
    );

    expect(readyRows(preview).map((row) => row.employeeId)).toEqual(['41201']);
  });
});

describe('statusSheetEmployeeIds', () => {
  it('collects the distinct numbers the sheet names', () => {
    expect(statusSheetEmployeeIds(sheet(row('41201', 'lap'), row('41202', 'cleared')))).toEqual([
      41201, 41202,
    ]);
  });

  it('finds none in a sheet whose required columns are missing', () => {
    // There is nothing worth looking up in a sheet that is going to be refused.
    expect(
      statusSheetEmployeeIds([
        ['Emp ID', 'Name'],
        ['41201', 'Aarav Nair'],
      ]),
    ).toEqual([]);
  });

  it('finds none in a sheet with no data rows', () => {
    expect(statusSheetEmployeeIds([HEADER])).toEqual([]);
  });
});

describe('buildStatusErrorCsv', () => {
  it('writes one line per problem, with the row number the reader shows', () => {
    const preview = judge(
      sheet(row('41201', 'lap', '2026-06-01', 'Fine.'), row('41999', 'promoted', '', '')),
    );

    const lines = buildStatusErrorCsv(preview).split('\r\n');
    expect(lines[0]).toBe('Row,Emp ID,Name,New Status,Effective Date,Remark,Issue');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('3,41999');
    expect(lines[1]).toContain('promoted');
    expect(lines[1]).toContain('is not in this group');
  });

  it('is only the header when nothing failed', () => {
    const preview = judge(sheet(row('41201', 'lap', '2026-06-01', 'Fine.')));

    expect(buildStatusErrorCsv(preview)).toBe(
      'Row,Emp ID,Name,New Status,Effective Date,Remark,Issue',
    );
  });
});
