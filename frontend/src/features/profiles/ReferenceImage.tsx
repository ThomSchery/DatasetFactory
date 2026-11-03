import { useState } from "react";

import { FatalError } from "../../components/common/UiStates";
import "./ReferenceImage.css";

export interface ReferenceImageProps {
  /** Opaque `/api/v1/assets/...` URL; never a filesystem path. */
  url: string;
  alt: string;
  /** One line under the image, e.g. the profile's name and its resolution. */
  caption?: string;
}

/**
 * A reference frame shown without any drawing surface over it.
 *
 * `RegionOverlay` owns every image that carries geometry; this is for the
 * screens that only need to show which picture is in play — the run setup, and
 * a profile being previewed rather than edited. The image keeps its aspect
 * ratio and never exceeds its column, so a 1920-wide frame does not push the
 * layout sideways on a phone.
 */
export function ReferenceImage({ url, alt, caption }: ReferenceImageProps) {
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  if (failed) {
    return (
      <FatalError
        description="Nie udało się pobrać obrazu z API. Plik mógł zostać przeniesiony poza workspace."
        onRetry={() => {
          setFailed(false);
          setReloadKey((key) => key + 1);
        }}
        title="Obraz się nie wczytał"
      />
    );
  }

  return (
    <figure className="df-reference-image">
      <img
        alt={alt}
        className="df-reference-image__img"
        key={reloadKey}
        onError={() => {
          setFailed(true);
        }}
        src={url}
      />
      {caption === undefined ? null : (
        <figcaption className="df-reference-image__caption">{caption}</figcaption>
      )}
    </figure>
  );
}
