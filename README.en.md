# Score2GP

*[한국어](README.md) · English*

**Turn PDF sheet music into sound.** Score2GP reads a PDF exported by notation
software — picking up the tablature, rhythm and playing techniques — writes it
out as a Guitar Pro file, and plays it back so you can practise along, the way
Songsterr does.

It reads **vector PDFs**: files produced by *Export as PDF* in Guitar Pro,
Finale or MuseScore. Scans and photographs are not supported.

## Install

### [⬇ Download the latest release](https://github.com/yiyeop/score2gp/releases/latest)

| OS | File to grab |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| Windows | `-setup.exe` (or `.msi`) |
| Linux | `.AppImage` (or `.deb`, `.rpm`) |

Pick by extension — there is exactly one per platform. The architecture suffix
in the filename (`x64`, `aarch64`, …) is chosen by the build tooling, so it is
deliberately not documented here; naming it would silently go stale.

The PDF converter ships inside the app. You do **not** need Python installed.

> **The macOS build is Apple Silicon only (M1 and later).** It will not run on
> an Intel Mac, not even under Rosetta. Check with  → About This Mac → the
> chip should read `Apple M…`.

### The first launch shows a warning

The builds are unsigned, so the OS blocks them once. Allow it a single time and
it opens normally from then on.

**macOS**

1. Open the `.dmg` and drag `score2gp` into `Applications`
2. Launch it — you'll get "cannot be opened". Dismiss the dialog
3. Open **System Settings → Privacy & Security**, scroll down to the line
   saying `score2gp` was blocked, and press **Open Anyway**
4. Launch again and press **Open**

If you prefer the terminal:

```bash
xattr -dr com.apple.quarantine /Applications/score2gp.app
```

**Windows**

When SmartScreen shows "Windows protected your PC", choose **More info** →
**Run anyway**.

## Development

```bash
npm install
npm run tauri dev     # desktop app
npm run dev           # front end only in a browser (file open falls back to <input>)
```

PDF conversion additionally needs the extractor's Python environment:

```bash
cd tools/pdfextract
python3 -m venv .venv && .venv/bin/pip install pymupdf pyguitarpro pyinstaller
```

## Building for distribution

```bash
npm run tauri build   # .app and .dmg land in src-tauri/target/release/bundle/
```

The converter is packed into a single executable (~33 MB) with PyInstaller and
shipped inside the app, so conversion works on machines without Python or
PyMuPDF. `tools/pdfextract/build-sidecar.sh` does the packing and the build
command calls it automatically (skipping it when the extractor sources are
unchanged).

At runtime the Rust side looks for the repository's `convert.py` **first**, so
that iterating on the extraction logic doesn't mean re-packing 33 MB every
time. A distributed build has no repository around it and falls back to the
bundled executable.

Sidecars are platform-specific — the target triple is part of the filename — so
they are not committed. To produce a build for another platform, run the build
there.

**Release targets are macOS (Apple Silicon), Windows and Linux.** Intel Macs
are not supported: an arm64 binary won't run there even under Rosetta, which is
why the release notes say so explicitly. Pushing a `v*` tag makes GitHub Actions
build all three and attach them to a draft release
(`.github/workflows/release.yml`).

One trap worth knowing: the sidecar's **filename** comes from rustc's target
triple while its **contents** are built by whichever Python is on hand. If the
two disagree the build script refuses to continue — an x86_64 binary carrying an
arm64 name builds and bundles happily and only fails on the user's machine.

## What works today

- **Read mode** — open `.gp`/`.gp3`–`.gpx`/MusicXML, play and pause, choose
  which tracks are rendered, per-track volume/mute/solo, bar-by-bar seeking,
  transposition (semitones, playback pitch), speed (25–200%), looping,
  metronome, count-in
- **Tone & section timeline** — a one-line scrubber for the whole piece.
  Sections (Intro/Verse/Chorus…) show as blocks and tone changes as markers
  below; clicking either jumps to that bar. Only the currently rendered track's
  tone markers are shown (`src/lib/markers.ts`)
- **PDF conversion** — drop in a sheet-music PDF and it becomes a playable
  Guitar Pro file. The algorithm lives in the Python implementation under
  `tools/pdfextract`, which Rust invokes as a process
  (`src-tauri/src/convert.rs`). It hasn't been ported to Rust because the
  heuristics still change often; the command surface is stable, so only the
  implementation would need swapping. Results are cached per PDF — change the
  converter and the cache key changes with it, so extraction improvements show
  up immediately
- **Track effects** — chorus, reverb and friends that the original file applies
  to a part, surfaced in the track list in words ("strong chorus"). alphaTab
  discards these values, so they are read straight from the file
  (`src/lib/gpEffects.ts`)
- **Export** — save the open score as Guitar Pro 7 (`.gp`), MIDI or alphaTex.
  For a converted PDF you can also keep the converter's original `.gp5`
  (`src/lib/exportScore.ts`)
- **Technique tooltips** — hover a note to see the techniques it uses (slides,
  tapping, pinch harmonics…) explained for beginners. The sidebar lists the
  techniques present in the current track; click one to jump to its first
  occurrence (`src/lib/techniques.ts`)
- **Keyboard shortcuts** — press `?` for the full list (Space to play, ←→ to
  move a bar, `[` `]` to transpose, `+` `-` for speed…)
- **Korean text encoding** — older Guitar Pro files (gp3–gp5) store strings in a
  local encoding rather than UTF-8 (CP949 for Korean releases), which mangles
  titles and track names. Candidate encodings are tried before loading and the
  one that doesn't break is picked automatically; when the guess is wrong you
  can override it in the sidebar (`src/lib/detectEncoding.ts`)
- **Edit mode** — fix what the conversion misread. Click a note to select it and
  change its fret, string or duration, or replace it with a rest. **Per-bar
  tones** (clean, distortion…) can be added or changed too, for when the
  conversion missed a tone marking; the timeline updates immediately. Undo/redo
  sits at the bottom at all times and number keys enter frets directly
  (`src/modes/edit/`)
- A built-in demo piece (alphaTex) lets you try everything without a file

## Architecture

```
src/
├── player/useAlphaTab.ts      # alphaTab instance + playback state (owned by App, shared across modes)
├── shortcuts/useShortcuts.ts  # per-mode keyboard shortcut registration hook
├── modes/
│   ├── registry.ts            # mode list (register new modes here)
│   ├── read/                  # read mode: TrackList, TransportBar, readShortcuts, ShortcutHelp
│   └── edit/                  # edit mode: useScoreEditor (edits + undo), EditMode, EditMarker
├── lib/openScore.ts           # file open (Tauri dialog + read_score / browser fallback)
└── demo/demoSong.ts           # built-in demo piece
src-tauri/src/lib.rs           # read_score command (file → bytes)
```

Built with Tauri 2, React and alphaTab.

The central design decision: exactly one alphaTab instance lives at App level,
independent of the current mode. A mode only swaps the surrounding UI (sidebar,
bottom bar, shortcuts), so edit mode inherits the loaded score and playback
state as they are.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | GP player (read mode) | ✅ |
| 1 | **Direct vector-PDF extraction** → note data | ✅ |
| 1b | OMR for scanned PDFs (Audiveris sidecar) | on hold |
| 2 | Extraction → `.gp` output, direct GP parsing | ✅ |
| 3 | Edit mode (fixing misreads) | ✅ |

### Design records

Decisions that changed direction are recorded in [`adr/`](adr/), reasoning
included (written in Korean).

- [ADR 0001 — read vector PDFs directly instead of running OMR](adr/0001-vector-pdf-instead-of-omr.md)
- [ADR 0002 — parse track effects straight out of GP files](adr/0002-read-gp-effects-directly.md)

## Requirements

- Node 20+, Rust 1.88+ (required by Tauri's dependencies)
- Python 3.11+ (for PDF conversion; not needed by users of a released build)
