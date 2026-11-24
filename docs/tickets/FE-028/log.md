# FE-028 — Design Plan i dziennik

## Design Plan — 2026-11-24, przed zmianą frontend/src

Zakres i autoryzacja: dokładnie `docs/tickets/FE-028.md`, baza `a960862`.
Przeczytano AGENTS.md, frontend/src/AGENTS.md, new-component.md (katalog i
definicje), tokens.css, moduły wytycznych UI/UX oraz docs/CONTEXT.md.
Preset_3 jest źródłem wartości; design-preset.css pozostaje bez zmian.

Elementy UI: GroupedOptionList (filtr, wiersze, selected/keyboard-active,
otwieranie listy, fokus/blur, ARIA), picker profilu, wybór materiału/profilu w
Run, klasy Review i Profile, toolbar i filtry Review, panel Annotations w
Profile i Review (lista klas, Discard box, Change class/Save class, Reject/Accept),
StatusBadge wszystkich tonów, assigned oraz statusy runów i klatek.

- [x] Layout/siatka: GRID-01/02/04/05/10, SPACING-01/02/03/04/13;
  istniejące size-xs/md, element-padding, control-height i list-row-height bez zmian.
- [x] Typografia: TYPO-02/07/11, FONTSIZE-02..10, LHEIGHT-09..11,
  LSPACE-07, CASING-02; istniejące font-size-xs, font-family-ui,
  font-weight-light/semibold, line-height i letter-spacing-wide bez zmian.
- [x] Kolory: cały moduł COLOR-01..10, szczególnie COLOR-07/08/09.
  Fokus border-focus; wybór surface-panel-selected i text-primary bez zmian.
  Badge brand: border-strong, text-primary, surface-neutral-raised (jak neutral).
  Test obliczy kontrast tekstu co najmniej 4,5:1 z rzeczywistych kolorów presetu.
- [x] Obramowania: BORDER-01/02/03/05/06/08, BWIDTH-01..06/09..14,
  RADIUS-02..05. Fokus używa istniejącego focus-ring-width z ujemnym offsetem;
  badge pozostaje nieinteraktywną pigułką z border-width-default.
  BORDER-04 nie istnieje (errata). Nieinteraktywny obrys badge nie jest obrysem kontrolki.
- [x] Cienie: SHADOW-01..05, istniejący shadow-elevation-high bez zmian.
- [x] Interakcje: BORDER-06 i BWIDTH-11 definiują fokus klawiatury (w pliku
  wytycznych nie ma osobnego ID FOCUS). COLOR-07, OPACITY-01/02:
  hover/active/disabled bez zmian. Wybór, klik, Enter, strzałki, Escape,
  onConfirm i autosave FE-017 D pozostają w dotychczasowej logice.
- [x] Komponenty: reużywamy GroupedOptionList, TextField, Button,
  CollapsibleGroup, StatusBadge; bez nowych komponentów ani tokenów.

Mechanizm: mały stan `focusWithin` na korzeniu, ustawiany przez bąbelkujące
onFocus/onBlur, zerowany tylko po opuszczeniu całego komponentu. Ten sam
warunek steruje data-keyboard-active i aria-activedescendant. CSS :focus-within
samo ukryłoby ramkę, ale zostawiłoby niezgodną z nią informację ARIA.
Nie kasujemy zapamiętanego requestedActiveId w panelach z onConfirm; powrót
fokusu przywraca ten sam wiersz. Zwykłe pickery nadal zamykają się po blur.
Warunek uwzględni też otwarcie listy i istnienie widocznej opcji.

Walidacja: najpierw nowe Vitest i browser e2e RED na bazowym kodzie, potem
minimalna poprawka GREEN. E2E mierzy computed outline na prawdziwych trasach
aplikacji z deterministycznym API, bez Figma MCP i bez zrzutów Figmy.
Pełny scripts/check.ps1: 5193/8033/8034, PYTEST_ADDOPTS z ticketu,
zależności w tym worktree i cache na D:. Istniejące progi pozostają bez zmian.

## Dziennik

- Początkowy git status czysty. `rg` nie jest dostępne; wyszukiwanie przez
  Select-String/Get-ChildItem. .env skopiowano z repo bazowego (ignorowany).
- Impeccable: refinement/local defect; obowiązuje zatwierdzony ticket i preset,
  historyczny DESIGN.md jest jawnie nieobowiązującym kandydatem. Bez aktualizacji skilla.
- Zależności: `uv sync --frozen` → lokalne .venv; `npm ci --prefix frontend`
  → lokalne frontend/node_modules, bez zmiany locków, cache na D:.
- Preset od początku ma LF (`git ls-files --eol`: i/lf w/lf), więc nie wymaga odtwarzania.

## RED → GREEN

Przed modyfikacją kodu produkcyjnego (kod bazowy a960862):

- Vitest `GroupedOptionList`, `-t FE-028`: 2 FAIL. Osobno sprawdzono marker
  obrysu (oczekiwano 0, otrzymano 1) i aria-activedescendant (atrybut nadal obecny).
- Browser `fe028-focus-ring-and-badge.spec.ts`: 2 FAIL. Review: po Tab na
  Change class computed outline wiersza nadal widoczny (`true` zamiast `false`).
  Assigned: border-top-color rgb(246,247,248) zamiast rgb(98,108,128).
- Po poprawce: 33/33 testy obu komponentów PASS, nowe e2e 2/2 PASS.
  Test listy weryfikuje zaznaczenie, powrót tego samego wiersza przez Shift+Tab
  i klik filtra, Enter/onConfirm, strzałki i blur z relatedTarget=null.
  Browser mierzy outline, ARIA, dokładnie jeden biały outline na panelu przy
  Change class, tło/tekst selected oraz brak zapisów podczas nawigacji.
  Badge jest rzeczywistym assigned po narysowaniu i autozapisie boxa.
  Kolory czytane z design-preset.css; kontrast tekstu na tle #383f4c = 9,8705:1.

## Wszystkie użycia GroupedOptionList — inspekcja źródeł

- ProfileSearchField: Search profile, single bez onConfirm — zamykanie po blur
  i wybór profilu bez zmian.
- RunSetupScreen: Source file oraz Profile, single bez onConfirm — ten sam kontrakt.
- ClassGroupsPanel: Characters OCR reads (inline multiple) i Text layout (PSM)
  (single) — nie dodajemy obrysu keyboard-active do multiple/inline; roving
  tabindex i natywny focus-visible bez zmian.
- FrameToolbar: Choose frame, single — wybór zamyka picker jak dotąd.
- FrameEditor: Repeat Previous, inline multiple — bez zmian zaznaczania/kopiowania.
- AnnotationPopover: Class w Review, single z onConfirm — aktywny wiersz jest
  pamiętany poza komponentem, ale marker i ARIA są tam wyłączone.
- Profile AnnotationsPanel: osobny panel z TextField/datalist i Button, NIE
  korzysta z GroupedOptionList ani AnnotationPopover. Sprawdzono jego powiązanie
  z ClassGroupsPanel i fokus; nie ma powielonej logiki wymagającej zmiany.
- Lista klas Review (df-review-classes): osobne Button z aria-pressed,
  poza GroupedOptionList; jej selected pozostaje surface-panel-selected.

Pokrycie istniejącymi testami całej bramki: profileWorkspace.test.tsx
(picker, panel Profile, whitelist/PSM, accept/reject), annotationReviewFlow.test.tsx
(Choose frame, klasy, Repeat Previous, strzałki), AnnotationPopover.test.tsx
(fokus panelu), fe018-visual-qa (PSM), fe017/019 (Annotations i Repeat Previous),
fe022 parity/touch (Profile/Review/Run, Source file), fe025 (pickery, stany
klas i paneli). FE-028 dodaje pomiar konkretnego przeniesienia obrysu w Review.

## Biel fokusu jako akcent — tylko inwentaryzacja, bez zmian

Token fill-brand-impeccable mapuje na border-focus. Pozostałe użycia:

- Notice info: jednostronny akcent obramowania.
- NavItem: aktualny rail (lewy akcent), segment i strip (obrys aktywnej trasy).
- RegionOverlay: stroke regionu, soft fill draft/selected/preview i tło etykiety
  regionu; oddzielny dashed stroke focus jest prawidłowym fokusem.
- UiStates: spinner, eyebrow oraz pasek postępu (color i fill).
- Field: border przy hover (obok właściwego focus).
- Button aria-pressed: obrys aktywnego przełącznika; także specyficzne filtry
  klatek AnnotationReviewScreen.
- ClassGroupsPanel: border zaznaczonego checkboxa, niezależnie od fokusu.
- GroupedOptionList: obramowanie otwartego control/list (nie outline wiersza).
- global ::selection: soft fill zaznaczenia tekstu.
- DesignHarness: kolor kicker i próbki spacing (tylko ekran deweloperski).

Sam global :focus-visible i Button :focus-visible są właściwymi użyciami
koloru fokusu. Żadnego z powyższych miejsc nie zmieniono. Preset nie eksportuje
osobnego akcentu; to potencjalna luka do decyzji użytkownika w pluginie,
bez dodawania tokenu w FE-028. Wspólny brand StatusBadge pokrywa assigned,
  run/eksport Running, run Ready for review oraz frame Pending/OCR complete przez istniejące
mapowania api/messages.ts i api/frameReview.ts.

## Próby pełnej bramki

- Pierwsza: 485 backend + 1033 frontend testy PASS; build wygenerował dist,
  ale nadrzędny PowerShell `2>&1 | Tee-Object` zmienił ostrzeżenie Vite
  builtin:vite-reporter (rozmiar chunku) w wyjątek wewnątrz check.ps1.
  Efekt 6 PASS, build FAIL, 2 SKIP. To błąd sposobu przechwytywania wyjścia,
  bez zmian w kodzie ani progach. Ponowne uruchomienie przez Git Bash,
  `export` z ticketu i tee poza PowerShellem; cały gate ponownie na pierwszym
  planie tej samej tury. Wskazanie Git Bash jako shell w exec wybrało systemowy
  shim WSL; poprawne wywołanie to jawne `C:/Program Files/Git/bin/bash.exe`
  z domyślnego PowerShella.
- Druga: po 383 PASS kolejne setupy straciły plik database-template0/project.db
  (101 ERROR, 1 FAIL, bez związku ze zmianą UI). Inspekcja procesów wykazała
  równoległy gate w innym worktree `feat-fe-027-box-panel`, porty 5197/8038/8039,
  z tym samym `--basetemp=D:/tmp/fe027-gate-pytest`. Jego start usunął katalog
  trwającego przebiegu. Nie zatrzymywano ani nie modyfikowano cudzych procesów.
  Koordynator 43e30622-6efa-4ee4-b8d2-f79d2fcd0838 jawnie autoryzował zmianę
  PYTEST_ADDOPTS na `--basetemp=D:/tmp/fe027-focus-gate-pytest`, z portami
  5193/8033/8034 bez zmian. Trzecia pełna próba używa tego izolowanego katalogu.
- Trzecia: backend 485 PASS, Vitest 1033 PASS, typy/build PASS, e2e 96 PASS /
  1 FAIL. Jedyny FAIL: istniejący FE-025 FIX2 raster zoom 195/596 przekroczył
  timeout 30000 ms, bez błędu asercji obrazu. Oba FE-028 e2e PASS; FE-022
  parity/touch, FE-023, FE-024 oraz reszta FE-025 PASS. Wynik gate: 7 PASS,
  E2E FAIL, 1 SKIP. Trace zachowano w `D:/tmp/fe027-fe025-timeout-trace.zip`;
  log pełnego przebiegu `D:/tmp/fe027-focus-gate.log`.
  Trace wskazuje serializację tablic luminancji w evaluate na linii 566
  fe025-figma-icons-polish.spec.ts: pojedyncze wywołania 2,78–4,95 s
  (9 takich pomiarów), bez nieudanej asercji. Drugi gate na 5197/8038/8039
  wciąż działał; potwierdził to koordynator. Zlecił niezmieniony FE-025 osobno,
  potem końcową pełną bramkę po zwolnieniu tych portów (do 60 min oczekiwania),
  bez podnoszenia timeoutów/progów i bez zatrzymywania cudzych procesów.
- Osobny, niezmieniony `fe025-figma-icons-polish.spec.ts`: **15/15 PASS (1,5 min)**,
  w tym raster zoom 195/596 z domyślnym limitem 30 s. Nie zmieniono żadnych
  istniejących asercji, progów ani timeoutów.
- Dodatkowo `npm run test:e2e-root`: 4/4 PASS, 0 SKIP.
  Po oczekiwaniu odczyt Get-NetTCPConnection potwierdził **0 listenerów** na
  5197/8038/8039. Rozpoczęto czwarty (końcowy) pełny gate na pierwszym planie,
  z izolowanym basetemp i portami 5193/8033/8034, bez zmian kodu/testów.
- **Końcowy pełny gate: 9/9 PASS, 0 SKIP (exit 0).** Backend 485/485 PASS
  (702,07 s), Vitest 1033/1033 w 45 plikach PASS, e2e 97/97 PASS (4,9 min),
  runtime-root 4/4 PASS, format/lint/typecheck/build PASS. FE-022 parity i touch,
  FE-023, FE-024 i cały FE-025 (w tym raster 195/596) zielone, przy całkowicie
  niezmienionych progach i timeoutach. Oba e2e FE-028 również PASS.
  Nie zmieniono żadnej istniejącej asercji zakładającej dawny kolor lub obrys;
  nie było takiej potrzeby. Pełny log: `D:/tmp/fe027-focus-final-gate.log`.
  Jedynym ostrzeżeniem builda pozostaje dotychczasowy rozmiar chunku Vite.
- Po gate odtworzono historyczne PNG przez `git checkout` ograniczony do
  `docs/tickets/**/*.png`; usunięto jedyny nowy
  `docs/tickets/FE-001/screenshots/run-setup-1440.png` (nieobecny w HEAD).
  Preset i historyczne obrazy nie są częścią commita. `git diff --check` czysty.
  Bez merge/push, bez własnego reviewera; przekazanie do cold review koordynatora.

## Integration and renumbering - 2026-11-24

Coordinator cold review: MERGE, no findings. The other session merged its
Box panel as FE-027 (58efc23, e08c4ad, cbbafaf). This focus-ring/badge ticket
is therefore FE-028; the existing branch name stays unchanged. Rebase onto
main cbbafaf preserves its FE-027 documentation and Box-panel implementation
exactly. Original pre-integration validation above is retained as history.

Design Plan addendum before frontend/src edits: only this ticket's test names
and comments are renumbered; no UI logic, tokens or style values change.
The existing design checklist and guideline IDs above still apply. The class
list and Change class now sit inside Panel Box (.df-review-box), while the
inner .df-annotation-popover and its controls keep their selectors. Re-run the
unchanged focus/ARIA/outline assertions there, followed by the entire gate on
5193/8033/8034 with --basetemp=D:/tmp/fe028-focus-gate-pytest.

Re-check after rebase: 33/33 component tests PASS; FE-028 e2e 2/2 PASS on
the new Box panel (19.4 s), including the exact original outline/ARIA/selection
assertions and assigned colours. No selector or assertion changes were needed;
only the spec filename and ticket labels changed. Main's FE-027 files have no
diff. Ports 5197/8038/8039 were not listening before this validation.

Post-rebase full gate: **9/9 PASS, 0 SKIP, exit 0** on 5193/8033/8034 with
PYTEST_ADDOPTS=--basetemp=D:/tmp/fe028-focus-gate-pytest, run in the foreground
until completion. Backend 485 PASS (589.16 s), Vitest 1034 PASS in 45 files,
E2E 97 PASS (5.0 min), runtime-root 4 PASS; format/lint/types/build PASS.
FE-022 parity/touch, FE-023, FE-024, FE-025 and both FE-028 e2e all PASS;
no thresholds, timeouts, selectors or assertions changed for integration.
Full output: D:/tmp/fe028-focus-gate.log. Historical PNGs restored with
git checkout; generated untracked run-setup-1440.png removed. The rebased
commit is amended with this record; no merge or push.
