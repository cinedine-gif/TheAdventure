param(
  [string]$Message = "safety snapshot"
)

$ErrorActionPreference = "Stop"

function Run-Git {
  param([string]$Args)
  git $Args
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $Args"
  }
}

$inside = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or $inside -ne "true") {
  throw "This folder is not a Git repository."
}

$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tagName = "snapshot-$timestamp"

$hasChanges = (git status --porcelain)
if (-not $hasChanges) {
  Write-Host "No changes detected. Nothing to snapshot."
  exit 0
}

$snapshotExists = (git branch --list snapshots)
if (-not $snapshotExists) {
  Run-Git "checkout -b snapshots"
} else {
  Run-Git "checkout snapshots"
}

Run-Git "add -A"
Run-Git "commit -m \"snapshot: $Message ($timestamp)\""
Run-Git "tag $tagName"

if ($currentBranch -ne "snapshots") {
  Run-Git "checkout $currentBranch"
}

Write-Host "Snapshot created: $tagName"