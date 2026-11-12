# The Library is built by checked AI Import, not by hand or from a dataset

No public library of origami Models as ordered fold steps exists (research, Nov 2026); the only large sources are copyrighted diagrams for people, and vision models read them with roughly 30-55% accuracy. So the fold engine implements every Fold type and common base once, an AI turns each Source into a short sequence of calls to those Folds, and the engine replays every Step. Only Models that replay cleanly enter the Library; the rest become Failed imports and are retried as the engine improves. Imports run as a batch on the parent's computer with a per-run cost cap, so no API key lives on the iPad.

## Considered Options

- **Hand-written Models**: rejected; the Library would never keep up with him.
- **Existing datasets** (OrigamiCode, OrigamiBench, FoldingAgent): no released data or license; worth taking if one ever becomes available.
- **AI reads diagrams straight into geometry**: too unreliable without the engine checking each Step.

## Consequences

The Library grows over time rather than all at once. A Model can be valid and still wrong, which is what the Mismatch report covers. Videos are out of scope for Import until diagram Import is working well.
