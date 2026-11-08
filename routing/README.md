# Local HGV Isochrones

For the separate app-server and routing-server production setup, see
[the two-server deployment runbook](DEPLOYMENT.md).

This branch uses openrouteservice (ORS) 10.1.0 with the `driving-hgv` profile.
When routing is available, the star tool selects parking sites inside an
outbound, time-based isochrone. The vertical control ranges from 10 to 60
minutes, initially 30 minutes. Spokes retain their geographic direction and
length, live occupancy color, and total-capacity width. They are not road routes
or individual travel-time measurements. Polygon containment is an approximation
of reachability, not a guarantee of legal vehicle access to a parking entrance.

## Germany Data Only

From the repository root, download the Germany extract, not a planet file:

```sh
curl --fail --location --retry 3 \
  https://download.geofabrik.de/europe/germany-latest.osm.pbf \
  --output routing/germany-latest.osm.pbf
```

The PBF is ignored by Git and mounted read-only. You can set `ORS_PBF` in the
root `.env` to an existing Germany PBF instead. A missing file fails startup;
there is no fallback to the sample dataset or an automatic world download.
The Germany extract limits the graph coverage. Cross-border detours may be
missing; locations outside coverage or far from a routable road can fail.

## Start

```sh
docker compose --profile routing up -d ors
docker compose logs -f ors
```

The first start builds the HGV graph and can take hours. The default Java heap
is 12 GB with a 16 GB container limit; these are starting values, not a guaranteed
memory requirement. Allow additional memory for the operating system and the
existing database/web services, and ample disk space for the PBF plus graph.
Adjust `ORS_XMS`, `ORS_XMX`, and `ORS_MEMORY_LIMIT` in `.env` to the extract size
and host resources. ORS suggests at least twice the PBF size in heap per profile;
some builds need more. Only the HGV profile is enabled; elevation is disabled.
An 8 GB Docker allocation is not sufficient for the default configuration.

Wait for readiness before using the analysis:

```sh
curl --fail http://localhost:8088/ors/v2/health
curl --fail http://localhost:8088/ors/v2/status
curl --fail http://localhost:8088/ors/v2/isochrones/driving-hgv \
  -H 'Content-Type: application/json' \
  --data '{"locations":[[8.6815,49.4146]],"range":[3600],"range_type":"time","location_type":"start"}'
docker compose up -d --build web
```

Health must report `ready`; status should show only `driving-hgv`. The ORS API
is bound to host loopback only. The web service accesses it over the Compose
network at `http://ors:8082/ors`; no public ORS API key is needed.
For `npm run dev`, add `ORS_URL=http://localhost:8088/ors` to `web/.env.local`
and restart Next.js. The browser calls the same-origin `POST /api/isochrone`.

## Local Budget-Server Simulation

`compose.simulation.yml` is a standalone Compose project, not an override of the
main application. It has separate graph/log volumes and never mounts the
working Hessen graph or PostgreSQL data. All commands below run from the
repository root. The input defaults to `routing/germany-latest.osm.pbf`; wait
until the download is complete and verify its published checksum first. For a
different file, set `ORS_LAB_PBF` to its absolute path.

Build the optimized Germany graph using the larger local memory allowance:

```sh
docker compose -f routing/compose.simulation.yml --profile build run --rm ors-build
```

The builder has a six-CPU quota, six fast-isochrone preprocessing workers,
10 GB Java heap and 12 GB container limit, and exits after preparation. These
are starting limits, not guaranteed Germany build capacity. The worker override
is specific to the builder; the shared Hessen configuration stays unchanged.
Check that it exits successfully and do not start serving after a failed build.
With a 16 GB Docker allocation, consider stopping the existing Hessen ORS with
`docker stop rastmonitor-ors-1` during the Germany build to leave headroom for
the database, other containers, and Docker. Do not stop or delete the database.
Never run the builder and serving container against this graph volume at the
same time. Later graph updates also require stopping the lab serving container.

Then simulate the proposed ORS allocation on an 8 GB server:

```sh
docker compose -f routing/compose.simulation.yml up -d ors-serve
docker compose -f routing/compose.simulation.yml logs -f ors-serve
curl --fail http://localhost:18089/ors/v2/health
```

Serving defaults to four CPU-equivalents of quota, 6 GB container memory,
5 GB maximum Java heap, no swap, and localhost port 18089. It mounts no input
PBF and refuses a missing or incomplete fast-isochrone graph before running
ORS. Use the same image/configuration as the builder; incompatible graphs are
not repaired automatically by this test. `REBUILD_GRAPHS=false` alone would
not prevent ORS importing data when a graph is absent.

Override `ORS_LAB_CPUS`, `ORS_LAB_MEMORY`, `ORS_LAB_HEAP`, or `ORS_LAB_PORT`
when starting the serving container. Builder limits use `ORS_LAB_BUILD_CPUS`,
`ORS_LAB_BUILD_WORKERS`, `ORS_LAB_BUILD_MEMORY`, and `ORS_LAB_BUILD_HEAP`.
CPU quota and preprocessing workers are independent settings. Cell eccentricity
and border-distance tasks can use the configured workers, while serial stages
will not necessarily use all available cores. More workers can increase memory
use, and changing their count requires recreating the builder. An interrupted
import or preprocessing phase may need to be repeated.
Recreate the affected container after changing limits.
The serving cap reserves roughly 2 GB of an 8 GB host for the OS and overhead;
this test does not restrict the entire Docker VM or simulate other host loads.
CPU quota does not reproduce a server CPU generation, shared-vCPU contention,
NVMe performance, network latency, or Apple Silicon/x86 differences.

After readiness, measure uncached sequential requests with the existing script:

```sh
node routing/benchmark.mjs http://localhost:18089/ors rastmonitor-ors-lab-ors-serve-1 routing/germany-lab-serving.json
docker stats rastmonitor-ors-lab-ors-serve-1
```

Also inspect memory peaks/OOM events and latency under representative concurrent
requests before choosing a server. A single sequential run does not demonstrate
capacity under load. This lab does not add a global concurrency limit; the app's
existing per-IP limiter is separate. Graph preprocessing is not response caching.
The application still uses the Hessen service on port 8088 unless you explicitly
change `ORS_URL` in the local web environment to `http://localhost:18089/ors`.

Stop the lab without deleting its graph:

```sh
docker compose -f routing/compose.simulation.yml down
```

## Isolation And No Isochrone Cache

ORS is opt-in via the `routing` Compose profile. The main services do not depend
on ORS health or graph completion. Without ORS, the normal parking map and the
star tool remain usable through the explicitly labelled straight-line fallback.

## Automatic Straight-Line Fallback

While the tool is active, the browser checks `GET /api/isochrone` immediately
and every 30 seconds. This server-side probe checks the configured ORS health
endpoint through the tunnel with a two-second timeout. The browser allows four
seconds for its own probe. Readiness responses are uncached and do not enter
the calculation queue or increment calculation counters. A new outage can take
up to the next probe to detect; a failed calculation also activates fallback.

If routing is unavailable or unconfigured, the tool uses the previous
100 km great-circle radius, adjustable from 10 to 200 km. It displays
"Isochronen derzeit nicht verfügbar. Luftlinienentfernung, keine Fahrzeit."
The slider and status use kilometres and "Luftlinie", not travel-time minutes.
Minutes and kilometres are independent settings; no implied speed conversion
is made. No calculation requests are sent while fallback is active.

The origin, live occupancy colors, capacity-based widths, and release-only
slider behavior are retained. The stale isochrone polygon is removed. When a
readiness check succeeds, the tool automatically restores the saved minute
setting and requests a new isochrone. Queue overload is a busy response, not a
tunnel outage, and does not change modes. Straight-line distance does not imply
road access or HGV travel time. No cached isochrones are stored.

All routing files are separate from existing parking storage:

| Storage | Purpose |
| --- | --- |
| `routing/germany-latest.osm.pbf` (or `ORS_PBF`) | Germany OSM source |
| Compose volume `ors_graphs` | Persistent ORS routing graph |
| Compose volume `ors_logs` | ORS logs |

There are no PostGIS routing tables or stored/cached isochrones. ORS does not
use PostgreSQL. The web usage counter alone writes daily aggregate counts to
`routing.isochrone_usage_daily`; existing parking tables are unchanged.
HTTP requests and responses use `no-store`. Only the currently displayed polygon
is held in browser component state. A new location or travel time triggers a new
request (debounced by 300 ms). Slider changes are committed only on pointer or
adjustment-key release (or when focus leaves the slider), never during a drag.
Pending requests are cancelled while adjusting the slider;
superseded responses are discarded. Turning the
tool off discards the polygon. Live occupancy refreshes every five minutes and
recolors the selected sites without recomputing the unchanged road network.

## Public Access And Usage Counter

No routing login or per-IP cooldown is required. The app now admits at most
two active calculations and four waiting requests in a FIFO queue per Node
process. A waiting request expires after ten seconds. Full/expired queues
return HTTP 503 with code `ROUTING_BUSY` and `Retry-After: 2`; the map shows
the busy message without automatically retrying or adding more work.

Cancelled queued requests are removed before ORS dispatch and are not counted.
Disconnecting a browser from an already dispatched calculation does not release
its slot: ORS may still be computing. The app lets that request finish under
its own 60-second upstream timeout, then releases the slot and counts the
result. Even after an upstream timeout, ORS may continue computation; the app
queue cannot guarantee termination inside ORS. Retain the container resource
limits and keep ORS private.

The API execution allowance is 75 seconds to accommodate queue wait plus
calculation; configure any reverse proxy/platform timeout accordingly (for
example, nginx `proxy_read_timeout 80s` for this endpoint). The 10-60 minute
input range, calculate-on-release slider, debounce, stale-response rejection,
and usage counting remain. `ROUTING_TRUST_PROXY` is unused; IPs are not read or
stored. No isochrone cache or authentication was added.

This process-wide queue survives development hot reloads but is not shared
between workers, replicas, or separate apps. A multi-instance deployment needs
one shared admission controller in front of ORS, not an independent two-slot
queue in every replica. Process restarts also lose in-flight accounting.
Successful small local tests are not proof of production capacity. Do not
change CPU/memory limits when comparing request scheduling strategies.

The first unthrottled app-API sample is saved in
`load-app-unthrottled-2026-11-07T18-35-56Z.json`. It used the local Next.js
development server and the Germany ORS container capped at four CPUs and 6 GiB.
Each stage sent six uncached requests (Berlin, Hamburg, Munich; 30/60 minutes),
with parking-data reads during every wave. All 18 calculations returned HTTP 200.

| Concurrent calculations | Upper-middle latency | Slowest calculation | Slowest parking read |
| --- | ---: | ---: | ---: |
| 1 | 1.984 s | 4.087 s | 0.764 s |
| 2 | 2.695 s | 4.440 s | 0.748 s |
| 4 | 2.947 s | 5.023 s | 0.826 s |

These are six samples per stage, not production percentiles or a sustained-load
capacity claim. Stages ran in increasing concurrency order, so warm-up/order
effects are not controlled. This measures API latency, not map-rendering FPS.
Cgroup memory reached its 6 GiB limit and reclaimed file cache; no OOM event
occurred. More concurrency improved batch throughput but increased individual
waits. Recheck under a production build before drawing hosting conclusions.

Existing databases need this idempotent migration, run from the repository root:

```sh
docker compose exec -T db psql -U YOUR_POSTGRES_USER -d YOUR_POSTGRES_DB \
  -v ON_ERROR_STOP=1 < db/migrate_add_routing_usage.sql
```

New databases get the table from `db/init.sql`. Usage counts calls actually
forwarded to ORS, split into successful and failed calculations, by UTC date.
Invalid inputs, unavailable configuration, rejected/expired queues, and requests
cancelled before dispatch are not
counted. No IP, coordinates, polygon, or credential is stored. Counter failures
are logged without blocking routing results, so an unavailable database can
produce gaps. Inspect totals with:

```sql
SELECT day, requests, successes, requests - successes AS failures
FROM routing.isochrone_usage_daily
ORDER BY day DESC;

SELECT COALESCE(SUM(requests), 0) AS requests,
       COALESCE(SUM(successes), 0) AS successes,
       COALESCE(SUM(requests - successes), 0) AS failures
FROM routing.isochrone_usage_daily;
```

The HGV profile accounts for OSM truck-access tags. No vehicle dimensions,
weight, hazardous-goods settings, live traffic, rest breaks, or driver-hours
rules are supplied. Travel times are estimates, not navigation or compliance
advice. Add vehicle-specific restrictions before relying on them for a fleet.

## Fast Isochrone Preprocessing

The graph is optimized for isochrones only. CH, core, and landmark preparation
are explicitly disabled under `build.preparation.methods`. These indexes speed
up directions/matrix workloads that this app does not use; removing them does
not remove roads, change the HGV encoder, or disable truck-access restrictions.
Directions/matrix workloads are not optimized by this configuration.

The HGV profile enables `build.preparation.methods.fastisochrones` with one
preparation worker and the `fastest` weighting for time-based isochrones.
ORS 10.1.0 selects its fast builder automatically when a compatible preparation
is available. The endpoint's `fastisochrones` range limits alone do not enable
preprocessing. The 30-minute default and 60-minute maximum are unchanged.

Preparation partitions the road graph and computes cell contours and
eccentricities. These files persist with the road graph in `ors_graphs`; they
are not cached isochrone responses, and no parking tables are changed.
The first preparation adds startup time and graph storage. Later starts reuse
the preparation files.

Changing build settings requires rebuilding the affected graph: an ordinary
restart can reuse the previous graph's saved build configuration. Stop ORS and
back up the graph before rebuilding. The local Hessen graph before this change
was preserved as `driving-hgv-before-fastisochrones-20261107` inside `ors_graphs`.
For rollback, stop ORS, preserve the new graph separately, restore that backup
as `driving-hgv`, disable fast-isochrone preparation, and start ORS again.
Do not delete the volume or any PostgreSQL data.

Use the same PBF and memory settings when rebuilding or recreating a container.
For the local Hessen setup these are `ORS_PBF=./routing/hessen-261106.osm.pbf`,
`ORS_XMX=4g`, and `ORS_MEMORY_LIMIT=6g`. One-command environment overrides do not
persist for subsequent Compose commands; configure them in the root `.env` or
pass them again. Switching from Hessen to Germany requires a new graph build.

Requests with dynamic weights, vehicle-specific restrictions, or reverse
isochrones can fall back to the regular builder. Do not remove required vehicle
restrictions just to gain speed. Benchmark uncached requests at the same origin
and travel times before and after preparation. Measure the app proxy separately
to include response validation, serialization, and usage-counter latency.

## Repeatable Hessen Benchmark

Run the benchmark from the repository root against a ready ORS instance:

```sh
node routing/benchmark.mjs http://localhost:8088/ors rastmonitor-ors-1 routing/my-baseline.json
```

It tests Frankfurt and Kassel at 15, 30, and 60 minutes, with one warm-up and
three measured requests per case. Requests go directly to ORS, without response
caching or the web proxy's overhead. Output contains medians, individual
timings, geometry SHA-256 fingerprints, effective mounted configuration, graph
properties, graph directory size, and cgroup memory before/after the requests.
It refuses to overwrite an existing output file.

Graph sizes refer to the active `driving-hgv` directory, not rollback copies.
Container memory includes JVM, native memory, and charged filesystem cache; it
is not a Java heap-only measurement. Compare on the same host, image, PBF,
memory limits, and request cases. These are local samples, not capacity or
concurrency guarantees.

The full-preparation reference is saved in
`baseline-hessen-full-preparation.json`. Validate the isochrone-only candidate
in separate graph storage before replacing a working graph. Preserve the old
graph for rollback, and compare geometry fingerprints as well as timings and
resource use. An ordinary restart does not remove old preparation files or
override saved build settings: build a new graph for this comparison.

## Update The Graph

### Measured Hessen Comparison

The 2026-11-07 local comparison used the same `hessen-261106.osm.pbf`, ORS
10.1.0 image, 4 GB Java heap, and 6 GB container limit. Baseline and candidate
results are saved in `baseline-hessen-full-preparation.json` and
`candidate-hessen-isochrone-only.json`.

| Metric | Full preparation | Isochrone-only |
| --- | ---: | ---: |
| Active graph size | 325.17 MiB | 118.09 MiB |
| Observed warm cgroup memory | 3.02 GiB | 1.64 GiB |
| Frankfurt 15 / 30 / 60 min, median | 166 / 640 / 1638 ms | 206 / 578 / 1242 ms |
| Kassel 15 / 30 / 60 min, median | 152 / 373 / 1202 ms | 114 / 385 / 946 ms |

Graph storage fell by 63.7%; observed container memory fell by 45.7%.
Short-query timings were mixed, while the two 60-minute samples improved by
about 21-24%. These samples do not establish peak memory, concurrency capacity,
or Germany-wide requirements. The candidate's initial build took about 21.7
minutes, mostly in fast preparation; disabling other indexes does not remove
the partitioning cost.

Both graphs have 798315 nodes and 919226 edges. Runtime status reports matching
HGV encoders, extended storages, and encoded restriction attributes, including
`HeavyVehicle.restrictions=true`. The candidate has no CH/core/landmark index
files and retains the four fast-isochrone storage files.

All six samples selected exactly the same parking sites (Frankfurt: 3/31/76;
Kassel: 5/16/28). All polygons were valid but their geometry hashes differed.
Read-only PostGIS comparison measured symmetric differences below 0.023% of
union area; maximum sampled boundary deviation was about 173 m. This is not
bit-identical output or proof of equivalence for untested origins or parking
sites near the boundary. Keep this approximation caveat when evaluating results.

The small boundary differences were accepted for this travel-time estimate use
case. The isochrone-only graph was promoted locally on 2026-11-07: the main ORS
service on port 8088 now serves it, and the app continues using the same ORS URL.
The app proxy and parking-data endpoint were verified after promotion. HGV
restrictions, the 30-minute default, 60-minute cap, and release-only slider
requests were unchanged at promotion; rate limiting was subsequently removed for baseline
testing. No extra polygon simplification was added.

The prior full-preparation graph remains in `ors_graphs` as
`driving-hgv-full-preparation-20261107` for rollback. The test container
`rastmonitor-ors-isochrone-candidate` is stopped; its separate graph volume is
retained. Graph-size savings above refer to the active graph, not total disk
usage including these deliberately preserved backups. Stop ORS before restoring
a backup, and preserve the current graph separately rather than overwriting it.

Replace the Germany PBF, then explicitly rebuild only the ORS graph:

```sh
docker compose stop ors
docker compose run --rm -e REBUILD_GRAPHS=true ors
```

ORS rebuilds and then serves requests in that foreground command. After it is
ready, stop that command with Ctrl+C and restart the regular service:

```sh
docker compose --profile routing up -d ors
```

Keep `REBUILD_GRAPHS=false` for normal starts. Existing graph files are reused;
replacing the PBF alone does not update them. Routing is unavailable during the
rebuild, but parking ingestion and the normal map are independent.
Do not use `docker compose down -v`: it would also delete the main database.

Documentation: https://giscience.github.io/openrouteservice/run-instance/