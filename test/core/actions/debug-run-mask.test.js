'use strict';

/* Debug runs under Mask values: the log is an allow-list (known kinds keep their
 * shape with the literals hidden, everything else is a placeholder), and Copy
 * masks every value. All names are invented. */

import { maskLogLine, maskQuery, debugCopy, drDebugModel, parseDebugLog } from '../../../src/core/actions/debug-run.js';
import { maskValues } from '../../../src/core/shared/mask.js';
import { drResult } from '../../fixtures/debug-runs.js';

describe('maskLogLine keeps only the shape of known lines', () => {
  it('turns free text into its kind word and a placeholder', () => {
    expect(maskLogLine('Run started for Zed Example')).toBe('Info: •••');
    expect(maskLogLine('Input: {"name":"Zed Example","accountId":"x"}')).toBe('Info: •••');
    expect(maskLogLine('')).toBe('Info: •••');
    expect(maskLogLine(undefined)).toBe('Info: •••');
  });

  it('does the same to a line that had no time stamp', () => {
    const [line] = parseDebugLog(['Run started for Zed Example']);
    expect(line.at).toBeNull();
    expect(maskLogLine(line.text)).toBe('Info: •••');
    const [query] = parseDebugLog(["Query: SELECT Id FROM Account WHERE Name = 'Zed Example'"]);
    expect(maskLogLine(query.text)).toBe("Query: SELECT Id FROM Account WHERE Name = '•••'");
  });

  it('hides single- and double-quoted literals in a query', () => {
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Name = "Sentinel Double"')).toBe('Query: SELECT Id FROM Account WHERE Name = "•••"');
    expect(maskLogLine("Query: SELECT Id FROM Account WHERE Name = 'Sentinel Single'")).toBe("Query: SELECT Id FROM Account WHERE Name = '•••'");
  });

  it('closes a literal that is not closed at the end of the line', () => {
    expect(maskLogLine("Query: SELECT Id FROM Account WHERE Name = 'Unterminated Fred")).toBe("Query: SELECT Id FROM Account WHERE Name = '•••'");
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Name = "Unterminated Fred')).toBe('Query: SELECT Id FROM Account WHERE Name = "•••"');
    expect(maskLogLine("Query: SELECT Id FROM Account WHERE Name = 'Ends with slash\\")).toBe("Query: SELECT Id FROM Account WHERE Name = '•••'");
  });

  it('hides numbers compared in a query and the values of an IN list, not LIMIT', () => {
    expect(maskLogLine('Query: SELECT Id FROM Opportunity WHERE Amount > 5000 AND Stage != 7.5 LIMIT 10'))
      .toBe('Query: SELECT Id FROM Opportunity WHERE Amount > ••• AND Stage != ••• LIMIT 10');
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Rank IN (1, 22, 333)')).toBe('Query: SELECT Id FROM Account WHERE Rank IN (•••, •••, •••)');
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Rank >= -3 AND Active = true')).toBe('Query: SELECT Id FROM Account WHERE Rank >= ••• AND Active = true');
  });

  it('hides Ids with or without a digit', () => {
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Id = ABCDEFGHIJKLMNO')).toBe('Query: SELECT Id FROM Account WHERE Id = •••');
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Id IN (ABCDEFGHIJKLMNOPQR)')).toBe('Query: SELECT Id FROM Account WHERE Id IN (•••)');
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Id = 001000000000001AAA')).toBe('Query: SELECT Id FROM Account WHERE Id = •••');
    expect(maskLogLine('Query: SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Contact)')).toBe('Query: SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Contact)');
  });

  it('keeps counts and times, but not a line that only starts like one', () => {
    expect(maskLogLine('Query results found: 3')).toBe('Query results found: 3');
    expect(maskLogLine('Query time: 14 ms')).toBe('Query time: 14 ms');
    expect(maskLogLine('Time in Server: 410')).toBe('Time in Server: 410');
    expect(maskLogLine('Query results found: Zed Example')).toBe('Query results found: •••');
    expect(maskLogLine('Query time: for Zed Example')).toBe('Query time: •••');
  });

  it('is stable when applied to its own result, and maskQuery masks a bare SOQL', () => {
    ['Info: •••', 'Query: •••', "Query: SELECT Id FROM Account WHERE Name = '•••'", 'Query results found: •••'].forEach((text) => {
      expect(maskLogLine(text)).toBe(text);
    });
    expect(maskQuery("SELECT Id FROM Account WHERE Name = 'Zed'")).toBe("SELECT Id FROM Account WHERE Name = '•••'");
  });
});

describe('Debug Copy under Mask values', () => {
  it('masks the interface info of a DataRaptor', () => {
    const answer = { ...drResult(), interfaceInfo: { DRDemoGetAccount: 'Zed Example' } };
    const copy = debugCopy({ debug: 'dr' }, drDebugModel(answer), maskValues);
    expect(copy.interfaceInfo).toEqual({ DRDemoGetAccount: '<string>' });
    expect(JSON.stringify(copy)).not.toContain('Zed Example');
    expect(debugCopy({ debug: 'dr' }, drDebugModel(answer), undefined).interfaceInfo).toEqual({ DRDemoGetAccount: 'Zed Example' });
  });

  it('masks free text in the log lines', () => {
    const answer = { ...drResult(), debugLog: ['2026-03-02T09:20:00.000Z: Run started for Zed Example', 'no stamp Sentinel Free'] };
    const copy = debugCopy({ debug: 'dr' }, drDebugModel(answer), maskValues);
    expect(JSON.stringify(copy)).not.toContain('Zed Example');
    expect(JSON.stringify(copy)).not.toContain('Sentinel Free');
    expect(copy.log.map((line) => line.text)).toEqual(['Info: •••', 'Info: •••']);
  });
});
