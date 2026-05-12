# Export the markdown audit prompt to a .docx on Ohad's Desktop.
# Uses Word COM automation — works on any Windows box with Word installed.

$src = 'C:\Users\Administrator\Desktop\expo-full\docs\ULTRATHINK_PROMPT_EXPO_AUDIT.md'
$dst = 'C:\Users\Administrator\Desktop\ULTRATHINK_PROMPT_EXPO_AUDIT.docx'

if (-not (Test-Path $src)) {
  Write-Error "Source markdown not found at $src"
  exit 1
}

$content = Get-Content -Raw -Encoding UTF8 $src

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Add()
  $selection = $word.Selection

  # Set default font for the doc — match the prompt's mood (a working
  # technical document, not a marketing pitch).
  $selection.Font.Name = 'Consolas'
  $selection.Font.Size = 10
  $selection.ParagraphFormat.SpaceAfter = 4

  # Write the markdown verbatim — preserves headings as plain text since
  # the receiving session will parse the markdown itself.
  $selection.TypeText($content)

  # Save as wdFormatXMLDocument (16) = .docx
  $doc.SaveAs([ref] $dst, [ref] 16)
  $doc.Close()
  Write-Host "Saved → $dst"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
