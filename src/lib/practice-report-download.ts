import {
  EncodingType,
  cacheDirectory,
  documentDirectory,
  getInfoAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  getPracticeMonthlyReportRemote,
  type PracticeMonthlyReportFile,
} from '@/services/practice';

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsv(report: PracticeMonthlyReportFile): string {
  const header = ['Name', 'Phone', 'Assigned practice', ...report.dateKeys];
  const lines = [header.map(csvEscape).join(',')];
  for (const row of report.rows ?? []) {
    const values = [
      row.name,
      row.phoneNumber,
      row.assignment,
      ...report.dateKeys.map((dateKey) => row.cells?.[dateKey] ?? ''),
    ];
    lines.push(values.map((value) => csvEscape(String(value))).join(','));
  }
  // BOM so Excel on Windows recognizes UTF-8.
  return `\uFEFF${lines.join('\n')}`;
}

function resolveStorageDirectory(): string {
  const directory = documentDirectory ?? cacheDirectory ?? undefined;
  if (!directory) {
    throw new Error('File storage is not available in this Expo Go session.');
  }
  return directory;
}

async function writeAndShare(input: {
  fileName: string;
  contents: string;
  encoding: 'utf8' | 'base64';
  mimeType: string;
  uti: string;
}) {
  const directory = resolveStorageDirectory();
  const targetUri = `${directory}${input.fileName}`;

  await writeAsStringAsync(targetUri, input.contents, {
    encoding: input.encoding === 'base64' ? EncodingType.Base64 : EncodingType.UTF8,
  });

  const info = await getInfoAsync(targetUri);
  if (!info.exists) {
    throw new Error('Could not write the report file to device storage.');
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error(
      Platform.OS === 'web'
        ? 'Sharing is not available in the browser.'
        : 'Sharing is not available in this Expo Go build.'
    );
  }

  await Sharing.shareAsync(targetUri, {
    mimeType: input.mimeType,
    dialogTitle: input.fileName,
    UTI: input.uti,
  });

  return targetUri;
}

/**
 * Download the monthly practice Excel for a group and open the native share sheet.
 * On Expo Go, falls back to CSV if binary .xlsx write/share fails.
 */
export async function downloadPracticeMonthlyReport(
  groupId: string
): Promise<PracticeMonthlyReportFile> {
  const report = await getPracticeMonthlyReportRemote(groupId);
  if (!report?.fileName) {
    throw new Error('Report response was empty.');
  }

  const errors: string[] = [];

  if (report.base64) {
    try {
      await writeAndShare({
        fileName: report.fileName,
        contents: report.base64,
        encoding: 'base64',
        mimeType:
          report.mimeType ||
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uti: 'org.openxmlformats.spreadsheetml.sheet',
      });
      return report;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    errors.push('Server did not return an Excel file payload.');
  }

  // Expo Go–friendly fallback: UTF-8 CSV opens cleanly in Excel / Sheets.
  if (Array.isArray(report.rows) && report.rows.length >= 0 && Array.isArray(report.dateKeys)) {
    try {
      const csvName = report.fileName.replace(/\.xlsx$/i, '.csv');
      await writeAndShare({
        fileName: csvName,
        contents: buildCsv(report),
        encoding: 'utf8',
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
      });
      return {
        ...report,
        fileName: csvName,
        mimeType: 'text/csv',
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.filter(Boolean).join(' | ') || 'Could not save or share the report.');
}
