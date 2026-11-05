import type { CSSProperties } from "react";

import { Button } from "../components/common/Button";
import {
  Empty,
  FatalError,
  InlineError,
  Loading,
  Progress,
} from "../components/common/UiStates";
import "./DesignHarness.css";

const palette = [
  ["Canvas", "--color-background-primary-default"],
  ["Surface", "--color-surface-neutral-default"],
  ["Surface raised", "--color-surface-neutral-raised"],
  ["Surface hover", "--color-surface-neutral-hover"],
  ["Surface transparent", "--color-surface-transparent"],
  ["Stroke weak", "--color-stroke-weak-default"],
  ["Stroke control", "--color-stroke-control-default"],
  ["Stroke strong", "--color-stroke-strong-default"],
  ["Text strong", "--color-text-strong-default"],
  ["Text weak", "--color-text-weak-default"],
  ["Text on brand", "--color-text-on-brand"],
  ["Brand default", "--color-fill-brand-default"],
  ["Impeccable brand", "--color-fill-brand-impeccable"],
  ["Brand hover", "--color-fill-brand-impeccable-hover"],
  ["Brand active", "--color-fill-brand-impeccable-active"],
  ["Brand soft", "--color-fill-brand-impeccable-soft"],
  ["Success", "--color-status-success-default"],
  ["Warning", "--color-status-warning-default"],
  ["Error", "--color-status-error-default"],
  ["Error soft", "--color-status-error-soft"],
  ["Overlay scrim", "--color-overlay-scrim"],
] as const;

const spacing = ["xs", "sm", "md", "lg", "xl", "xxl"] as const;

export function DesignHarness() {
  return (
    <main className="df-design-harness">
      <header className="df-design-harness__header">
        <p className="df-design-harness__kicker">FE-SETUP · Impeccable baseline</p>
        <h1>DatasetFactory design harness</h1>
        <p>
          Component and token reference for screenshot QA at 1440 px.
        </p>
      </header>

      <section aria-labelledby="palette-title" className="df-design-harness__section">
        <div className="df-design-harness__section-head">
          <h2 id="palette-title">Semantic palette</h2>
          <span>COLOR-01..10</span>
        </div>
        <div className="df-design-harness__palette">
          {palette.map(([label, value]) => (
            <article className="df-design-harness__swatch" key={value}>
              <span
                aria-hidden="true"
                className="df-design-harness__swatch-color"
                style={{ backgroundColor: `var(${value})` } as CSSProperties}
              />
              <strong>{label}</strong>
              <code>{value}</code>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="foundations-title" className="df-design-harness__section">
        <div className="df-design-harness__section-head">
          <h2 id="foundations-title">Foundations</h2>
          <span>GRID · TYPO · RADIUS</span>
        </div>
        <div className="df-design-harness__foundations">
          <article>
            <h3>Spacing</h3>
            <div className="df-design-harness__spacing-list">
              {spacing.map((size) => (
                <div className="df-design-harness__spacing-row" key={size}>
                  <code>{`--size-${size}`}</code>
                  <span
                    aria-hidden="true"
                    className={`df-design-harness__spacing df-design-harness__spacing--${size}`}
                  />
                </div>
              ))}
            </div>
          </article>
          <article>
            <h3>Typography</h3>
            <p className="df-design-harness__type-xl">Heading 24 / tight</p>
            <p className="df-design-harness__type-lg">Subheading 20 / tight</p>
            <p className="df-design-harness__type-md">Body 16 / standard</p>
            <p className="df-design-harness__type-sm">Metadata 14 / standard</p>
          </article>
          <article>
            <h3>Radius</h3>
            <div className="df-design-harness__radius-list">
              <span className="df-design-harness__radius-sm">sm</span>
              <span className="df-design-harness__radius-md">md</span>
              <span className="df-design-harness__radius-lg">lg</span>
              <span className="df-design-harness__radius-pill">pill</span>
            </div>
          </article>
          <article>
            <h3>Elevation and stroke</h3>
            <div className="df-design-harness__elevation-list">
              <span className="df-design-harness__elevation-low">elevation-low</span>
              <span className="df-design-harness__elevation-high">elevation-high</span>
              <span className="df-design-harness__stroke-default">stroke 1</span>
              <span className="df-design-harness__stroke-emphasis">stroke 2</span>
            </div>
          </article>
        </div>
      </section>

      <section aria-labelledby="buttons-title" className="df-design-harness__section">
        <div className="df-design-harness__section-head">
          <h2 id="buttons-title">Button</h2>
          <span>default · hover · active · focus · disabled · loading</span>
        </div>
        <div className="df-design-harness__button-grid">
          <div>
            <h3>Variants</h3>
            <div className="df-design-harness__row">
              <Button variant="primary">New game profile</Button>
              <Button variant="secondary">Open project</Button>
              <Button variant="muted">Choose video</Button>
            </div>
          </div>
          <div>
            <h3>Sizes</h3>
            <div className="df-design-harness__row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>
          <div>
            <h3>Persistent states</h3>
            <div className="df-design-harness__row">
              <Button disabled>Disabled</Button>
              <Button loading loadingLabel="Processing">
                Processing
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="states-title" className="df-design-harness__section">
        <div className="df-design-harness__section-head">
          <h2 id="states-title">UiStates</h2>
          <span>FE-06</span>
        </div>
        <div className="df-design-harness__states">
          <div className="df-design-harness__state-stack">
            <Loading label="Loading frames…" />
            <InlineError message="The video file could not be read." />
            <Progress label="Frame OCR" value={68} />
          </div>
          <Empty
            action={<Button>Add material</Button>}
            description="Import an MP4, MKV or MOV to run the pipeline."
            title="No materials yet"
          />
          <FatalError
            description="Check access to the local workspace and try again."
            onRetry={() => undefined}
          />
        </div>
      </section>
    </main>
  );
}
