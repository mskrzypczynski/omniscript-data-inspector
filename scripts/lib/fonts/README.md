# Fonts for the rendered screenshots

Dev tooling only: never shipped in the extension. `scripts/lib/demo-panel.mjs`
loads these as web fonts when it renders the panel for the store screenshots,
the accessibility check and the review renders, so every machine (a laptop,
CI, a container) draws the same pixels and `scripts/compare-screenshots.mjs`
compares like with like. The extension itself uses the system fonts.

- Inter (Regular, Medium, SemiBold, Bold): SIL Open Font License 1.1, see
  LICENSE-Inter.txt. https://github.com/rsms/inter
- DejaVu Sans Mono (Book, Bold): Bitstream Vera licence, see
  LICENSE-DejaVu.txt. https://dejavu-fonts.github.io/
