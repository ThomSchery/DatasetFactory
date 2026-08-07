import type { DependencyStatus, Health } from "../../api";
import { Panel } from "../../components/common/Panel";
import { StatusBadge } from "../../components/common/StatusBadge";
import "./SystemStatusPanel.css";

interface DependencyRow {
  label: string;
  status: DependencyStatus;
}

export interface SystemStatusPanelProps {
  system: Health;
}

/**
 * FFmpeg, Tesseract, the workspace, the GPU and the database, each with the
 * `detail` the backend wrote, plus SAM 3 marked as out of v1.
 *
 * SAM 3 is a row here rather than a hidden one because CF-07 requires it to be
 * visible as out of scope; showing it as a working stage would promise output
 * the backend never produces (FE-11). It carries the `muted` tone, not
 * `warning` — being unplanned is not a fault (COLOR-09).
 */
export function SystemStatusPanel({ system }: SystemStatusPanelProps) {
  const rows: DependencyRow[] = [
    { label: "FFmpeg", status: system.ffmpeg },
    { label: "Tesseract", status: system.tesseract },
    { label: "Katalog roboczy", status: system.workspace },
    { label: "GPU", status: system.gpu },
    { label: "Baza danych", status: system.database },
  ];

  return (
    <Panel
      aside={
        <StatusBadge srLabel="Stan systemu:" tone={system.status === "ok" ? "success" : "error"}>
          {system.status === "ok" ? "Sprawny" : "Niedostępny"}
        </StatusBadge>
      }
      description={`Wersja backendu ${system.version}.`}
      eyebrow="System"
      title="Stan systemu"
    >
      <ul className="df-system-status">
        {rows.map((row) => (
          <li className="df-system-status__row" key={row.label}>
            <div className="df-system-status__heading">
              <span className="df-system-status__label">{row.label}</span>
              <StatusBadge
                srLabel={`${row.label}:`}
                tone={row.status.available ? "success" : row.status.critical ? "error" : "warning"}
              >
                {row.status.available ? "Dostępny" : "Niedostępny"}
              </StatusBadge>
            </div>
            <p className="df-system-status__detail">{row.status.detail}</p>
          </li>
        ))}

        <li className="df-system-status__row" key="sam3">
          <div className="df-system-status__heading">
            <span className="df-system-status__label">SAM 3</span>
            <StatusBadge srLabel="Zakres:" tone="muted">
              Poza v1
            </StatusBadge>
          </div>
          <p className="df-system-status__detail">
            Segmentacja jest zaplanowana po v1. Pipeline v1 jej nie uruchamia i nie produkuje
            masek.
          </p>
        </li>
      </ul>
    </Panel>
  );
}
