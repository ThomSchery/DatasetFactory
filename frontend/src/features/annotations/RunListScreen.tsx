import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { describeApiError, describeRunStatus, listRuns, queryKeys } from "../../api";
import type { RunSummary } from "../../api";
import { annotationsPath } from "../../app/navigation";
import { Button } from "../../components/common/Button";
import { DataList } from "../../components/common/DataList";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import { Empty, FatalError, Loading, Progress } from "../../components/common/UiStates";
import "./RunListScreen.css";

const PAGE_SIZE = 20;

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const navigate = useNavigate();
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
          <StatusBadge srLabel="Stan runu:" tone={status.tone}>
            {status.label}
          </StatusBadge>
          {run.exported ? (
            <StatusBadge srLabel="Eksport:" tone="success">
              Wyeksportowany
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <DataList
        items={[
          { label: "Utworzono", value: formatCreatedAt(run.created_at) },
          { label: "Interwał", value: `${String(run.interval_ms)} ms` },
          {
            hint: "Klatki istniejące w runie, nie liczba planowana.",
            label: "Klatki",
            value: String(run.review_counts.total),
          },
          { label: "Oczekujące anotacje", value: String(run.annotation_counts.proposed) },
        ]}
        layout="columns"
      />
      <Progress
        label={`Zweryfikowano ${String(reviewed)} z ${String(run.review_counts.total)} klatek`}
        max={run.review_counts.total}
        value={reviewed}
      />
      <div className="df-run-list__review-counts">
        <span>Oczekuje: {String(run.review_counts.pending)}</span>
        <span>Zaakceptowane: {String(run.review_counts.accepted)}</span>
        <span>Odrzucone: {String(run.review_counts.rejected)}</span>
      </div>
      <div className="df-run-list__actions">
        <Button onClick={() => void navigate(annotationsPath(run.id))}>
          Otwórz weryfikację
        </Button>
      </div>
    </li>
  );
}

export function RunListScreen() {
  const [page, setPage] = useState(1);
  const query = { page, page_size: PAGE_SIZE };
  const runs = useQuery({
    queryKey: queryKeys.runList(query),
    queryFn: ({ signal }) => listRuns(query, signal),
  });
  const pageCount = Math.max(1, Math.ceil((runs.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="df-run-list">
      <Panel
        description="Wszystkie runy projektu pozostają dostępne niezależnie od aktywnego profilu."
        eyebrow="Anotacje"
        title="Runy do weryfikacji"
      >
        {runs.isPending ? <Loading label="Ładowanie runów…" /> : null}
        {runs.isError ? (
          <FatalError
            description={(() => {
              const failure = describeApiError(runs.error);
              return `${failure.message} ${failure.action}`;
            })()}
            onRetry={() => void runs.refetch()}
            title="Nie udało się wczytać listy runów"
          />
        ) : null}
        {runs.isSuccess && runs.data.items.length === 0 ? (
          <Empty
            description="Utwórz run na ekranie Materiały. Pojawi się tutaj wraz z postępem weryfikacji."
            title="Brak runów"
          />
        ) : null}
        {runs.isSuccess && runs.data.items.length > 0 ? (
          <ul className="df-run-list__items">
            {runs.data.items.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : null}
        {runs.isSuccess && runs.data.total > PAGE_SIZE ? (
          <nav aria-label="Strony listy runów" className="df-run-list__pagination">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              variant="secondary"
            >
              Poprzednia
            </Button>
            <span>
              Strona {String(page)} z {String(pageCount)}
            </span>
            <Button
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              variant="secondary"
            >
              Następna
            </Button>
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
