#!/usr/bin/env bash
# Re-parse every revision on disk, re-derive payments, import (cells + events).
#   bash audit-out/refresh-billing.sh
cd /c/Users/Administrator/Desktop/expo-full || exit 1
ls audit-out/sheets/rev | wc -l
PYTHONUTF8=1 python scripts/parse-roster-timeline.py 2>&1 | head -3
node scripts/derive-payments.mjs 2>&1 | head -2
node scripts/import-revenue-timeline.mjs 2>&1 | tail -2
