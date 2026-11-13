# Read/write Monthly worksheet in .xls through local Microsoft Excel.
# Patient-level CSV rows are never persisted; the workbook is backed up by Node before writes.
param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
$excel=$null;$book=$null
try {
 $job=Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
 if (-not (Test-Path -LiteralPath $job.workbook -PathType Leaf)) { throw 'Workbook not found.' }
 $excel=New-Object -ComObject Excel.Application
 $excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.AskToUpdateLinks=$false
 try {$excel.AutomationSecurity=3} catch {}
 $book=$excel.Workbooks.Open([string]$job.workbook,0,($job.action -ne 'write'))
 $sheet=$null
 foreach($tab in $book.Worksheets){if($tab.Name.Trim().ToLowerInvariant() -eq 'monthly'){$sheet=$tab;break}}
 if($null -eq $sheet){throw 'The workbook has no Monthly worksheet.'}
 $heads=@('Month Year','# of inquiries','# free Screenings','OM Exams Done','Percept Test Done','# VT Consults Done','# New VT Starts','Total # VT Pts Enrolled','# VT Sessions','# VT Grads','# Cancellations 99215/Annuals','# Cancellations 99213/Follow ups','Comments')
 function Normalize-Header([string]$value){return ([regex]::Replace($value.ToLowerInvariant(),'[^a-z0-9]+',' ')).Trim()}
 for($c=1;$c -le 13;$c++){if((Normalize-Header ([string]$sheet.Cells.Item(1,$c).Value2)) -ne (Normalize-Header $heads[$c-1])){throw ('Unexpected Monthly heading in column '+$c)}}
 $last=[int]$sheet.Cells.Item($sheet.Rows.Count,1).End(-4162).Row
 if($last -gt 20000){throw 'Monthly sheet exceeds supported 20,000 dated rows.'}
 $rows=@();$found=0;$latest='';$seen=@{};$duplicateMonths=@{}
 for($r=2;$r -le $last;$r++){
  $raw=$sheet.Cells.Item($r,1).Value2
  if($null -eq $raw -or [string]$raw -eq ''){continue}
  try{if($raw -is [double] -or $raw -is [int] -or $raw -is [decimal]){$dt=[DateTime]::FromOADate([double]$raw)}else{$dt=[DateTime]::Parse([string]$raw,[Globalization.CultureInfo]::InvariantCulture)}}catch{continue}
  if($dt.Year -lt 2000 -or $dt.Year -gt 2100){continue}
  $month=$dt.ToString('yyyy-MM')
  if($seen.ContainsKey($month)){
   if(-not $duplicateMonths.ContainsKey($month)){$duplicateMonths[$month]=@([int]$seen[$month])}
   $duplicateMonths[$month]=@($duplicateMonths[$month])+@([int]$r)
  } else {$seen[$month]=[int]$r}
  $latest=[string]$(if($month -gt $latest){$month}else{$latest})
  $values=@{}
  for($c=2;$c -le 13;$c++){ $letter=[string][char](64+$c);$item=$sheet.Cells.Item($r,$c).Value2;if($null -ne $item){$values[$letter]=$item} }
  $rows+=@{month=$month;row=$r;values=$values}
  if($month -eq [string]$job.month -and $found -eq 0){$found=$r}
 }
 $existing=@{}
 if($found -gt 0){foreach($entry in $rows){if($entry.month -eq [string]$job.month){$existing=$entry.values;break}}}
 # Monthly sheets intentionally leave one blank row between calendar years.
 # Never use that separator as the next month, including when preformatted.
 $hasSelectedMonth=([string]$job.month -match '^\d{4}-\d{2}$')
 $crossYear=($hasSelectedMonth -and $found -eq 0 -and $latest -and ([string]$job.month).Substring(0,4) -ne $latest.Substring(0,4))
 $position=$(if($found -gt 0){$found}elseif($crossYear){$last+2}else{$last+1})
 if($job.action -eq 'write'){
  if($duplicateMonths.ContainsKey([string]$job.month)){throw ('Month '+[string]$job.month+' appears in more than one Excel row ('+($duplicateMonths[[string]$job.month] -join ', ')+'). Review those rows before editing. No file was changed.') }
  if($sheet.ProtectContents -or $book.ReadOnly){throw 'Workbook is protected or read-only.'}
  if($found -eq 0 -and $latest -and [string]$job.month -lt $latest){throw 'Cannot append a historical month that is missing in Excel.'}
  $allowed=@('B','C','D','E','F','G','H','I','J','K','L','M')
  if($null -eq $job.updates){throw 'Missing Monthly report updates.'}
  foreach($p in $job.updates.PSObject.Properties){if($allowed -notcontains [string]$p.Name){throw 'Protected Monthly field.'}}
  if($found -eq 0){
   if($crossYear){
    # Refuse to overwrite an occupied would-be separator. Do not erase it.
    for($c=1;$c -le 13;$c++){if($null -ne $sheet.Cells.Item($last+1,$c).Value2 -or $sheet.Cells.Item($last+1,$c).HasFormula){throw ('Monthly year separator row '+($last+1)+' contains data. Nothing was changed.')}}
   }
   for($c=1;$c -le 13;$c++){if($null -ne $sheet.Cells.Item($position,$c).Value2 -or $sheet.Cells.Item($position,$c).HasFormula){throw ('Destination Monthly row '+$position+' contains data. Nothing was changed.')}}
   # The clinic's historic .xls already has preformatted empty rows. Prefer
   # their formatting to a clipboard-based Copy/PasteSpecial operation, which
   # can fail on BIFF8 workbooks and is unnecessary for prepared rows.
   $prepared=([string]$sheet.Cells.Item($position,1).NumberFormat -ne 'General')
   if(-not $prepared -and $last -gt 1){
    # Excel Range.Copy(destination) copies directly without clipboard/PasteSpecial.
    # The destination was verified blank above; never erase populated cells.
    $source=$sheet.Range($sheet.Cells.Item($last,1),$sheet.Cells.Item($last,13))
    $dest=$sheet.Range($sheet.Cells.Item($position,1),$sheet.Cells.Item($position,13))
    $source.Copy($dest)
    $dest.ClearContents()
   }
   $sheet.Cells.Item($position,1).Value2=[DateTime]::ParseExact(([string]$job.month+'-01'),'yyyy-MM-dd',[Globalization.CultureInfo]::InvariantCulture).ToOADate()
   if([string]$sheet.Cells.Item($position,1).NumberFormat -eq 'General'){
    $sheet.Cells.Item($position,1).NumberFormat=$(if($last -gt 1){[string]$sheet.Cells.Item($last,1).NumberFormat}else{'mmm-yyyy'})
   }
  }
  foreach($p in $job.updates.PSObject.Properties){
   $letter=[string]$p.Name;$column=[int][char]$letter[0]-64
   $cell=$sheet.Cells.Item($position,$column)
   if($cell.MergeCells){
    if($cell.MergeArea.Cells.Item(1,1).Address($false,$false) -ne ($letter+$position)){throw ('Monthly destination '+$letter+$position+' is inside a merged range. Nothing was changed.')}
   }
   if($letter -eq 'M'){$cell.Value2=[string]$p.Value}else{$cell.Value2=[double]$p.Value}
  }
  $book.Save()
  if(-not $book.Saved){throw 'Excel did not confirm the Monthly workbook was saved.'}
 }
 $result=@{ok=$true;months=$rows;duplicateMonths=$duplicateMonths;latest=$latest;row=$position;exists=($found -gt 0);existing=$existing;rowAction=$(if($found -gt 0){'update-existing'}else{'append-month'})}
 $result | ConvertTo-Json -Depth 12 -Compress | Out-File -LiteralPath $OutputPath -Encoding UTF8
} catch {
 $err=@{ok=$false;error=[string]$_.Exception.Message}
 $err | ConvertTo-Json -Depth 5 -Compress | Out-File -LiteralPath $OutputPath -Encoding UTF8
 exit 1
} finally {
 if($null -ne $book){try{$book.Close($false)}catch{};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($book)}catch{}}
 if($null -ne $excel){try{$excel.Quit()}catch{};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)}catch{}}
 [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
