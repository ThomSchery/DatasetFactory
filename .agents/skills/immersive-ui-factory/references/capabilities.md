# Capability registry

Compose a directed graph from the minimum capabilities needed for the run.

| Capability | Select when | Produces |
|---|---|---|
| `inspect-product` | Product behavior or content is not yet known | product constraints |
| `analyze-references` | Screenshots, videos, PDFs, assets, or designs were supplied | visual evidence report |
| `derive-world` | No approved visual language exists | world brief |
| `generate-composition-reference` | Layout/world needs visual exploration | one or more optional concept references |
| `decompose-assets` | An approved composition contains reusable visual material | asset inventory and crops |
| `create-master` | A reusable raster asset is justified | neutral source asset |
| `compile-nine-slice` | Corners must remain fixed while edges/center scale | slice metadata and test renders |
| `generate-theme-variants` | One geometry needs multiple palettes/states | deterministic variant set |
| `map-components` | Assets must bind to semantic UI primitives | component map |
| `build-motion-sequence` | A signature transition or intro is required | layers and timeline |
| `package-theme` | Outputs must travel between applications | neutral theme package |
| `adapt-target` | A concrete runtime is selected | target implementation |
| `render-qa` | A renderable implementation exists | breakpoint/state report |

## Selection rules

- Existing approved design: skip `derive-world` and usually skip `generate-composition-reference`.
- Single frame asset: skip application-level capabilities.
- CSS/SVG is sufficient: skip raster master and 9-slice.
- One palette only: skip theme variants.
- No cinematic behavior: skip motion.
- No target runtime: stop at the neutral package.

Write the selected graph to `run.json`. Each node declares dependencies, inputs, outputs, validator, and approval requirement.
