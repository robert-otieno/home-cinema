$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 24 LTS or newer first.'}
if(-not(Get-Command pnpm -ErrorAction SilentlyContinue)){throw 'Install pnpm 11 first: npm install -g pnpm@11'}
if(-not(Test-Path -LiteralPath '.env')){Copy-Item -LiteralPath '.env.example' -Destination '.env'}
pnpm install --frozen-lockfile
if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
pnpm build
if($LASTEXITCODE -ne 0){throw 'Build failed'}
Write-Host 'Ready. Run pnpm start and open http://localhost:8094'
Write-Host 'FFmpeg and FFprobe must be on PATH or configured in .env.'
