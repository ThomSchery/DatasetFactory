# FE-011 — log implementacji części A i B

## Zakres

Ta gałąź realizuje wyłącznie:

- część A: odkrywalny pan po przybliżeniu;
- część B: oddanie szerokości viewportu obrazowi przy zachowaniu dokowanego,
  przewijanego panelu.

Część C (tworzenie klasy z edytora) jest świadomie poza zakresem. Nie ma zmian
backendu ani kontraktu zapisu anotacji.

## Reprodukcja przed zmianą

Reprodukcję wykonano w prawdziwym headless Chromium przez repozytoryjny
Playwright, na aplikacji działającej pod `127.0.0.1:5173` i z API przechwyconym
przez `ApiHarness`. In-app Browser nie był dostępny w tej sesji; koordynator
jawnie zaakceptował repozytoryjny Playwright jako dowód geometrii i zaufanych
zdarzeń `page.mouse`. Ten dowód nie obejmuje systemowych zachowań okna, takich
jak `Alt+Tab`, i raport nie przypisuje mu takiego pokrycia.

### Część A — rozstrzygnięcie przyczyny

Przy viewportcie 1440×1000 i zoomie wyświetlanym jako 156%:

- środkowy przycisk zmienia transformację zoom stage — mechanika panu działa;
- clamp dochodzi do czterech narożników dopuszczalnego zakresu:
  `0, 0`, `-468.011, 0`, `-468.011, -311.893`, `0, -311.893`;
- dalszy ruch zatrzymuje się na zakresie
  `x ∈ [-468.011, 0]`, `y ∈ [-311.893, 0]` — clamp nie jest przyczyną;
- zwykły lewy drag nie zmienia transformacji i otwiera panel
  „Wybierz klasę dla nowego bbox” — zgodnie z kontraktem rysowania;
- jedyna widoczna treść sterowania w prawym górnym rogu to `156%` i `1×`.

Wniosek: główną przyczyną jest **brak odkrywalności**, a konflikt lewego
przycisku z rysowaniem jest obserwowalnym skutkiem tej luki. Operator próbuje
najbardziej naturalnego gestu i dostaje nowy bbox. Kod panu i clamp są poprawne;
naprawa dotyczy interfejsu oraz jawnego wyboru właściciela lewego dragu.

### Część B — wymiary obrazu przed zmianą

Wymiary przy 1×, z otwartym panelem „Edytuj anotację”:

| Viewport | Obraz przed | `panel.bottom` | `innerHeight` |
| --- | ---: | ---: | ---: |
| 1280×1000 | 829.266×551.984 | 999.781 | 1000 |
| 1440×1000 | 829.266×551.984 | 999.781 | 1000 |
| 1920×1080 | 949.453×631.984 | 1079.781 | 1080 |

Potwierdza to diagnozę ticketu: reguła
`max-height: calc(100dvh - (var(--size-xxl) * 7))` wiąże wysokość obrazu,
niezależnie od niewykorzystanej szerokości.

## Design Plan

Tryb powierzchni: **Operate**. Zachowujemy incumbent „Home — Impeccable”,
istniejący model rysowania i wszystkie zachowania FE-009/FE-010. To wąska
naprawa przepływu i layoutu, nie redesign.

### Elementy interfejsu i wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Kontener podglądu `.df-review-workspace__preview` | Zachowuje stały padding, obrys i pozycję w gridzie. Nic nad nim nie reaguje wysokością na pointer/gest. | Grid & Spacing: `GRID-01`, `GRID-02`, `GRID-08`, `SPACING-01`, `SPACING-02`; UI & Visuals: `BORDER-02`, `BORDER-05`, `BORDER-07`, `BWIDTH-06`, `RADIUS-02` |
| Obraz klatki i viewport `RegionOverlay` | Usunąć feature-level cap odejmujący z góry pełną wysokość panelu. Obraz wykorzystuje szerokość podglądu do naturalnej rozdzielczości; `overflow: hidden` nadal chroni viewport zoomu. | Grid & Spacing: `GRID-01`, `GRID-08`, `GRID-12`, `SPACING-11`; UI & Visuals: `BORDER-07`, `OVERLAY-06` |
| Zoom stage i SVG bboxów | Bez zmian układu współrzędnych, źródłowej geometrii, transform origin i clampu. Jawny tryb ręki przejmuje tylko LMB; środkowy przycisk i `Space`+LMB pozostają bez zmian. | UI & Visuals: `OVERLAY-06`, `COLOR-07`, `COLOR-09`; Typography: `OPACITY-02`; FE-08 |
| Celownik i kursory | W trybie ręki LMB nie rysuje bboxa; powierzchnia pokazuje `grab`/`grabbing`, a celownik rysowania nie sugeruje równoległego trybu. Po wyłączeniu ręki wraca dotychczasowy crosshair i rysowanie. | UI & Visuals: `COLOR-07`, `OVERLAY-06`; Typography: `OPACITY-02` |
| HUD `.df-region-overlay__zoom-controls` | Pozostaje stabilną nakładką w prawym górnym rogu, poza zoom stage, więc nie skaluje się ani nie zmienia wysokości kanwy. Mieści zoom, nowy tryb ręki i reset 1×. | Grid & Spacing: `GRID-01`, `GRID-02`, `GRID-05`, `SPACING-01`; UI & Visuals: `COLOR-01..10`, `OVERLAY-01`, `OVERLAY-02`, `OVERLAY-06`, `RADIUS-02`, `SHADOW-05`; Typography: `TYPO-02`, `FONTSIZE-02`, `FONTSIZE-08`, `LHEIGHT-09` |
| Przycisk trybu ręki | Użyć istniejącego `Button`, `size="sm"`. Widoczna treść „Przesuwaj kadr”; po aktywacji treść „Zakończ przesuwanie” i `aria-pressed=true`. Przy 1× jest widoczny, lecz nieaktywny; przy zoomie >1× można go obsłużyć myszą lub klawiaturą bez znajomości skrótu. | katalog `new-component.md`, `Button`; Grid & Spacing: `GRID-03`, `GRID-05`, `SPACING-13`; UI & Visuals: `COLOR-07`, `COLOR-08`, `BORDER-03`, `BORDER-06`, `BWIDTH-03`, `BWIDTH-06`, `BWIDTH-09..13`, `RADIUS-02`, `RADIUS-03`; Typography: `TYPO-06..11`, `FONTSIZE-02`, `FONTSIZE-08`, `LHEIGHT-10`, `CASING-01`, `CASING-02`, `OPACITY-02` |
| Wartość zoomu i przycisk resetu 1× | Bez zmiany treści, semantyki i natywnej aktywacji `Space`. Reset zeruje kadr i kończy tryb ręki, ponieważ przy 1× pan jest no-opem. | katalog `new-component.md`, `Button`; `GRID-05`, `COLOR-07`, `BORDER-06`, `FONTSIZE-09`, `LHEIGHT-09`, `OPACITY-02` |
| `AnnotationPopover` pod obrazem | Pozostaje w normalnym flow i wykorzystuje własne `max-height`/`overflow-y:auto`. Jego `top` wynika z większego obrazu, a dostępna wysokość jest obliczana od bieżącego topu; `panel.bottom <= innerHeight` pozostaje bramką. Klik i pan w HUD/na kanwie nie zamykają panelu ani nie porzucają preview. | Grid & Spacing: `GRID-08`, `SPACING-01`; UI & Visuals: `OVERLAY-06`, `BORDER-05`; FE-08 |
| Panele „Anotacje na klatce” i „Dane klatki” | Bez zmian treści, gridu i pozycji pod podglądem. Nie zakrywają HUD ani bboxów. | katalog `new-component.md`, `Panel`; `GRID-01`, `SPACING-01`, `BORDER-02`, `RADIUS-02` |
| Toolbar i wszystko nad kanwą | Bez zmian struktury oraz wysokości w reakcji na pointer, zoom, pan i wybór ręki. | `GRID-01`, `SPACING-01`, `COLOR-07`, `OPACITY-02` |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** istniejące `--size-*`; usuwamy błędny cap, bez nowej
  arbitralnej wysokości (`GRID-01/02/08/12`, `SPACING-01/02/11`).
- [x] **Typografia:** istniejący `Button` i HUD: `--font-size-sm/xs`,
  `--line-height-standard/tight`, `--font-weight-semibold`
  (`TYPO-02/06..11`, `FONTSIZE-02/08/09`, `LHEIGHT-09/10`, `CASING-01/02`).
- [x] **Kolory:** wyłącznie istniejące warianty `Button` i tokeny HUD;
  stan aktywny ma również zmienioną treść i `aria-pressed`, więc nie zależy od
  samego koloru (`COLOR-01..10`, `OPACITY-02`).
- [x] **Obramowania:** wyłącznie obecne `stroke-weak/strong` i tokeny 1/2 px;
  brak zmiany geometrii przy focusie (`BORDER-02/03/05/06/07`,
  `BWIDTH-03/06/09..13`, `RADIUS-02/03`).
- [x] **Cienie:** brak nowych cieni; ciemny HUD używa różnicy powierzchni
  (`SHADOW-05`).
- [x] **Interakcje:** ręka przejmuje LMB i wyłącza rysowanie; środkowy przycisk,
  pełny kontrakt `Space`, clamp, zoom anchor, reset, outside-dismiss i
  niezmienność wysokości pozostają (`COLOR-07`, `OVERLAY-06`, `OPACITY-02`).
- [x] **Komponenty:** istniejący `Button`; `Panel`, `RegionOverlay` i
  `AnnotationPopover` pozostają właścicielami swoich obecnych ról. Nie powstaje
  nowy komponent common.

## Plan testów i commitów

1. `docs(fe-011)`: plan i wyniki reprodukcji „przed”.
2. `test(fe-011)`: czerwone sondy widocznej treści sterowania, trybu ręki,
   rysowania po wyłączeniu oraz clampu czterech krawędzi.
3. `feat(fe-011)`: jawny tryb ręki w stabilnym HUD.
4. `fix(fe-011)`: usunięcie błędnego ograniczenia wysokości obrazu.
5. `test(fe-011)`: Chromium — ścieżka operatora, trzy viewporty, panel, screenshot
   do viewportu i komplet regresji FE-009/Space.
6. `docs(fe-011)`: liczby „po”, raport QA i pełna bramka 9/9.

Visual QA: screenshot ograniczony do viewportu 1440×1000, z otwartym panelem,
zoomem 156% i widocznym przyciskiem trybu ręki. Wysokość obszaru nad kanwą i
samego kontenera kanwy będzie porównywana przed/po pointerze oraz geście.

## Implementacja

### Część A — jawny tryb ręki

- HUD `RegionOverlay` ma stale widoczny przycisk `Przesuwaj kadr`. Przy 1× jest
  nieaktywny; po zoomie można go włączyć bez skrótu klawiaturowego.
- Aktywny stan zmienia treść na `Zakończ przesuwanie`, ustawia
  `aria-pressed="true"`, używa istniejącego wariantu primary i kursora
  `grab`/`grabbing`. Celownik rysowania jest w tym stanie ukryty.
- LMB w trybie ręki przechodzi przez tę samą ścieżkę panu i clampu co istniejący
  środkowy przycisk oraz `Space`+LMB. Nie tworzy draftu. Wyłączenie ręki
  przywraca niezmieniony gest rysowania.
- Przełączenie jest wewnątrz chronionego HUD, więc nie uruchamia
  outside-dismiss. Zaznaczenie, otwarty panel oraz niezapisany nudge pozostają.
  Reset `1×` kończy tryb ręki i centruje obraz zgodnie z dotychczasowym
  kontraktem.

### Część B — szerokość obrazu

- Usunięto wyłącznie feature-level
  `max-height: calc(100dvh - (var(--size-xxl) * 7))` z obrazu w podglądzie.
  Naturalny `max-width: 100%` komponentu pozwala teraz wykorzystać szerokość do
  rozdzielczości źródła.
- Dokowany panel pozostaje następnym wierszem, z dynamicznym budżetem
  `innerHeight - panel.top` oraz `overflow-y: auto` z FIX1. HUD nadal jest
  potomkiem kanwy, a panel jej nie zakrywa.

## Pomiary po zmianie

Repozytoryjny Playwright/Chromium, skala 1×, panel otwarty przez rzeczywisty
klik `page.mouse`/Playwright na przycisku istniejącej anotacji:

| Viewport | Obraz przed | Obraz po | Zmiana szerokości | `panel.bottom` po | `innerHeight` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1280×1000 | 829.266×551.984 | 883.984×588.406 | +6.6% | 999.203 | 1000 |
| 1440×1000 | 829.266×551.984 | 1043.984×694.906 | +25.9% | 667.703 | 1000 |
| 1920×1080 | 949.453×631.984 | 1280×852 | +34.8% | 747.797 | 1080 |

W każdym viewportcie panel zaczyna się pod obrazem i spełnia
`panel.bottom <= innerHeight`. Dla 1440 i 1920 kliknięcie kontrolki anotacji
naturalnie przewija dokument do celu przed pomiarem — tak samo działa ścieżka
operatora i istniejąca sonda FIX1. Sam panel wykorzystuje własne przewijanie,
jeżeli jego naturalna wysokość przekracza aktualny budżet.

## Próby, błędy i korekty sond

1. Dwie nowe sondy komponentu uruchomione przed implementacją dały oczekiwane
   **2 FAIL**, ponieważ przycisku ręki jeszcze nie było; pozostałe 42 testy
   `RegionOverlay` przechodziły.
2. Pierwsza wersja sondy trzech viewportów wymuszała `scrollY=0` już po
   otwarciu panelu. Przy 1920×1080 cofało to naturalny scroll wywołany kliknięciem
   do elementu i sztucznie umieszczało panel poniżej zgięcia. Sondę poprawiono:
   pozycja dokumentu jest zerowana przed zaufanym kliknięciem, a później test
   mierzy to, co rzeczywiście widzi operator.
3. Próba uruchomienia Playwrighta bez repozytoryjnego
   `PLAYWRIGHT_BROWSERS_PATH` trafiła w pusty domyślny cache użytkownika. Ponowne
   uruchomienie z tą samą ścieżką `D:\DatasetFactory\cache\ms-playwright`, której
   używają `bootstrap.ps1` i `check.ps1`, korzystało z zainstalowanego Chromium.

## Preflight przed pełną bramką

- Vitest: **40 plików, 613/613 PASS**.
- Build (`tsc --noEmit` + Vite): PASS; pozostało zastane ostrzeżenie o głównym
  chunku większym niż 500 kB.
- Playwright/Chromium: **8/8 PASS** dla pełnego `visual-qa.spec.ts` oraz nowej
  ścieżki FE-011, w tym wszystkie istniejące sondy `Space` FIX2/FIX3/FIX4.
- Impeccable detector, zakres `layout`, zmienione pliki UI: `[]`, zero
  findingów.
- Screenshot 1440×1000 ograniczony do viewportu, z panelem i aktywnym
  sterowaniem ręką:
  `docs/tickets/FE-011/screenshots/annotations-pan-1440.png`; obejrzany w pełnej
  rozdzielczości. Odświeżony również deterministyczny baseline
  `docs/tickets/FE-001/screenshots/annotations-1440.png`.
