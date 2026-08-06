# Crawler V2 Items Sample Operation Design

## Goal

Expose the existing bounded real-items fixture as a normal, manually started
V2 operation in the admin crawler monitor so an operator can create the task
from the page and inspect its queue state, attempt progress, log, and JSON
output.

## User Experience

- The V2 operation catalog shows `模拟物品爬取（真实样本）` under the `items`
  base domain.
- The operation uses the stable operation ID `sample` and remains non-default;
  omitting an operation ID continues to select the existing items default.
- Starting it uses the existing operation preflight and V2 start endpoint. No
  bespoke system-drawer button or test-only page is added.
- After submission, the existing queue and attempt views display
  `queued`/`running`/`completed` or `failed`, progress, the attempt log, and the
  output artifact link.

## Runtime Contract

- The production action registry owns the operation and resolves it by the
  exact pair `items` / `crawler-queue-v2-items-fixture`.
- The action reads at most three records from
  `data/standardized/items.standardized.json`.
- It performs no network request and no database read or write.
- Its only writes are V2 attempt-scoped artifacts: the required progress file,
  process log, manifest, and `<progressPath>.items-sample.json` output.
- The progress payload retains the stable action ID, attempt identity injected
  by the supervisor environment, heartbeat timestamp, terminal status, counts,
  and output path required by the crawler progress contract.
- The generic `crawler_queue_v2_fixture` heartbeat action remains hidden and
  continues to require the isolated fixture gate.

## Components

### Action Registry

Promote the items sample definition into `defaultActions()` with full operation
metadata: `operationId=sample`, `defaultOperation=false`,
`confirmationLevel=summary`, `networkAccess=false`, and
`databaseAccess=none`. Keep the existing items `check` operation as the single
default.

### V2 Admission And Launch

Remove the items-specific fixture bypasses from the V2 application service,
monitor service, and attempt supervisor. Normal registry lookup then governs
start, retry, manifest generation, and process launch. Preserve the special
case and environment gate only for the generic heartbeat fixture.

### Admin Page

Use the existing operation catalog rendering and preflight dialog. The backend
catalog response is the only new UI input; no new page-local state or custom
button is required.

## Data Flow

1. The operator selects the `sample` operation under `items` and confirms the
   existing preflight.
2. The start endpoint resolves the registered operation and enqueues an exact
   V2 attempt.
3. The supervisor renders attempt-scoped paths and launches the bounded Node
   script.
4. The script writes running progress, reads and validates the tracked items
   payload, writes the three-record sample output, and writes terminal progress.
5. Existing V2 overview polling exposes the attempt, progress, log, and output
   to the page.

## Failure Handling

- Missing or malformed standardized input terminates the attempt as `failed`
  with an explanatory progress message and process log.
- Registry mismatches remain rejected before enqueue or launch.
- Output is forbidden from replacing the input path.
- The report-preview boundary allows only the exact attempt-scoped sample JSON
  alongside the existing `report.json`; progress and log files remain blocked
  from generic report preview.
- V2 dedupe, deadlines, stale-attempt rejection, cancellation, and retry keep
  their existing behavior; this feature adds no alternate state authority.

## Validation

- Registry tests prove the operation is visible, uses `sample`, is non-default,
  has no network access, and has `databaseAccess=none`.
- V2 application tests prove normal runtime admission without enabling the
  fixture profile and preserve rejection of the hidden heartbeat fixture.
- Supervisor tests prove the registry-owned launch command renders the
  attempt-scoped progress and output paths.
- Script tests retain input, output, terminal progress, and failure coverage.
- Admin page contract tests prove the operation is rendered from the catalog
  without a bespoke fixture control.
- Focused backend tests, admin checks, and the script contract suite pass before
  the stack is restarted for manual acceptance.

## Out Of Scope

- Running the sample on the user's behalf.
- Enabling V2 automation or starting a real crawler.
- Network access, database access, imports, or canonical data changes.
- Exposing the generic heartbeat fixture or restoring any V1 control.
