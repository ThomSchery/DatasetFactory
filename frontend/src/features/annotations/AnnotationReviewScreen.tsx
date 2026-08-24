import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";

import {
  DEFAULT_REVIEW_STATUS_FILTER,
  REVIEW_STATUS_FILTER_OPTIONS,
  describeApiError,
  getCurrentProfile,
  getRun,
  listRunFrames,
  parseReviewStatusFilter,
  queryKeys,
  reviewStatusQuery,
  type ReviewStatusFilter,
} from "../../api";
import { Panel } from "../../components/common/Panel";
import { SelectField } from "../../components/common/SelectField";
import { Empty, FatalError, Loading } from "../../components/common/UiStates";
import { FrameEditor } from "./FrameEditor";
import { FrameList } from "./FrameList";
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
  const [filter, setFilter] = useState<ReviewStatusFilter>(DEFAULT_REVIEW_STATUS_FILTER);
  const [page, setPage] = useState(1);
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const frameQuery = { review_status: reviewStatusQuery(filter), page, page_size: PAGE_SIZE };
  const runQuery = useQuery({
    queryKey: queryKeys.run(runId),
    queryFn: ({ signal }) => getRun(runId, signal),
  });
  const profileQuery = useQuery({
    queryKey: queryKeys.currentProfile(),
    queryFn: ({ signal }) => getCurrentProfile(signal),
  });
  const framesQuery = useQuery({
    queryKey: queryKeys.runFrames(runId, frameQuery),
    queryFn: ({ signal }) => listRunFrames(runId, frameQuery, signal),
  });

  if (runQuery.isPending || profileQuery.isPending) {
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
  if (profileQuery.data === null) {
    return (
      <Empty
        description="Weryfikacja wymaga profilu gry z klasami anotacji. Utwórz profil i uruchom pipeline."
        title="Brak profilu gry"
      />
    );
  }
  if (profileQuery.data.id !== runQuery.data.profile_id) {
    return (
      <FatalError
        description="Bieżący profil nie jest profilem tego runu, a API v1 nie udostępnia klas historycznego profilu. Edycja została zatrzymana, aby nie wysłać niedozwolonej klasy."
        title="Profil runu nie jest bieżący"
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
      <div className="df-review-workspace__all-state">
        <Empty
          description="Zmień jawny filtr statusu albo poczekaj, aż run utworzy klatki. Odrzucone są dostępne w opcji „Odrzucone”."
          title="Brak klatek dla wybranego filtra"
        />
      </div>
    );
  } else {
    const selectedId = framesQuery.data.items.some((frame) => frame.id === selectedFrameId)
      ? (selectedFrameId as string)
      : framesQuery.data.items[0]!.id;
    framesContent = (
      <>
        <FrameList
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
