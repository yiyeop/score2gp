# Score2GP

_[한국어](README.md) · English_

**Turn PDF sheet music into sound.** Score2GP reads a PDF exported by notation
software — picking up the tablature, rhythm and playing techniques — and writes
it out as a Guitar Pro file. The playback cursor follows the score and you can
slow it down, so you can practise along.

It reads **vector PDFs**: files produced by _Export as PDF_ in Guitar Pro,
Finale or MuseScore. Scans and photographs are not supported.

## What it does

- **Open scores** — `.gp`, `.gp3`–`.gpx`, MusicXML. No file at hand? A demo song
  is built in
- **Practise along** — the cursor follows the music, speed goes down to 25% (and
  up to 200%), sections loop, and there is a metronome and a count-in
- **Pick parts** — per track, choose whether it is drawn on the score and how it
  sounds (volume, mute, solo)
- **Section timeline** — the whole piece on one line. Click an Intro/Verse/Chorus
  block or a tone change to jump to that bar
- **Technique hints** — hover a note to see what the technique is (slide,
  tapping, pinch harmonics…), explained for beginners
- **PDF conversion** — drop in sheet-music PDF and get a playable Guitar Pro
  file. The converter ships inside the app, so you do not need Python
- **Edit mode** — fix notes the conversion misread (fret, string, duration) and
  fill in per-bar tones
- **Export** — Guitar Pro 7 (`.gp`), MIDI or alphaTex
- **Korean titles restored** — garbled CP949 text in older Guitar Pro files is
  detected and repaired
- Press `?` in the app for the keyboard shortcuts

## Install

### [⬇ Download the latest release](https://github.com/yiyeop/score2gp/releases/latest)

| OS                    | File to grab                    |
| --------------------- | ------------------------------- |
| macOS (Apple Silicon) | `.dmg`                          |
| Windows               | `-setup.exe` (or `.msi`)        |
| Linux                 | `.AppImage` (or `.deb`, `.rpm`) |

Pick by extension — there is exactly one per platform. The architecture suffix
in the filename (`x64`, `aarch64`, …) is chosen by the build tooling, so it is
deliberately not documented here; naming it would silently go stale.

> **The macOS build is Apple Silicon only (M1 and later).** It will not run on
> an Intel Mac, not even under Rosetta. Check with → About This Mac → the
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

**On v0.1.2 or earlier you may get "is damaged and can't be opened"** — those
releases shipped with a broken bundle signature, so **Open Anyway** never
appears. Don't move it to the Trash: close the dialog and use the terminal
command above, or download a newer release.

**Windows**

When SmartScreen shows "Windows protected your PC", choose **More info** →
**Run anyway**.

## Limits

- **Scans and photos are out of scope.** Only vector PDFs exported by notation
  software are read ([why](adr/0001-vector-pdf-instead-of-omr.md))
- Conversion is not perfect. Misread notes can be corrected in **edit mode**
- Builds are unsigned, so the first launch is blocked once (see above)

## Contributing

Bugs and ideas are welcome as [issues](https://github.com/yiyeop/score2gp/issues).
To work on the code, the development notes (in Korean) are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU AGPL v3](LICENSE).

[PyMuPDF](https://pymupdf.readthedocs.io/), which reads the PDFs, is AGPL, and it
is shipped inside the app — so this is less a choice than a consequence. If you
distribute a modified version of the app, its source has to be available under
the same license.

What ships with it:

| Component                                                             | License          |
| --------------------------------------------------------------------- | ---------------- |
| [alphaTab](https://alphatab.net/) — score rendering and playback      | MPL-2.0          |
| [PyMuPDF](https://pymupdf.readthedocs.io/) — PDF reading              | AGPL-3.0         |
| [PyGuitarPro](https://pyguitarpro.readthedocs.io/) — writing GP files | LGPL-3.0         |
| [Tauri](https://tauri.app/) — desktop shell                           | MIT / Apache-2.0 |
| SONiVOX soundfont — playback voices                                   | Apache-2.0       |
