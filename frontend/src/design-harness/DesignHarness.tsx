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
          Referencja komponentów i tokenów do screenshot QA przy szerokości 1440 px.
        </p>
      </header>

      <section aria-labelledby="palette-title" className="df-design-harness__section">
        <div className="df-design-harness__section-head">
          <h2 id="palette-title">Paleta semantyczna</h2>
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
          <h2 id="foundations-title">Fundamenty</h2>
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
            <h3>Typografia</h3>
            <p className="df-design-harness__type-xl">Nagłówek 24 / tight</p>
            <p className="df-design-harness__type-lg">Śródtytuł 20 / tight</p>
            <p className="df-design-harness__type-md">Tekst bazowy 16 / standard</p>
            <p className="df-design-harness__type-sm">Metadane 14 / standard</p>
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
            <h3>Elevation i stroke</h3>
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
            <h3>Warianty</h3>
            <div className="df-design-harness__row">
              <Button variant="primary">Nowy profil gry</Button>
              <Button variant="secondary">Otwórz projekt</Button>
              <Button variant="muted">Wybierz wideo</Button>
            </div>
          </div>
          <div>
            <h3>Rozmiary</h3>
            <div className="df-design-harness__row">
              <Button size="sm">Mały</Button>
              <Button size="md">Średni</Button>
              <Button size="lg">Duży</Button>
            </div>
          </div>
          <div>
            <h3>Stany trwałe</h3>
            <div className="df-design-harness__row">
              <Button disabled>Wyłączony</Button>
              <Button loading loadingLabel="Przetwarzanie">
                Przetwarzanie
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
            <Loading label="Wczytywanie klatek…" />
            <InlineError message="Nie udało się odczytać pliku wideo." />
            <Progress label="OCR klatek" value={68} />
          </div>
          <Empty
            action={<Button>Dodaj materiał</Button>}
            description="Zaimportuj MP4, MKV lub MOV, aby uruchomić pipeline."
            title="Nie ma jeszcze materiałów"
          />
          <FatalError
            description="Sprawdź dostęp do lokalnego workspace i spróbuj ponownie."
            onRetry={() => undefined}
          />
        </div>
      </section>
    </main>
  );
}
