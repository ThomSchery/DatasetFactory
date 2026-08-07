import type { ReactNode } from "react";

import "./DataList.css";

export interface DataListItem {
  /** Optional clarification under the value, e.g. why a count means what it means. */
  hint?: string;
  label: string;
  value: ReactNode;
}

export interface DataListProps {
  items: readonly DataListItem[];
  /** `rows` stacks label above value; `columns` puts them side by side. */
  layout?: "rows" | "columns";
}

/**
 * Label/value metadata as a real `<dl>`, so the association survives for
 * assistive tech instead of living only in the visual layout.
 */
export function DataList({ items, layout = "rows" }: DataListProps) {
  return (
    <dl className={`df-data-list df-data-list--${layout}`}>
      {items.map((item) => (
        <div className="df-data-list__item" key={item.label}>
          <dt className="df-data-list__label">{item.label}</dt>
          <dd className="df-data-list__value">
            {item.value}
            {item.hint === undefined ? null : (
              <span className="df-data-list__hint">{item.hint}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
