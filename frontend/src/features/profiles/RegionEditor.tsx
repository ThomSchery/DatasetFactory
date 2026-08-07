import { useState } from "react";

import { RegionOverlay, type OverlayShape, type SourceRect, type SourceSize } from "../../components/common/RegionOverlay";
import { TextField } from "../../components/common/TextField";
import { FatalError, InlineError, Loading } from "../../components/common/UiStates";
import { RegionList } from "./RegionList";
import type { RegionValue } from "./schemas";

/*
 * Drawing works only while the profile is being created (FE-001-F3 §Logika.6).
 * There is no edit path after `POST /profiles`, so this component is only ever
 * mounted by the creation screen.
 */

type ImageStatus = "loading" | "ready" | "error";

export interface RegionEditorProps {
  /** Opaque asset URL from `referenceAssetUrl`; never a filesystem path. */
  assetUrl: string;
  disabled?: boolean;
  error?: string;
  onChange: (regions: RegionValue[]) => void;
  onSourceResolved: (source: SourceSize) => void;
  regions: readonly RegionValue[];
  source: SourceSize | null;
}

function nextRegionName(regions: readonly RegionValue[]): string {
  // Names have to be unique in the profile, so the counter walks past any the
  // user has already renamed onto a default.
  const taken = new Set(regions.map((region) => region.name.trim().toLowerCase()));
  let ordinal = regions.length + 1;
  while (taken.has(`region ${String(ordinal)}`)) {
    ordinal += 1;
  }
  return `Region ${String(ordinal)}`;
}

export function RegionEditor({
  assetUrl,
  disabled = false,
  error,
  onChange,
  onSourceResolved,
  regions,
  source,
}: RegionEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const selected = regions.find((region) => region.id === selectedId) ?? null;

  function handleDraw(rect: SourceRect) {
    const region: RegionValue = {
      ...rect,
      id: `region-${String(Date.now())}-${String(regions.length)}`,
      name: nextRegionName(regions),
    };
    onChange([...regions, region]);
    setSelectedId(region.id);
  }

  function handleRemove(id: string) {
    onChange(regions.filter((region) => region.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function handleRename(name: string) {
    if (selected === null) {
      return;
    }
    onChange(regions.map((region) => (region.id === selected.id ? { ...region, name } : region)));
  }

  const shapes: OverlayShape[] = regions.map((region) => ({
    height: region.height,
    id: region.id,
    label: region.name,
    width: region.width,
    x: region.x,
    y: region.y,
  }));

  if (status === "error") {
    return (
      <FatalError
        description="Nie udało się pobrać obrazu referencyjnego z API. Bez obrazu nie da się zaznaczyć regionów."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((key) => key + 1);
        }}
        title="Obraz referencyjny się nie wczytał"
      />
    );
  }

  return (
    <div className="df-profiles__editor">
      {status === "loading" ? <Loading label="Wczytywanie obrazu referencyjnego…" /> : null}

      <RegionOverlay
        disabled={disabled}
        imageAlt="Obraz referencyjny profilu z zaznaczonymi regionami HUD"
        imageUrl={assetUrl}
        key={reloadKey}
        label="Regiony HUD na obrazie referencyjnym"
        onDraw={handleDraw}
        onImageError={() => {
          setStatus("error");
        }}
        onRemove={handleRemove}
        onSelect={setSelectedId}
        onSourceResolved={(resolved) => {
          setStatus("ready");
          onSourceResolved(resolved);
        }}
        selectedId={selectedId}
        shapes={shapes}
        source={source}
      />

      <p className="df-profiles__hint">
        Przeciągnij prostokąt na obrazie, żeby dodać region. Strzałki chodzą po regionach,
        <kbd>Enter</kbd> zaznacza, <kbd>Delete</kbd> usuwa zaznaczony.
      </p>

      {selected === null ? null : (
        <TextField
          description="Nazwa musi być unikalna w profilu; pojawia się przy anotacjach z tego regionu."
          label={`Nazwa zaznaczonego regionu (x ${String(selected.x)}, y ${String(selected.y)}, ${String(selected.width)} × ${String(selected.height)} px)`}
          onChange={(event) => {
            handleRename(event.target.value);
          }}
          value={selected.name}
          width="short"
        />
      )}

      <RegionList
        disabled={disabled}
        onRemove={handleRemove}
        onSelect={setSelectedId}
        regions={regions}
        selectedId={selectedId}
      />

      {error === undefined ? null : <InlineError message={error} />}
    </div>
  );
}
