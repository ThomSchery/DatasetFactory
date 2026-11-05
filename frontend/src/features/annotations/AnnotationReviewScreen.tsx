import { useIsMutating, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";

import {
  DEFAULT_REVIEW_STATUS_FILTER,
  describeApiError,
  getProfile,
  getRun,
  isTerminalRunStatus,
  listRunFrames,
  queryKeys,
  reviewStatusQuery,
  runPollInterval,
  type FrameSummary,
  type ReviewStatusFilter,
  type RunStatus,
} from "../../api";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { FrameEditor, ReviewChrome } from "./FrameEditor";
import { reviewMutationKey } from "./reviewMutations";
import "./AnnotationReviewScreen.css";

const FRAME_PAGE_SIZE = 100;

async function listFilteredRunFrames(
  runId: string,
  filter: ReviewStatusFilter,
  signal: AbortSignal,
): Promise<{ items: FrameSummary[]; total: number }> {
  const reviewStatus = reviewStatusQuery(filter);
  const first = await listRunFrames(
    runId,
    { page: 1, page_size: FRAME_PAGE_SIZE, review_status: reviewStatus },
    signal,
  );
  const pageCount = Math.ceil(first.total / FRAME_PAGE_SIZE);
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      listRunFrames(
        runId,
        { page: index + 2, page_size: FRAME_PAGE_SIZE, review_status: reviewStatus },
        signal,
      ),
    ),
  );
  return {
    items: [first, ...remaining].flatMap((page) => page.items),
    total: first.total,
  };
}

function queryErrorMessage(error: unknown): string {
  const presentation = describeApiError(error);
  return `${presentation.message} ${presentation.action} Code: ${presentation.code}.`;
}

/** The page heading while the header with the visible title is not on screen. */
function HiddenHeading() {
  return <h1 className="df-visually-hidden">Review frames</h1>;
}

/** Route screen: the run id is read from `/annotations/:runId` and nowhere else. */
export function AnnotationReviewScreen() {
  const { runId } = useParams<{ runId: string }>();
  if (runId === undefined || runId === "") {
    return (
      <>
      <HiddenHeading />
      <FatalError
        description="The review address has no run id. Code: run_not_found."
        title="No run in the address"
      />
      </>
    );
  }
  return <ReviewForRun runId={runId} />;
}

function ReviewForRun({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReviewStatusFilter>(DEFAULT_REVIEW_STATUS_FILTER);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  /*
   * The class a drawn box is saved with (FE-017 D), remembered here rather than
   * inside the editor because the editor is rebuilt for every frame and the
   * rule is "the last class used in this editor session". A session is this
   * screen: it ends when the operator leaves the run, and nothing is written to
   * `localStorage` — a default that outlives the tab is one the operator cannot
   * see and therefore cannot predict.
   */
  const [lastUsedCategoryId, setLastUsedCategoryId] = useState<string | null>(null);
  const previousRunStatus = useRef<{ runId: string; status: RunStatus } | undefined>(undefined);
  const isWriting = useIsMutating({ mutationKey: reviewMutationKey(runId) }) > 0;
  const runQuery = useQuery({
    queryKey: queryKeys.run(runId),
    queryFn: ({ signal }) => getRun(runId, signal),
    refetchInterval: (query) => runPollInterval(query.state.data?.status),
  });
  const profileId = runQuery.data?.profile_id;
  const profileQuery = useQuery({
    enabled: profileId !== undefined,
    queryKey: queryKeys.profile(profileId ?? "pending-run-profile"),
    queryFn: ({ signal }) => {
      if (profileId === undefined) {
        throw new Error("Profile query enabled before the run resolved");
      }
      return getProfile(profileId, signal);
    },
  });
  const framesQuery = useQuery({
    queryKey: queryKeys.runFrames(runId, {
      page_size: FRAME_PAGE_SIZE,
      review_status: reviewStatusQuery(filter),
    }),
    queryFn: ({ signal }) => listFilteredRunFrames(runId, filter, signal),
  });
  const countStatuses = ["pending", "accepted", "rejected"] as const;
  const countQueries = useQueries({
    queries: countStatuses.map((reviewStatus) => {
      const countQuery = { page: 1, page_size: 1, review_status: reviewStatus };
      return {
        queryKey: queryKeys.runFrames(runId, countQuery),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          listRunFrames(runId, countQuery, signal),
      };
    }),
  });
  const counts = {
    accepted: countQueries[1].data?.total ?? 0,
    pending: countQueries[0].data?.total ?? 0,
    rejected: countQueries[2].data?.total ?? 0,
    total: countQueries.reduce((sum, query) => sum + (query.data?.total ?? 0), 0),
  };

  const activeFrameId =
    framesQuery.data?.items.some((frame) => frame.id === selectedFrameId) === true
      ? selectedFrameId
      : (framesQuery.data?.items[0]?.id ?? null);

  useEffect(() => {
    const status = runQuery.data?.status;
    const previous = previousRunStatus.current;
    previousRunStatus.current = status === undefined ? undefined : { runId, status };
    if (
      status === undefined ||
      previous === undefined ||
      previous.runId !== runId ||
      isTerminalRunStatus(previous.status) ||
      !isTerminalRunStatus(status)
    ) {
      return;
    }

    async function refetchTerminalFrameState(): Promise<void> {
      await framesQuery.refetch();
      if (activeFrameId !== null) {
        await queryClient.refetchQueries({
          exact: true,
          queryKey: queryKeys.frame(activeFrameId),
          type: "active",
        });
      }
    }

    void refetchTerminalFrameState();
  }, [activeFrameId, framesQuery.refetch, queryClient, runId, runQuery.data?.status]);

  if (runQuery.isPending) {
    return (
      <>
        <HiddenHeading />
        <Loading label="Loading the run and its annotation profile…" />
      </>
    );
  }
  if (runQuery.isError) {
    return (
      <>
      <HiddenHeading />
      <FatalError
        description={queryErrorMessage(runQuery.error)}
        onRetry={() => {
          void runQuery.refetch();
        }}
        title="The run could not be loaded"
      />
      </>
    );
  }
  if (profileQuery.isPending) {
    return (
      <>
        <HiddenHeading />
        <Loading label="Loading the profile of this run…" />
      </>
    );
  }
  if (profileQuery.isError) {
    return (
      <>
      <HiddenHeading />
      <FatalError
        description={queryErrorMessage(profileQuery.error)}
        onRetry={() => {
          void profileQuery.refetch();
        }}
        title="The profile classes could not be loaded"
      />
      </>
    );
  }
  let framesContent;
  if (framesQuery.isPending) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <HiddenHeading />
        <Loading label="Loading the frame list…" />
      </div>
    );
  } else if (framesQuery.isError) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <HiddenHeading />
        <FatalError
          description={queryErrorMessage(framesQuery.error)}
          onRetry={() => {
            void framesQuery.refetch();
          }}
          title="The frames could not be loaded"
        />
      </div>
    );
  } else if (framesQuery.data.items.length === 0) {
    framesContent = (
      <>
        <ReviewChrome
          counts={counts}
          disabled={isWriting}
          filter={filter}
          frames={[]}
          onFilterChange={(nextFilter) => {
            setFilter(nextFilter);
            setSelectedFrameId(null);
          }}
          onSelect={setSelectedFrameId}
          selectedId={null}
        />
        <div className="df-review-workspace__all-state">
          <Empty
            description="Change the status filter or wait until the run produces frames. Rejected frames are under Rejected."
            title="No frames for this filter"
          />
        </div>
      </>
    );
  } else {
    const selectedId = activeFrameId as string;
    framesContent = (
      <>
        <FrameEditor
          counts={counts}
          disabled={isWriting}
          filter={filter}
          frameId={selectedId}
          frames={framesQuery.data.items}
          key={selectedId}
          lastUsedCategoryId={lastUsedCategoryId}
          onCategoryUsed={setLastUsedCategoryId}
          onFilterChange={(nextFilter) => {
            setFilter(nextFilter);
            setSelectedFrameId(null);
          }}
          onSelect={setSelectedFrameId}
          profile={profileQuery.data}
          runId={runId}
        />
      </>
    );
  }

  return (
    <div className="df-review-screen">
      <div className="df-review-workspace">{framesContent}</div>
    </div>
  );
}
