#!/bin/sh
set -eu

graph=/home/ors/graphs/driving-hgv
for file in graph_build_info.yml properties nodes edges cells isochronenodes eccentricities_fastest_heavyvehicle bordernodes_fastest_heavyvehicle; do
  if [ ! -s "$graph/$file" ]; then
    echo "Prebuilt HGV graph missing or incomplete ($file). Run ors-build first; serving will not import OSM." >&2
    exit 1
  fi
done

if ! grep -aq '^prepare.fastisochrone.done=true' "$graph/properties"; then
  echo "Fast-isochrone preparation is incomplete. Refusing to start serving." >&2
  exit 1
fi

if [ "${REBUILD_GRAPHS:-false}" != false ]; then
  echo "Graph rebuilding is not permitted in serving mode." >&2
  exit 1
fi

exec /entrypoint.sh "$@"