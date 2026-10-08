# Documentation images

The README separates illustrated concept art from direct captures of the working game.

| File | Origin | Use |
| --- | --- | --- |
| `night-relay-cover.webp` | GPT Image 2, generated through the authenticated Higgsfield CLI on September 4, 2026 | Concept cover; not a claim about rendered gameplay quality |
| `gameplay.webp` | Direct Chromium capture of the local game, 1440 × 900 | Actual gameplay at the start of a run |
| `run-results.webp` | Direct Chromium capture, 1280 × 900 | Actual desktop result view using an isolated test database |
| `leaderboard-mobile.webp` | Direct Chromium capture, 390 × 844 | Actual mobile leaderboard using an isolated test database |

The result and leaderboard images show generated test-courier names. They are documentation fixtures, not claims about production player counts or competition.

## Cover workflow

The Higgsfield CLI's unfiltered model list was checked, followed by the GPT Image 2 parameter schema. The cover used a text-only original brief, with no uploaded reference images. The prompt describes the game's original orange-and-plum courier, a fictional Registan-inspired festival, and the README typography.

```sh
higgsfield account status
higgsfield model list
higgsfield model get gpt_image_2
higgsfield generate create gpt_image_2 \
  --aspect_ratio 21:9 \
  --resolution 2k \
  --quality high \
  --wait < docs/images/night-relay-cover.prompt.txt
```

The completed output was downloaded locally and encoded with `cwebp`, quality 88, method 6, metadata removed. Its 2688 × 1152 dimensions are preserved. No compositing, retouching, or text overlays were added after generation. The original high-resolution PNG is excluded from the public repository to avoid unnecessary download weight; checksums are recorded in [provenance.json](provenance.json).

The three browser captures were also converted to WebP, preserving their dimensions and visible content. They were not passed through a generative model.

The application does not call Higgsfield at runtime. Generation credentials, account identifiers, job identifiers, and private hosted-output URLs are intentionally absent from this repository. Asset conditions are described in [ASSETS.md](../../ASSETS.md).
