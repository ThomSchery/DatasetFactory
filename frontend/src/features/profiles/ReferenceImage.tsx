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
 * a profile being previewed rather than edited. Since FE-022 it fills the box
 * its consumer sizes and is cropped to it, like Figma's `IMAGE FILL`: the
 * preview shows which picture is in play, not every pixel of it.
 */
export function ReferenceImage({ url, alt, caption }: ReferenceImageProps) {
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  if (failed) {
    return (
      <FatalError
        description="The image could not be loaded from the API. The file may have moved out of the workspace."
        onRetry={() => {
          setFailed(false);
          setReloadKey((key) => key + 1);
        }}
        title="The image did not load"
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
