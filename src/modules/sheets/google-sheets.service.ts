import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, sheets_v4 } from 'googleapis';
import { SHEETS_CALL_TIMEOUT_MS, withTimeout } from '../../common/with-timeout';
import { SHEET_HEADERS, SheetTabName } from './sheets.constants';

export type SheetCell = string | number | boolean | null;

/**
 * Low-level Google Sheets client.
 * No-ops when credentials/spreadsheet are not configured so the app still runs.
 */
@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private readonly spreadsheetId: string;
  private readonly sheets: sheets_v4.Sheets | null;
  private readonly ensuredTabs = new Set<string>();
  private readonly sheetIdCache = new Map<string, number>();
  /** Serializes writeRow/removeRowById per tab so a delete's row-shift can never race a stale-index update. */
  private readonly tabLocks = new Map<string, Promise<void>>();

  constructor(private readonly configService: ConfigService) {
    this.spreadsheetId =
      this.configService.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID')?.trim() ??
      '';
    const email =
      this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL')?.trim() ??
      '';
    const rawKey =
      this.configService.get<string>('GOOGLE_PRIVATE_KEY')?.trim() ?? '';

    if (!this.spreadsheetId || !email || !rawKey) {
      this.sheets = null;
      this.logger.warn(
        'Google Sheets sync disabled (missing GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)',
      );
      return;
    }

    const privateKey = rawKey.replace(/\\n/g, '\n');
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  isEnabled(): boolean {
    return this.sheets !== null && this.spreadsheetId.length > 0;
  }

  /**
   * Upsert a row keyed by column A (stable DB id).
   * Updates existing row or appends a new one — no duplicates by id.
   */
  async upsertRowById(
    tab: SheetTabName,
    id: string,
    row: SheetCell[],
  ): Promise<void> {
    if (!this.isEnabled() || !this.sheets) {
      return;
    }

    await withTimeout(
      this.writeRow(tab, id, row),
      SHEETS_CALL_TIMEOUT_MS,
      'google_sheets_upsert',
    );
  }

  /**
   * Delete the row whose column A equals `id`.
   * No-op if the row is already missing (idempotent).
   */
  async deleteRowById(tab: SheetTabName, id: string): Promise<void> {
    if (!this.isEnabled() || !this.sheets) {
      return;
    }

    await withTimeout(
      this.removeRowById(tab, id),
      SHEETS_CALL_TIMEOUT_MS,
      'google_sheets_delete',
    );
  }

  /**
   * Runs `fn` after every previously queued op on this tab has settled, so
   * row-index reads/writes on the same tab never interleave with a
   * structural change (deleteDimension) from another call.
   */
  private withTabLock<T>(tab: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tabLocks.get(tab) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    this.tabLocks.set(
      tab,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  private async writeRow(
    tab: SheetTabName,
    id: string,
    row: SheetCell[],
  ): Promise<void> {
    if (!this.sheets) {
      return;
    }
    await this.withTabLock(tab, async () => {
      if (!this.sheets) {
        return;
      }
      await this.ensureTabWithHeaders(tab);
      const rowIndex = await this.findRowIndexById(tab, id);
      const values = [row.map((cell) => (cell == null ? '' : cell))];

      if (rowIndex == null) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${tab}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values },
        });
        return;
      }

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${tab}!A${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    });
  }

  private async removeRowById(tab: SheetTabName, id: string): Promise<void> {
    if (!this.sheets) {
      return;
    }
    await this.withTabLock(tab, async () => {
      if (!this.sheets) {
        return;
      }
      await this.ensureTabWithHeaders(tab);
      const rowIndex = await this.findRowIndexById(tab, id);
      if (rowIndex == null || rowIndex <= 1) {
        // Missing, or would delete the header row — treat as done.
        return;
      }

      const sheetId = await this.resolveSheetId(tab);
      if (sheetId == null) {
        return;
      }

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex - 1,
                  endIndex: rowIndex,
                },
              },
            },
          ],
        },
      });
    });
  }

  private async resolveSheetId(tab: SheetTabName): Promise<number | null> {
    const cached = this.sheetIdCache.get(tab);
    if (cached != null) {
      return cached;
    }
    if (!this.sheets) {
      return null;
    }
    // Falls back to a direct fetch only if ensureTabWithHeaders (which
    // populates the cache for every known tab) somehow missed this one.
    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });
    for (const sheet of meta.data.sheets ?? []) {
      if (sheet.properties?.title && sheet.properties?.sheetId != null) {
        this.sheetIdCache.set(sheet.properties.title, sheet.properties.sheetId);
      }
    }
    return this.sheetIdCache.get(tab) ?? null;
  }

  private async findRowIndexById(
    tab: SheetTabName,
    id: string,
  ): Promise<number | null> {
    if (!this.sheets) {
      return null;
    }

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A:A`,
    });
    const rows = res.data.values ?? [];
    for (let i = 0; i < rows.length; i += 1) {
      if ((rows[i]?.[0] ?? '') === id) {
        // Sheets rows are 1-indexed.
        return i + 1;
      }
    }
    return null;
  }

  private async ensureTabWithHeaders(tab: SheetTabName): Promise<void> {
    if (!this.sheets || this.ensuredTabs.has(tab)) {
      return;
    }

    const meta = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });
    for (const sheet of meta.data.sheets ?? []) {
      if (sheet.properties?.title && sheet.properties?.sheetId != null) {
        this.sheetIdCache.set(sheet.properties.title, sheet.properties.sheetId);
      }
    }

    if (!this.sheetIdCache.has(tab)) {
      const created = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tab } } }],
        },
      });
      const newSheetId =
        created.data.replies?.[0]?.addSheet?.properties?.sheetId;
      if (newSheetId != null) {
        this.sheetIdCache.set(tab, newSheetId);
      }
    }

    const headerRes = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!1:1`,
    });
    const headerRow = headerRes.data.values?.[0] ?? [];
    const expected = [...SHEET_HEADERS[tab]];
    const matches =
      headerRow.length === expected.length &&
      expected.every((h, i) => headerRow[i] === h);

    if (!matches) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [expected] },
      });
    }

    this.ensuredTabs.add(tab);
  }
}
