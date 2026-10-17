import ExcelJS from "exceljs";

export interface ExtractedXlsxDocument {
  content: string;
  worksheetCount: number;
  worksheetsWithContent: number;
  rowCount: number;
}

function formatCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && "formula" in value) {
    const formulaValue = value as ExcelJS.CellFormulaValue;
    const result = formulaValue.result;

    return result === null || result === undefined
      ? `Képlet: ${formulaValue.formula}`
      : `${String(result)} (képlet: ${formulaValue.formula})`;
  }

  if (typeof value === "object" && "richText" in value) {
    return value.richText
      .map((item) => item.text)
      .join("");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return cell.text?.trim() || String(value).trim();
}

/*
 * XLSX munkafüzet szöveges feldolgozása.
 * Makrókat nem futtat, diagramokat és képekbe írt szöveget nem értelmez.
 */
export async function extractTextFromXlsx(
  xlsxBuffer: Buffer
): Promise<ExtractedXlsxDocument> {
  const workbook = new ExcelJS.Workbook();
  const workbookData = xlsxBuffer.buffer.slice(
    xlsxBuffer.byteOffset,
    xlsxBuffer.byteOffset + xlsxBuffer.byteLength
  ) as ArrayBuffer;

  await workbook.xlsx.load(workbookData);

  const sections: string[] = [];
  let worksheetsWithContent = 0;
  let totalRowCount = 0;

  workbook.eachSheet((worksheet) => {
    const worksheetRows: string[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];

      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const text = formatCellValue(cell);

        if (text.length > 0) {
          const columnLetter = worksheet.getColumn(columnNumber).letter;
          cells.push(`${columnLetter}${rowNumber}: ${text}`);
        }
      });

      if (cells.length > 0) {
        worksheetRows.push(
          `[[XLSX_ROW:${rowNumber}]]\n${cells.join(" | ")}`
        );
        totalRowCount += 1;
      }
    });

    if (worksheetRows.length > 0) {
      worksheetsWithContent += 1;
      sections.push(
        `[[XLSX_SHEET:${worksheet.name}]]\n${worksheetRows.join("\n\n")}`
      );
    }
  });

  const content = sections.join("\n\n").trim();

  if (content.length < 20) {
    throw new Error(
      "Az XLSX fájl nem tartalmaz feldolgozható cellaértékeket."
    );
  }

  return {
    content,
    worksheetCount: workbook.worksheets.length,
    worksheetsWithContent,
    rowCount: totalRowCount,
  };
}
