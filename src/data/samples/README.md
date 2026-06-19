# Sample media

Drop a few small images here to try Lantern's vision/OCR skills, for example:

- `note.jpg` — a banknote (try "how much money is this").
- `sign.jpg` — a sign or label (try "read this").
- `medicine.jpg` — a medication box (try "what medication is this").

## Deterministic fixtures (mock engine)

When running with `LANTERN_ENGINE=mock`, OCR and speech-to-text read a sidecar
text file next to the media so demos and tests are deterministic without models:

```
samples/sign.jpg          ← any placeholder image bytes
samples/sign.jpg.txt      ← the exact text the mock "reads" from it
```

Create a fixture quickly:

```bash
echo "PLATFORM 4 — Mind the gap" > src/data/samples/sign.jpg.txt
touch src/data/samples/sign.jpg
node src/index.js cli --image src/data/samples/sign.jpg --text "read this"
```

With the real `qvac` engine, the sidecar is ignored and the actual image is
processed by the OCR / vision models.

> Real photos are git-ignored by default (see `.gitignore`) so private media is
> never committed. Sidecar `.txt` fixtures are small and safe to keep.
