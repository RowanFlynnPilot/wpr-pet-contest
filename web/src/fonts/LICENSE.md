# Fonts

The Latin subsets of three typefaces, as served by Google Fonts on Oct. 25,
2026, self-hosted so the page makes no third-party request before its first
paint. All three are licensed under the SIL Open Font License, Version 1.1,
which permits bundling and redistribution with software.

| File | Typeface | Copyright |
|------|----------|-----------|
| `bricolage-grotesque-latin.woff2` | Bricolage Grotesque (variable: opsz, wght 200–800) | Copyright 2022 The Bricolage Grotesque Project Authors |
| `public-sans-latin.woff2` | Public Sans (variable: wght 400–800) | Copyright 2015 The Public Sans Project Authors (USWDS) |
| `public-sans-italic-latin.woff2` | Public Sans Italic (400) | Copyright 2015 The Public Sans Project Authors (USWDS) |
| `jetbrains-mono-latin.woff2` | JetBrains Mono (variable: wght 500–700) | Copyright 2020 The JetBrains Mono Project Authors |

License text: https://openfontlicense.org/open-font-license-official-text/

To refresh them, fetch the `css2` stylesheet for the same families from
fonts.googleapis.com with a current browser's user agent and take the
`latin` blocks' files; `src/styles/fonts.css` holds the matching rules.
