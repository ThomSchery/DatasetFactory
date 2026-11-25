import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import {
  deleteRun,
  describeApiError,
  describeRunStatus,
  invalidateFor,
  listRuns,
  queryKeys,
} from "../../api";
import type { RunSummary } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Dialog } from "../../components/common/Dialog";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import {
  Empty,
  FatalError,
  InlineError,
  Loading,
  Progress,
} from "../../components/common/UiStates";
import "./RunListScreen.css";

const PAGE_SIZE = 20;

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function RunRow({ onDelete, run }: { onDelete: (run: RunSummary) => void; run: RunSummary }) {
  const navigate = useNavigate();
  // The backend refuses a processing run (`409 run_in_progress`); the button
  // says so up front for the one status the list can see.
  const processing = run.status === "running";
  const status = describeRunStatus(run.status);
  const reviewed = run.review_counts.accepted + run.review_counts.rejected;

  return (
    <li className="df-run-list__row">
      <div className="df-run-list__heading">
        <div className="df-run-list__identity">
          <strong>{run.profile_name}</strong>
          <span>Run {run.id}</span>
        </div>
        <div className="df-run-list__badges">
          <StatusBadge srLabel="Run status:" tone={status.tone}>
            {status.label}
          </StatusBadge>
          {run.exported ? (
            <StatusBadge srLabel="Export:" tone="success">
              Exported
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <DataList
        items={[
          { label: "Created", value: formatCreatedAt(run.created_at) },
          { label: "Sample rate", value: `${String(run.interval_ms)} ms` },
          {
            hint: "Frames that exist in the run, not the planned number.",
            label: "Frames",
            value: String(run.review_counts.total),
          },
          { label: "Pending annotations", value: String(run.annotation_counts.proposed) },
        ]}
        layout="columns"
      />
      <Progress
        label={`Reviewed ${String(reviewed)} of ${String(run.review_counts.total)} frames`}
        max={run.review_counts.total}
        value={reviewed}
      />
      <div className="df-run-list__review-counts">
        <span>Pending: {String(run.review_counts.pending)}</span>
        <span>Accepted: {String(run.review_counts.accepted)}</span>
        <span>Rejected: {String(run.review_counts.rejected)}</span>
      </div>
      <div className="df-run-list__actions">
        <Button
          aria-label={`Delete run ${run.id}`}
          disabled={processing}
          onClick={() => {
            onDelete(run);
          }}
          title={processing ? "Pause or cancel the run before deleting it." : undefined}
          variant="secondary"
        >
          Delete
        </Button>
        <Button onClick={() => void navigate(annotationsPath(run.id))}>
          Open review
        </Button>
      </div>
    </li>
  );
}

export function RunListScreen() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<RunSummary | null>(null);
  const query = { page, page_size: PAGE_SIZE };
  const runs = useQuery({
    queryKey: queryKeys.runList(query),
    queryFn: ({ signal }) => listRuns(query, signal),
  });
  const pageCount = Math.max(1, Math.ceil((runs.data?.total ?? 0) / PAGE_SIZE));
  const removal = useMutation({
    mutationFn: (run: RunSummary) => deleteRun(run.id, run.version),
    onSuccess: async (_, run) => {
      // The last run of a later page leaves that page empty; show the one before.
      if (page > 1 && runs.data?.items.length === 1) {
        setPage(page - 1);
      }
      setPendingDelete(null);
      await invalidateFor(queryClient, { type: "run-deleted", runId: run.id });
    },
  });
  const removalError = removal.isError ? describeApiError(removal.error) : null;
  const openDelete = (run: RunSummary) => {
    removal.reset();
    setPendingDelete(run);
  };
  const closeDelete = () => {
    if (!removal.isPending) setPendingDelete(null);
  };

  return (
    <div className="df-run-list">
      <Panel title="Runs to review">
        {runs.isPending ? <Loading label="Loading runs…" /> : null}
        {runs.isError ? (
          <FatalError
            description={(() => {
              const failure = describeApiError(runs.error);
              return `${failure.message} ${failure.action}`;
            })()}
            onRetry={() => void runs.refetch()}
            title="The run list could not be loaded"
          />
        ) : null}
        {runs.isSuccess && runs.data.items.length === 0 ? (
          <Empty
            description="Start a run in Review for scan. It appears here with its review progress."
            title="No runs yet"
          />
        ) : null}
        {runs.isSuccess && runs.data.items.length > 0 ? (
          <ul className="df-run-list__items">
            {runs.data.items.map((run) => (
              <RunRow key={run.id} onDelete={openDelete} run={run} />
            ))}
          </ul>
        ) : null}
        {runs.isSuccess && runs.data.total > PAGE_SIZE ? (
          <nav aria-label="Run list pages" className="df-run-list__pagination">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              variant="secondary"
            >
              Previous
            </Button>
            <span>
              Page {String(page)} of {String(pageCount)}
            </span>
            <Button
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              variant="secondary"
            >
              Next
            </Button>
          </nav>
        ) : null}
      </Panel>

      <Dialog
        actions={
          <>
            <Button disabled={removal.isPending} onClick={closeDelete} variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={pendingDelete === null || removal.isPending}
              loading={removal.isPending}
              loadingLabel="Deleting the run…"
              onClick={() => {
                if (pendingDelete !== null) removal.mutate(pendingDelete);
              }}
            >
              Delete run
            </Button>
          </>
        }
        description={
          pendingDelete === null
            ? undefined
            : `Run ${pendingDelete.id} of ${pendingDelete.profile_name} is removed for good, with its ${String(pendingDelete.review_counts.total)} frames, their annotations and its exports. The video and the profile stay.`
        }
        onClose={closeDelete}
        open={pendingDelete !== null}
        title="Delete run"
      >
        {removalError === null ? null : (
          <InlineError message={`${removalError.message} ${removalError.action}`} />
        )}
      </Dialog>
    </div>
  );
}
