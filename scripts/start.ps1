$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& node apps/server/dist/index.js
