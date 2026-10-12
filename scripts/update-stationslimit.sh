#!/bin/sh
set -eu

# The /api/helpers/* endpoints are protected by HelpersTokenGuard. Export the
# same token the server runs with before calling this script:
#   HELPERS_TOKEN=... ./scripts/update-stationslimit.sh
: "${HELPERS_TOKEN:?Set HELPERS_TOKEN to the server's helpers token}"

HEADER="x-helpers-token: ${HELPERS_TOKEN}"

wget -O - --header "$HEADER" https://tfc.chregu.tv/api/helpers/stationlimits | sqlite3 stations.sqlite
wget -O - --header "$HEADER" https://tfc.chregu.tv/api/helpers/stationlastaccess | sqlite3 stations.sqlite

sqlite3 stations.sqlite VACUUM
