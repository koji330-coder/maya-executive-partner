<#
  nano-banana パイプラインを character-motion-studio へ安全に push する。

  既定は下見だけで、何も変更しない。内容を確認してから -Push を付けて実行する。

    powershell -ExecutionPolicy Bypass -File tools\push_nano_banana.ps1
    powershell -ExecutionPolicy Bypass -File tools\push_nano_banana.ps1 -Push

  鍵らしきものを見つけたら、その場で止めて push しない。
#>
param(
  [string]$Path   = "C:\Users\koji3\Documents\クロノIT-動画制作リサーチ\nano-banana",
  [string]$Remote = "https://github.com/koji330-coder/character-motion-studio.git",
  [switch]$Push
)

function Say($msg)  { Write-Host $msg }
function Head($msg) { Write-Host ""; Write-Host ("== " + $msg) }
function Stop-Here($msg) { Write-Host ""; Write-Host ("中止: " + $msg); exit 1 }

Head "対象"
Say $Path
if (-not (Test-Path $Path)) { Stop-Here "そのフォルダがありません。-Path で指定してください。" }

Head "1. 別のリポジトリの中にないか"
$top = (& git -C $Path rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and $top) {
  $topFull  = (Resolve-Path $top).Path.TrimEnd('\')
  $pathFull = (Resolve-Path $Path).Path.TrimEnd('\')
  if ($topFull -ne $pathFull) {
    Say ("親リポジトリ: " + $topFull)
    Stop-Here "このフォルダは別のリポジトリの一部です。切り出し方の判断が要るので、この出力を Claude に貼ってください。"
  }
  Say "このフォルダ自身がリポジトリです。続行します。"
} else {
  Say "まだ Git 管理外です。続行します。"
}

Head "2. 鍵が混ざっていないか"
$files = Get-ChildItem -Path $Path -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notmatch '\\\.git\\' -and
    $_.FullName -notmatch '\\node_modules\\' -and
    $_.Length -lt 2MB
  }

$envFiles = $files | Where-Object { $_.Name -like ".env*" -and $_.Name -ne ".env.example" }
if ($envFiles) {
  Say "見つかった .env 系:"
  $envFiles | ForEach-Object { Say ("  " + $_.FullName) }
  Say ".gitignore で除外するので、これ自体は問題ありません。"
}

$textLike = $files | Where-Object { $_.Extension -match '^\.(js|mjs|cjs|ts|json|md|txt|ps1|cmd|bat|yml|yaml|ini|cfg)$' }
$hits = @()
if ($textLike) {
  $hits = Select-String -Path ($textLike | ForEach-Object { $_.FullName }) `
                        -Pattern 'AIza[0-9A-Za-z_\-]{20,}' -List -ErrorAction SilentlyContinue
}
if ($hits) {
  Say "APIキーらしき文字列がファイル本文にあります:"
  $hits | ForEach-Object { Say ("  " + $_.Path) }
  Stop-Here "このまま push すると履歴に鍵が残ります。環境変数から読む形に直してから再実行してください。"
}
Say "本文に鍵らしき文字列は見つかりませんでした。"

Head "3. .gitignore を整える"
$gi = Join-Path $Path ".gitignore"
$need = @("node_modules/", ".env", ".env.*", "!.env.example", "out/", "output/", "generated/", "*.log", ".DS_Store")
$have = if (Test-Path $gi) { Get-Content $gi } else { @() }
$add  = $need | Where-Object { $have -notcontains $_ }
if ($add) {
  if ($Push) {
    if ($have) { Add-Content -Path $gi -Value "" }
    Add-Content -Path $gi -Value $add
    Say ("追記しました: " + ($add -join ", "))
  } else {
    Say ("追記予定: " + ($add -join ", "))
  }
} else {
  Say "すでに揃っています。"
}

Head "4. 上げる中身"
if (-not (Test-Path (Join-Path $Path ".git"))) {
  if ($Push) { & git -C $Path init | Out-Null; Say "git init しました。" }
  else       { Say "git init を実行します（下見では行いません）。" }
}
if (Test-Path (Join-Path $Path ".git")) {
  & git -C $Path add -A 2>$null | Out-Null
  $staged = & git -C $Path diff --cached --name-only
  $count  = ($staged | Measure-Object).Count
  $bytes  = 0
  foreach ($f in $staged) {
    $full = Join-Path $Path $f
    if (Test-Path $full) { $bytes += (Get-Item $full).Length }
  }
  Say ("ファイル数 " + $count + "   合計 " + [math]::Round($bytes/1MB, 2) + " MB")
  Say "内訳（先頭30件）:"
  $staged | Select-Object -First 30 | ForEach-Object { Say ("  " + $_) }
  if ($count -gt 30) { Say ("  ... 他 " + ($count - 30) + " 件") }
}

if (-not $Push) {
  Head "下見はここまで"
  Say "問題なければ -Push を付けて再実行してください。"
  Say "  powershell -ExecutionPolicy Bypass -File tools\push_nano_banana.ps1 -Push"
  exit 0
}

Head "5. push"
& git -C $Path commit -m "Nano Banana パイプラインを取り込む" 2>$null | Out-Null
$hasRemote = (& git -C $Path remote 2>$null) -contains "origin"
if (-not $hasRemote) { & git -C $Path remote add origin $Remote }
& git -C $Path branch -M main
& git -C $Path fetch origin 2>$null | Out-Null
& git -C $Path rebase origin/main 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Say "rebase が止まりました。README の衝突なら、こちらを残して続けてください:"
  Say "  git -C `"$Path`" checkout --ours README.md"
  Say "  git -C `"$Path`" add README.md"
  Say "  git -C `"$Path`" rebase --continue"
  Stop-Here "解決してから -Push で再実行してください。"
}
& git -C $Path push -u origin main
if ($LASTEXITCODE -ne 0) { Stop-Here "push が失敗しました。この出力を Claude に貼ってください。" }

Head "完了"
Say "https://github.com/koji330-coder/character-motion-studio を開いて、鍵が上がっていないか目で確認してください。"
Say "そのあと『push した』と Claude に伝えてください。"
