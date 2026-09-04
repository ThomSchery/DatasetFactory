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
import { FrameEditor } from "./FrameEditor";
import { FrameToolbar } from "./FrameToolbar";
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
  return `${presentation.message} ${presentation.action} Kod: ${presentation.code}.`;
}

/** Route screen: the run id is read from `/annotations/:runId` and nowhere else. */
export function AnnotationReviewScreen() {
  const { runId } = useParams<{ runId: string }>();
  if (runId === undefined || runId === "") {
    return (
      <FatalError
        description="Adres weryfikacji nie zawiera identyfikatora runu. Kod: run_not_found."
        title="Brak runu w adresie"
      />
    );
  }
  return <ReviewForRun runId={runId} />;
}

function ReviewForRun({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReviewStatusFilter>(DEFAULT_REVIEW_STATUS_FILTER);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
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
    return <Loading label="Ładowanie runu i profilu anotacji…" />;
  }
  if (runQuery.isError) {
    return (
      <FatalError
        description={queryErrorMessage(runQuery.error)}
        onRetry={() => {
          void runQuery.refetch();
        }}
        title="Nie udało się pobrać runu"
      />
    );
  }
  if (profileQuery.isPending) {
    return <Loading label="Ładowanie profilu przypisanego do runu…" />;
  }
  if (profileQuery.isError) {
    return (
      <FatalError
        description={queryErrorMessage(profileQuery.error)}
        onRetry={() => {
          void profileQuery.refetch();
        }}
        title="Nie udało się pobrać klas profilu"
      />
    );
  }
  let framesContent;
  if (framesQuery.isPending) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <Loading label="Ładowanie listy klatek…" />
      </div>
    );
  } else if (framesQuery.isError) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <FatalError
          description={queryErrorMessage(framesQuery.error)}
          onRetry={() => {
            void framesQuery.refetch();
          }}
          title="Nie udało się pobrać klatek"
        />
      </div>
    );
  } else if (framesQuery.data.items.length === 0) {
    framesContent = (
      <>
        <FrameToolbar
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
            description="Zmień jawny filtr statusu albo poczekaj, aż run utworzy klatki. Odrzucone są dostępne w opcji „Odrzucone”."
            title="Brak klatek dla wybranego filtra"
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
