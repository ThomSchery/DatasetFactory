# Figma 2026-11-05 — dane do FE-022

Źródło: plik Figma `UGuOLszRRvRZ8N0I2yDLw8` (DataSetFactory), konto właściciela, odczyt przez Figma MCP
(`use_figma`, wyłącznie właściwości węzłów i zmiennych). **Bez zrzutów ekranu.** Eksporty PNG z
`designs/figma-2026-11-03/` są nieaktualne i nie są źródłem dla FE-022.

Limit wywołań Figma MCP (plan Starter) został wyczerpany 2026-11-05. Nie wywołuj Figma MCP — wszystko,
co dało się odczytać, jest w tym katalogu.

## Pliki

- `geometry.json` — spłaszczona geometria 14 zaprojektowanych ramek. `screenToFrame` mapuje ekran i
  szerokość na ID ramki (`null` = w Figmie brak makiety: ramka pusta albo z samym nagłówkiem).
  `rowSchema` opisuje wiersze: `f` element z wypełnieniem/obrysem, `t` tekst, `m` warstwa z obrazem
  (`IMG:FILL` = obraz wypełnia pole, kadrowany), `i` ikona ≤ 40 px. Współrzędne w px od lewego górnego
  rogu ramki. `contentBottom` = dół ostatniego elementu.
- `variables.json` — 112 zmiennych i 4 kolekcje (Colors, Dimensions, Borders, Typography).
- `page-inventory.json` — elementy najwyższego poziomu strony Setup (w tym komponent `sidebar` 1248:991
  i etykiety sekcji `1. Upolad`, `2. Setup for scan`, `3. Review for scan`, `4.Annotations`).
- `sidebar-2026-11-03.json` — struktura komponentu `sidebar` z 03.11 (69×749, ikony Iconly Light 24 px).
- `app-baseline-geometry.json` — geometria DOM aplikacji z main 11342f5 (stan przed FE-022), ten sam
  format wierszy, szerokości 360/576/768/992/1200/1400, okno 900 px.
- `measure-app-geometry.cjs` — skrypt, którym zmierzono aplikację (Playwright, bez zrzutów, zapisy API
  blokowane). Punkt wyjścia dla testu zgodności.

## Mapa ekranów

| Ekran | 360 | 576 | 768 | 992 | 1200 |
|---|---|---|---|---|---|
| Upload | 1248:831 | — | — | — | — |
| Profile | 1355:1291 | 1395:1656 | 1355:1306 | 1355:1307 | 1355:1308 |
| Run | 1378:2014 | 1362:1567 | 1362:1568 | 1362:1569 | 1362:1570 |
| Review | 1002:14 | 1473:4993 | 1473:5012 | — | — |

Ramki 1400 px są puste. „—” = rozszerz najbliższy mniejszy wariant.

## Kluczowe wartości (05.11)

- Margines strony 16 px na każdej szerokości (`site/padding/XS` → `spacing/16`). Zmienne
  `site/padding/M` = 24 i `site/padding/L` = 32 istnieją, ale żadna ramka ich nie używa.
- Wnętrza i odstępy kontrolek: `element/padding/L-R/L|M|S` = 16/8/6, `element/padding/U-D/L|M` = 8/4,
  `element/gap/L|M` = 8/6. Promień kontrolek `radius/element/S` = 4; listy i panele 4–8.
- Obrysy paneli i kontrolek `border/default` #4B5465; tła `surface/page` #23262C, `surface/panel` #2B303A,
  pole/lista #23262C, zaznaczenie `surface/panel-selected` #4B5465 / hover #383F4C.
- Teksty: nawigacja i przyciski 12 px / 300, etykiety pól 8–10 px / 300, etykiety paneli 12 px / 400,
  nagłówki ekranów 16 px („Run Setup” 600, „Review frames” 400).
- Pasek górny 44 px: po lewej ikona ☰, po prawej ikona użytkownika i ⋮. Bez tekstu.
- Przełącznik Upload / Profile / Run: pigułka 361×48 (przy 360 px: 328×48), pozycje 100–120×40,
  promień 40, ikona 24 px + etykieta 12 px.
- Profile 768–1200: lewa kolumna 247 px (wnętrze 231), obraz w panelu od x 279; przycisk Run
  120×40 w prawym dolnym rogu panelu obrazu. Treść kończy się na 832 px.
- Run 768–1200: nagłówek „Run Setup”, panel pól 205 px, przycisk Run na dole panelu, obraz obok.
  360/576: obraz → panel pól → przycisk Run na całą szerokość.
- Review 576/768: „Review frames” + filtry w jednym wierszu (pigułki 30 px, promień 16); lewa kolumna
  261 px: ← 1/14 →, panel Annotations (pole klasy, lista z licznikami, Reject/Accept), panel Repeat
  Previous (lista z licznikami, Accept); obraz po prawej 465×543. 360: filtry w dwóch wierszach,
  obraz 328×511, panele pod obrazem.

## Panel boczny (sidebar)

Komponent `sidebar` 1248:991 leży od 05.11 poza ramkami (obok ramki Review 360) — w makiecie mobilnej jest
schowany. Według widoku Figmy, który użytkownik pokazał 2026-11-05: pionowy pasek ikon na tle panelu,
od góry: przycisk zwijania `|←`, Upload (tacka ze strzałką w górę), koło zębate, ikona skanowania
(narożniki ramki z linią), ołówek. Odpowiada sekcjom z płótna: 1. Upload, 2. Setup for scan,
3. Review for scan, 4. Annotations (kolejność wierszy ramek na płótnie: Upload, Profile, Run, Review).
W wersji 03.11 komponent miał 69×749 px i ikony 24 px (Folder, Setting, Scan, Paper Download).
