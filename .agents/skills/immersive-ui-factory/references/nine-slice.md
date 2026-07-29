# Nine-slice production

Use nine-slice only for raster frames whose corners must remain fixed while edges and optionally the center scale.

## Master requirements

- PNG with transparent alpha where the host surface must show through.
- No baked text, icons, application content, or state labels.
- Symmetric only when the visual language calls for symmetry.
- Enough empty center area for content at the declared minimum size.
- Neutral material/lighting master when palette variants will be generated.

## Metadata

Store beside the image:

```json
{
  "schemaVersion": 1,
  "image": "panel-default.png",
  "slice": { "top": 64, "right": 64, "bottom": 64, "left": 64 },
  "center": "stretch",
  "edge": "stretch",
  "minimumSize": { "width": 160, "height": 120 }
}
```

## Validation

Run:

```text
bun scripts/validate-nine-slice.ts --image <png> --meta <json>
```

Reject when slice values overlap, minimum dimensions cannot preserve fixed regions, alpha is unavailable where required, dimensions are inconsistent, or the image is not PNG. After structural validation, render at minimum, square, wide, tall, and maximum expected sizes and inspect corners, seams, center fill, and content padding.
