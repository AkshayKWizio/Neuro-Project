# Assets and third-party notices

The application source code is licensed under [MIT](LICENSE). Media, fonts, and third-party marks have the separate notices below. This repository does not claim that every included file is MIT-licensed or that the generated artwork has an unrestricted open license.

## Original game content

The Samarkand festival environment, patterned tilework, lighting, drone, obstacles, fallback courier, particle effects, mural composition, phone/camera illustrations, and favicon are built from project-authored code and vector shapes. Their source is covered by the code license. Registan is an architectural inspiration; the environment is a stylized interpretation, not a scan or an official reconstruction. No photographs or meshes from UNESCO are included. [UNESCO's Samarkand entry](https://whc.unesco.org/en/list/603/) is a factual reference.

The mural incorporates the separately identified Higgsfield mark. Its inclusion does not transfer rights in that mark.

## Generated media

These files are covered by [Generated game assets — separate permission](LICENSES/HIGGSFIELD-ASSETS.md), including its restriction on AI training. That permission allows the listed game and documentation uses to the extent the contributors hold the rights; it is not MIT or CC BY.

| Files                                                                                | Creation and processing                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/assets/runner-relay.glb`                                                     | Original adult female courier brief: tangerine technical jacket, short violet hair, plum trousers, reflective shoes. Text-only reference generated with Higgsfield Nano Banana Pro, then Higgsfield Multi-Image to 3D with rigging, PBR texturing, and RunFast animation. No existing game-character reference image was used. Texture optimized to 2048px JPEG; runtime scale is 1.85m. |
| `public/audio/wet-step-a.mp3`, `wet-step-b.mp3`, `wet-step-c.mp3`, `wet-landing.mp3` | Higgsfield Seed Audio 1.0 output from an original wet-footstep brief; edited into individual impacts, normalized, faded, and encoded as mono MP3. These are generated sounds, not claimed field recordings.                                                                                                                                                                              |
| `public/audio/runner-breath.mp3`                                                     | Higgsfield Seed Audio 1.0 output from an original athletic-breathing brief; trimmed, normalized, faded, and encoded as mono MP3. No person's voice was cloned.                                                                                                                                                                                                                           |
| `docs/images/night-relay-cover.webp`                                                 | Promotional illustration generated through Higgsfield with GPT Image 2. It is concept artwork, not a gameplay capture. See the adjacent image provenance notes.                                                                                                                                                                                                                          |
| Gameplay and interface images in `docs/images/`                                      | Browser captures of this project. Their generated character and other incorporated assets retain the notices in this document; third-party marks retain their separate rights.                                                                                                                                                                                                           |

Other game sounds are synthesized by the project's Web Audio code. No audio generation account or API key is required to run the game. The packaged model and audio are served locally by the app. A sanitized [runtime asset manifest](docs/assets/runtime-assets.json) records output hashes and generation details without account identifiers or private generation URLs.

Higgsfield's current terms permit commercial use and sublicensing of creators' output rights (§4.4), while restricting AI training and certain competing uses (§5.1(iii), §5.2(iv)). They do not guarantee originality or third-party clearance. See the [official terms](https://higgsfield.ai/terms-of-use-agreement) and [output-rights explanation](https://higgsfield.ai/creator-hub/help-center/account/who-owns-my-generations-and-can-i-use-them-commercially). Checked September 4, 2026.

## Fonts

| Bundled files                                     | Authors and license                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/fonts/manrope-400.ttf`, `manrope-700.ttf` | Manrope Project Authors, font version 4.504. [Upstream project](https://github.com/sharanda/manrope), [bundled SIL Open Font License 1.1](public/fonts/OFL-Manrope.txt). |
| `public/fonts/barlow-condensed-800-italic.ttf`    | Barlow Project Authors, font version 1.408. [Upstream project](https://github.com/jpt/barlow), [bundled SIL Open Font License 1.1](public/fonts/OFL-Barlow.txt).         |

Both bundled license files were checked against Google's official font repository on September 4, 2026: [Manrope OFL](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt), [Barlow Condensed OFL](https://github.com/google/fonts/blob/main/ofl/barlowcondensed/OFL.txt). Keep the copyright notices and OFL texts with redistributed fonts. The fonts remain under OFL, not the application code license.

## Marks and icons

- `public/branding/higgsfield-mark.svg` preserves the glyph published on [Higgsfield's website](https://higgsfield.ai/), adapted into a standalone light-colored SVG. Higgsfield's name and mark remain the property of their respective owner. **No trademark license or general right to reuse the mark is granted by this repository.** The code and generated-media permissions do not authorize use suggesting Higgsfield endorsement, sponsorship, or affiliation. For an independent branded fork, replace this mark and the Higgsfield naming unless you have an applicable right to use them. The current game includes the requested branding; that is not a sublicense of the mark to downstream projects.
- `public/branding/github.svg` is the GitHub mark icon from [Primer Octicons](https://github.com/primer/octicons), distributed with its [original MIT notice](public/branding/LICENSE-octicons.txt). The icon's copyright license does not grant rights in GitHub's trademarks.

## Runtime libraries

| Package                          | Included notice                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Three.js 0.180.0                 | [MIT — Three.js authors](LICENSES/three-MIT.txt). The deployed credits page also includes this notice. |
| `@neondatabase/serverless` 1.1.0 | [MIT — Neon Inc.](LICENSES/neon-serverless-MIT.txt).                                                   |

Dependencies installed through npm retain their own licenses and notices, including any transitive dependencies. `package-lock.json` records the installed dependency graph; the project's MIT license does not replace those licenses.
