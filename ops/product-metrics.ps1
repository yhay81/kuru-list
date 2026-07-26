[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute kuru-list $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param(
        [int]$Numerator,
        [int]$Denominator
    )

    if ($Denominator -eq 0) { return 0.0 }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Created = [int]$Row.created
$Responded = [int]$Row.responded
$Managed = [int]$Row.managed

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "kuru-list"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        created = $Created
        responded = $Responded
        managed = $Managed
        returned = [int]$Row.returned
        users_7d = [int]$Row.users_7d
        responded_7d = [int]$Row.responded_7d
    }
    product = [ordered]@{
        active_events = [int]$Row.active_events
        events_with_responses = [int]$Row.events_with_responses
        total_responses = [int]$Row.total_responses
    }
    rates = [ordered]@{
        create_percent = Get-Percent $Created $Users
        response_percent = Get-Percent $Responded $Users
        manage_percent = Get-Percent $Managed $Created
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
