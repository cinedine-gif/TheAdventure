# Version tree - TheAdventure

This project now uses Git with a simple and safe version tree.

## Branch tree

```text
main (stable)
|- develop (integration)
|  |- feature/* (new features)
|  |- fix/* (bug fixes)
|- snapshots (automatic safety snapshots)
```

## Rules

1. `main`: only tested/stable versions.
2. `develop`: day to day integration work.
3. `feature/*`: one branch per feature.
4. `fix/*`: one branch per bug fix.
5. `snapshots`: quick safety commits before risky edits.

## Quick workflow

1. Start from `develop`.
2. Create a branch:

```powershell
git checkout develop
git checkout -b feature/my-change
```

3. Commit often:

```powershell
git add .
git commit -m "feat: my change"
```

4. Merge back to `develop` when done.
5. Merge `develop` to `main` only when stable.

## Safety snapshots

Use the helper script before big edits:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create_snapshot.ps1
```

It will:

1. Switch/create branch `snapshots`.
2. Commit all current changes with timestamp.
3. Create a tag like `snapshot-20260521-153010`.
4. Return you to your previous branch.
