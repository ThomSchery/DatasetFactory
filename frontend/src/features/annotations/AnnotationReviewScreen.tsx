import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";

import {
  DEFAULT_REVIEW_STATUS_FILTER,
  REVIEW_STATUS_FILTER_OPTIONS,
  describeApiError,
  getProfile,
  getRun,
  isTerminalRunStatus,
  listRunFrames,
  parseReviewStatusFilter,
  queryKeys,
  reviewStatusQuery,
  runPollInterval,
  type ReviewStatusFilter,
  type RunStatus,
} from "../../api";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { FrameEditor } from "./FrameEditor";
import { FrameList } from "./FrameList";
import { reviewMutationKey } from "./reviewMutations";
import "./AnnotationReviewScreen.css";

const PAGE_SIZE = 12;

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
  const [page, setPage] = useState(1);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const previousRunStatus = useRef<RunStatus | undefined>(undefined);
  const isWriting = useIsMutating({ mutationKey: reviewMutationKey(runId) }) > 0;
  const frameQuery = { review_status: reviewStatusQuery(filter), page, page_size: PAGE_SIZE };
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
    queryKey: queryKeys.runFrames(runId, frameQuery),
    queryFn: ({ signal }) => listRunFrames(runId, frameQuery, signal),
  });

  const activeFrameId =
    framesQuery.data === undefined
      ? null
      : framesQuery.data.items.some((frame) => frame.id === selectedFrameId)
        ? selectedFrameId
        : (framesQuery.data.items[0]?.id ?? null);

  useEffect(() => {
    const status = runQuery.data?.status;
    const previousStatus = previousRunStatus.current;
    previousRunStatus.current = status;
    if (
      status === undefined ||
      previousStatus === undefined ||
      isTerminalRunStatus(previousStatus) ||
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
  }, [activeFrameId, framesQuery.refetch, queryClient, runQuery.data?.status]);

  useEffect(() => {
    if (framesQuery.data === undefined) {
      return;
    }
    const lastPage = Math.max(1, Math.ceil(framesQuery.data.total / framesQuery.data.page_size));
    if (page > lastPage) {
      setPage(lastPage);
      setSelectedFrameId(null);
    }
  }, [framesQuery.data, page]);

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
  } else if (
    framesQuery.data.items.length === 0 &&
    framesQuery.data.total > 0 &&
    page > Math.max(1, Math.ceil(framesQuery.data.total / framesQuery.data.page_size))
  ) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <Loading label="Powrót do ostatniej istniejącej strony…" />
      </div>
    );
  } else if (framesQuery.data.items.length === 0) {
    framesContent = (
      <div className="df-review-workspace__all-state">
        <Empty
          description="Zmień jawny filtr statusu albo poczekaj, aż run utworzy klatki. Odrzucone są dostępne w opcji „Odrzucone”."
          title="Brak klatek dla wybranego filtra"
        />
      </div>
    );
  } else {
    const selectedId = activeFrameId as string;
    framesContent = (
      <>
        <FrameList
          disabled={isWriting}
          frames={framesQuery.data}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            setSelectedFrameId(null);
          }}
          onSelect={setSelectedFrameId}
          selectedId={selectedId}
        />
        <FrameEditor
          frameId={selectedId}
          key={selectedId}
          profile={profileQuery.data}
          runId={runId}
        />
      </>
    );
  }

  return (
    <div className="df-review-screen">
      <Panel
        description="Filtr review_status jest jawny; „Odrzucone” to jedyna droga do ponownego otwarcia klatki."
        eyebrow={`Run ${runId}`}
        title="Filtr klatek"
      >
        <SelectField
          disabled={isWriting}
          label="Status weryfikacji"
          onChange={(event) => {
            setFilter(parseReviewStatusFilter(event.target.value));
            setPage(1);
            setSelectedFrameId(null);
          }}
          options={REVIEW_STATUS_FILTER_OPTIONS}
          value={filter}
        />
      </Panel>
      <div className="df-review-workspace">{framesContent}</div>
    </div>
  );
}
