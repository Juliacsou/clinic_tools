# Visual Health Clinic Tools v2.26.8 — Monthly Excel save reliability

Base: v2.26.7. Monthly/Weekly calculation rules, CSV filters, and all other modules remain unchanged.

## Corrections

1. **Legacy Excel `.xls`:** removed unsupported `$excel.CutCopyMode=0` and fragile Copy/PasteSpecial sequence. Prepared Monthly rows keep their existing formatting; previously unformatted rows receive formatting through a direct Range.Copy(destination), followed by ClearContents before values are written. Excel's Save result is verified.
2. **Annual separators:** if the month being appended is in a new calendar year, the application preserves one blank row between years (for both `.xls` and `.xlsx`), without deleting or filling any historic separators. Within the same year, the next prepared row is reused.
3. **Protected cells:** nonempty destination cells (including formulas), and nonempty year separators, block writes with a descriptive error rather than being overwritten. Existing months are edited in place. Historical months absent from the original workbook remain unsupported for automatic insertion.
4. **Formatting:** existing styles on template rows are preserved; unformatted `.xlsx` rows inherit styles from the previous report row. The original Month Year date format is retained whenever present.
5. **Post-write validation:** `monthly:write` re-reads the workbook and checks the saved row and all requested values before marking the draft as exported. A physical copy of the original workbook is created before writing. If verification fails, the error identifies the cell and the backup remains available.
6. **PowerShell inspect safety:** calling `monthly:list` without a selected month cannot cause an empty-month substring exception.

## Regression coverage

- `tests/monthly-year-separators.test.js`: tests the actual Monthly Excel adapter using an in-memory workbook, including preservation of a previously formatted year divider, both kinds of append, existing-row edit and protection against overwriting nonempty targets.
- `tests/monthly-physical-excel.test.js`: creates synthetic workbook data and tests real `.xlsx` saves with ExcelJS. When run on Windows with desktop Microsoft Excel, it additionally creates a temporary `.xls` and tests the actual COM read/write path, including year separators, same-year rows, and unformatted-row style copying. The test does not use patient data or the connected clinic workbook.
- Existing Monthly/Weekly, Family, Cancelations and project integrity tests remain included.

## Important limitations

- The source ZIP is **not** a precompiled Windows executable. The Microsoft Excel COM integration could not be executed in the Linux build environment and must pass the **real `.xls` regression test** when running `VALIDAR_SEM_BUILD.bat` or `BUILD_WINDOWS.bat` on Windows.
- `npm audit` can still report moderate issues in build-only dependencies, as in v2.26.7. Security gate and the dependency policy were not weakened.
- Test initially with a **copy of the connected Excel** with Excel closed. Do not rename, erase or modify the clinic's `data` folder or blank year divider rows.
- In very unusual worksheets with merged cells in a target Monthly row, writing may be refused instead of changing Excel layout.
