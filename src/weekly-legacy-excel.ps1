# Read/write Excel through the installed desktop Excel, preserving other sheets.
# Future Weekly rows can contain valid pre-filled formulas even while their date is blank.
# Do not erase those formulas or treat every formula as occupied manual data.
# The script returns raw headings. Column identification is done by the Node layout resolver.
param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$excel = $null
$book = $null
$phase = 'start'
$targetCell = ''
try {
  $phase = 'read import request'
  $job = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not (Test-Path -LiteralPath $job.workbook -PathType Leaf)) { throw 'Weekly workbook not found.' }
  $phase = 'start Microsoft Excel'
  try { $excel = New-Object -ComObject Excel.Application } catch { throw 'Microsoft Excel desktop is required to work with an .xls workbook.' }
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $excel.AskToUpdateLinks = $false
  # Prevent macros from executing when opening a report as a data file.
  try { $excel.AutomationSecurity = 3 } catch {}
  $readOnly = $job.action -ne 'write'
  $phase = 'open workbook'
  $book = $excel.Workbooks.Open([string]$job.workbook, 0, $readOnly)
  $sheet = $null
  $phase = 'find Weekly worksheet'
  foreach ($tab in $book.Worksheets) {
    if ($tab.Name.Trim().ToLowerInvariant() -eq 'weekly') { $sheet = $tab; break }
  }
  if ($null -eq $sheet) { throw 'The workbook does not contain a Weekly worksheet.' }
  # Only inspect occupied dates in column A, not formatted blank rows across the workbook.
  $phase = 'locate last report week'
  $last = [int]$sheet.Cells.Item($sheet.Rows.Count,1).End(-4162).Row # xlUp
  if ($last -gt 20000) { throw 'The Weekly worksheet exceeds the supported 20,000 report rows.' }
  $phase = 'read column headers'
  $maxReadRow = [Math]::Max(1, $last)
  $sheetMatrix = $sheet.Range($sheet.Cells.Item(1,1),$sheet.Cells.Item($maxReadRow,32)).Value2
  $matrixRowBase = 1
  $matrixColBase = 1
  if ($sheetMatrix -is [Array]) {
    $matrixRowBase = $sheetMatrix.GetLowerBound(0)
    $matrixColBase = $sheetMatrix.GetLowerBound(1)
  }
  $headers = @()
  for ($c=1; $c -le 32; $c++) {
    if ($sheetMatrix -is [Array]) {
      $headers += [string]$sheetMatrix.GetValue($matrixRowBase, $matrixColBase + $c - 1)
    } else {
      $headers += [string]$sheet.Cells.Item(1,$c).Value2
    }
  }
  if ($headers[0].Trim().ToLowerInvariant() -ne 'week ending') { throw 'The selected workbook has no Week Ending header at A1.' }
  function Column-Letter([int]$n) {
    $name = ''
    while ($n -gt 0) { $n--; $name = [char](65 + ($n % 26)) + $name; $n = [int][Math]::Floor($n / 26) }
    return $name
  }
  $weeks = @()
  $historyRows = @()
  $notesCol = 0
  for ($h=0; $h -lt $headers.Count; $h++) { if ($headers[$h].Trim().ToLowerInvariant() -eq 'comments') { $notesCol=$h+1; break } }
  $selectedRow = 0
  $latest = ''
  $lastDatedRow = 1
  for ($r=2; $r -le $last; $r++) {
    if ($sheetMatrix -is [Array]) {
      $raw = $sheetMatrix.GetValue($matrixRowBase + $r - 1, $matrixColBase)
    } else {
      $raw = $sheet.Cells.Item($r,1).Value2
    }
    $iso = ''
    if ($null -eq $raw -or $raw -eq '') { continue }
    try {
      if ($raw -is [double] -or $raw -is [int] -or $raw -is [decimal]) {
        $iso = [DateTime]::FromOADate([double]$raw).ToString('yyyy-MM-dd')
      } else {
        $iso = ([DateTime]::Parse([string]$raw,[Globalization.CultureInfo]::InvariantCulture)).ToString('yyyy-MM-dd')
      }
    } catch { continue }
    if ($iso -match '^\d{4}-\d{2}-\d{2}$') {
      $weeks += @{date=$iso;row=$r}
      if ($job.action -eq 'history') {
        # History is READ ONLY. Return numeric report values only, never patient data.
        $values = @{}
        for ($c=2; $c -le 18; $c++) {
          if ($sheetMatrix -is [Array]) {
            $item = $sheetMatrix.GetValue($matrixRowBase + $r - 1, $matrixColBase + $c - 1)
          } else {
            $item = $sheet.Cells.Item($r,$c).Value2
          }
          if ($null -eq $item -or [string]$item -eq '') { continue }
          $number = 0.0
          if ([double]::TryParse([string]$item,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$number)) {
            if (-not [double]::IsNaN($number) -and -not [double]::IsInfinity($number)) {
              $values[(Column-Letter $c)] = $number
            }
          }
        }
        $note = ''
        if ($notesCol -gt 0 -and $job.includeNotes) {
          if ($sheetMatrix -is [Array] -and $notesCol -ge 1 -and $notesCol -le 32) {
            $noteItem = $sheetMatrix.GetValue($matrixRowBase + $r - 1, $matrixColBase + $notesCol - 1)
          } else {
            $noteItem = $sheet.Cells.Item($r,$notesCol).Value2
          }
          if ($null -ne $noteItem) { $note = [string]$noteItem }
          if ($note.Length -gt 10000) { $note = $note.Substring(0,10000) }
        }
        $historyRows += @{ date=$iso; row=$r; values=$values; notes=$note }
      }
      $lastDatedRow = [Math]::Max($lastDatedRow,$r)
      if ($iso -gt $latest) { $latest=$iso }
      if ($iso -eq [string]$job.weekEnding) {
        if ($selectedRow -gt 0) { throw ('Duplicate week ending ' + $iso + ' in the Weekly worksheet.') }
        $selectedRow = $r
      }
    }
  }
  # Read the column name without relying on user-entered headers or current layout.

  # A future Weekly row may contain formulas prepared by the clinic's report
  # (e.g. classic E724:E739). It can safely receive a date only if its other
  # cells are blank OR contain the exact same relative formula as the preceding
  # dated row, and none of those formulas are about to be overwritten.
  # Any other contents belong to an independent row and must be shifted down.
  function Test-PreparedWeekRow($ws, [int]$candidate, [int]$previous, $updates) {
    for ($c=1; $c -le 32; $c++) {
      $cell = $ws.Cells.Item($candidate,$c)
      if ($cell.HasFormula) {
        $letter = Column-Letter $c
        if ($c -eq 1) { return $false }
        if ($null -ne $updates -and $null -ne $updates.PSObject.Properties[$letter]) { return $false }
        if ($previous -lt 2) { return $false }
        $above = $ws.Cells.Item($previous,$c)
        if (-not $above.HasFormula) { return $false }
        # Excel's FormulaR1C1 normalizes row-relative formulas such as
        # =C723 and =C724 to the same expression (=RC[-2]).
        if ([string]$cell.FormulaR1C1 -cne [string]$above.FormulaR1C1) { return $false }
      } elseif ($null -ne $cell.Value2 -and [string]$cell.Value2 -ne '') {
        return $false
      }
    }
    # If the sheet has other content beyond our reporting columns, don't
    # accidentally attach a Weekly date to that unrelated row.
    # Legacy .xls ends at column IV (256). XFD is invalid in BIFF8 and raises
    # HRESULT 0x800A03EC, even when inspecting an otherwise valid empty row.
    $used = $ws.UsedRange
    $maxUsed = [Math]::Min([int]$ws.Columns.Count, ([int]$used.Column + [int]$used.Columns.Count - 1))
    if ($maxUsed -ge 33) {
      $remainder = $ws.Range($ws.Cells.Item($candidate,33),$ws.Cells.Item($candidate,$maxUsed))
      if ($excel.WorksheetFunction.CountA($remainder) -gt 0) { return $false }
    }
    return $true
  }
  $position = $selectedRow
  if ($position -eq 0) { $position = $lastDatedRow + 1 }
  $existingPhysical = @{}
  if ($selectedRow -gt 0) {
    for ($c=2; $c -le 32; $c++) {
      $letter = [string]$sheet.Cells.Item(1,$c).Address($false,$false)
      $letter = $letter -replace '1$',''
      $cell = $sheet.Cells.Item($selectedRow,$c)
      if ($cell.HasFormula) { $existingPhysical[$letter]=[string]$cell.Formula }
      elseif ($null -ne $cell.Value2) { $existingPhysical[$letter]=$cell.Value2 }
      else { $existingPhysical[$letter]=$null }
    }
  }
  if ($job.action -eq 'write') {
    $phase = 'validate workbook edit permissions'
    if ($sheet.ProtectContents) { throw 'The Weekly worksheet is protected against editing. Unprotect the sheet in Excel before saving.' }
    if ($book.ReadOnly) { throw 'The workbook is read-only. Close it in Excel and verify write permissions.' }
    if ($position -gt $lastDatedRow -and $latest -and [string]$job.weekEnding -lt $latest) { throw 'Cannot add an older week after the last reporting row.' }
    if ($null -eq $job.allowed -or $null -eq $job.updates) { throw 'The column protection map is missing.' }
    # Check every target column against the exact heading identified in the read phase.
    # This protects historic reports whose physical column positions differ from newer ones.
    $phase = 'verify column headings'
    foreach ($prop in $job.updates.PSObject.Properties) {
      $letter = [string]$prop.Name
      $targetCell = $letter + '1'
      if ($letter -notmatch '^[A-Z]{1,2}$') { throw 'Invalid target column.' }
      $expected = $job.allowed.PSObject.Properties[$letter]
      if ($null -eq $expected) { throw 'An unapproved worksheet column was requested.' }
      $actual = [string]$sheet.Range($letter + '1').Value2
      if ($actual -cne [string]$expected.Value) { throw ('The header for ' + $letter + ' changed since the report was reviewed. Nothing was modified.') }
    }
    $targetCell = ''
    $rowAction = 'update-existing'
    if ($position -gt $lastDatedRow) {
      $phase = 'inspect destination row '+$position
      $safePreparedRow = Test-PreparedWeekRow $sheet $position $lastDatedRow $job.updates
      if (-not $safePreparedRow) {
        # Excel adjusts references, conditional formatting and ranges when a
        # complete row is inserted. We never overwrite the data that was here.
        $phase = 'insert new report row '+$position
        $sheet.Rows.Item($position).EntireRow.Insert()
        $rowAction = 'insert-before-existing-content'
      } else {
        $rowAction = 'reuse-empty-or-template-row'
      }
      # Existing report templates contain formatting and live formulas below the
      # last date. Do not Copy/PasteSpecial a 18-column range: it can raise
      # 0x800A03EC on certain BIFF8 templates and merged/locked cells.
      # Reusing a prepared row preserves its existing styles. Excel row insertion
      # inherits adjacent row styles automatically.
      $phase = 'write Week Ending date at A' + $position
      $targetCell = 'A' + $position
      $sheet.Range('A' + $position).Value2 = ([DateTime]::ParseExact([string]$job.weekEnding,'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture)).ToOADate()
      $sheet.Range('A' + $position).NumberFormat = 'mm/dd/yyyy'
      $targetCell = ''
    }
    foreach ($prop in $job.updates.PSObject.Properties) {
      $letter = [string]$prop.Name
      $targetCell = $letter + $position
      $phase = 'write indicator into ' + $targetCell
      $cell = $sheet.Range($targetCell)
      # Merged areas may be written only through their top-left anchor.
      if ($cell.MergeCells) {
        $anchor = [string]$cell.MergeArea.Cells.Item(1,1).Address($false,$false)
        if ($anchor -cne $targetCell) { throw ('Destination cell is part of a merged range anchored at ' + $anchor) }
      }
      if ($prop.Value -is [string]) { $cell.Value2 = [string]$prop.Value }
      else { $cell.Value2 = [double]$prop.Value }
    }
    $targetCell = ''
    $phase = 'save workbook to disk'
    $book.Save()
    if (-not $book.Saved) { throw 'Excel did not confirm that the Weekly workbook was saved.' }
    $phase = 'save completed'
  }
  $result = @{ok=$true;rowAction=$rowAction;headers=$headers;weeks=@($weeks);latestDate=$latest;row=$position;exists=($selectedRow -gt 0);existingPhysical=$existingPhysical;historyRows=@($historyRows)}
  $json = ConvertTo-Json -InputObject $result -Compress -Depth 10
  [System.IO.File]::WriteAllText($OutputPath,$json,[System.Text.Encoding]::UTF8)
} catch {
  $details = [string]$_.Exception.Message
  $hresult = ('0x{0:X8}' -f ([uint32]([int64]$_.Exception.HResult -band 4294967295)))
  $result = @{ok=$false;error=('[Excel step: ' + $phase + '] ' + $details + $(if($targetCell){' (cell '+$targetCell+')'}else{''}) + ' [HRESULT ' + $hresult + ']');phase=$phase;cell=$targetCell;hresult=$hresult}
  $json = ConvertTo-Json -InputObject $result -Compress -Depth 4
  [System.IO.File]::WriteAllText($OutputPath,$json,[System.Text.Encoding]::UTF8)
  exit 1
} finally {
  if ($null -ne $book) { try { $book.Close($false) } catch {} ; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book) } catch {} }
  if ($null -ne $excel) { try { $excel.Quit() } catch {}; try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {} }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
