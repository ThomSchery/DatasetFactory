# FE-016 — log wykonania

## Zakres

- Część A: zmiana nazwy klasy z ekranu profilu, z CAS przez `expected_version`, wspólną walidacją i zachowaniem istniejących anotacji.
- Część B: dodatkowy wariant `roboflow_coco`; domyślny `coco` zachowuje dotychczasowy format bajt w bajt.
- Poza zakresem: skalowanie obrazów, README Roboflow, zmiany próbkowania/OCR, zmiany zapisu anotacji i układu FE-014/FE-015.

## Decyzje implementacyjne

- Wariant API: `format: "coco" | "roboflow_coco"`, domyślnie `coco`.
- Domyślny podział Roboflow: `train=0.8`, `valid=0.1`, `test=0.1`, z domyślnym ziarnem `0`.
- Przy co najmniej trzech klatkach każda część dostaje najpierw jedną klatkę, a reszta jest rozdzielana proporcjonalnie metodą największych reszt. Przy jednej lub dwóch klatkach zapełniane są kolejno `train`, potem `valid`; `test` pozostaje pusty. Dzięki temu mały dataset nie duplikuje klatek i jasno pokazuje ograniczenie danych.
- Podział jest liczony po klatkach. Stabilny porządek wejścia jest mieszany na podstawie SHA-256 ziarna i identyfikatora klatki, więc wszystkie anotacje klatki zawsze trafiają do tej samej części.
- Nazwa obrazu Roboflow zawiera pełny identyfikator runu i klatki bez myślników oraz indeks klatki. Identyfikatory bazy są unikalne, wynik jest deterministyczny i spełnia walidację ścieżek COCO.
- Dokument Roboflow zawiera `info` jako minimalny obiekt z opisem formatu oraz puste `licenses`. Nie dodajemy `date_captured`, licencji ani innych metadanych, których DatasetFactory nie zna.
- Zmiana rodzaju klasy jest pokazana przed zapisem jako stałe ostrzeżenie w edytowanym wierszu, z nazwami obu grup. Osobny komunikat wyjaśnia, że ukończone eksporty są niezmienne.

## Design Plan (przed kodem UI)

Elementy interfejsu:

1. Lista klas profilu: nazwa, badge grupy, akcja „Zmień nazwę”.
2. Edycja wiersza: `TextField`, podgląd docelowej grupy, ostrzeżenie o zmianie grupy, akcje „Zapisz” i „Anuluj”, błąd konfliktu/wersji przy polu.
3. Trwały `Notice` nad listą klas o niezmienności ukończonych eksportów.
4. Formularz startu eksportu: `SelectField` wariantu, pola proporcji i ziarna widoczne tylko dla Roboflow, opis struktury katalogów i przycisk startu.
5. Status i manifest eksportu: nazwa wybranego wariantu, podział oraz ziarno z manifestu.

Moduły i ID wytycznych UI/UX:

- [ ] Layout/Siatka: `GRID-01/02/05/09/10/12`, `SPACING-01/02/03/04/06/08/09/10/13`; wyłącznie `--size-*`, kontrolki co najmniej 32 px, tekst do `--measure-copy`, powiązane pola bliżej siebie niż sąsiednie sekcje.
- [ ] Typografia: `TYPO-02..11`, `FONTSIZE-02..10`, `LHEIGHT-09/10/11`, `LSPACE-02/03/09`, `TYPO-15/16/17`, `CASING-02`; nazwy klas i identyfikatory w istniejącej hierarchii, tekst formularzy `--font-size-sm` + `--line-height-standard`, etykiety w sentence case.
- [ ] Kolory: `COLOR-01..10`; istniejące tokeny powierzchni/tekstu, `warning` tylko dla zmiany grupy, `error` dla błędu zapisu, znaczenie zawsze także w tekście.
- [ ] Obramowania: `BORDER-01/02/03/05/06/08`, `BWIDTH-01/02/03/06/10/11`, `RADIUS-02/03/05`; `stroke-strong` dla kontrolek i fokusu, `stroke-weak` dla struktury, bez nowych arbitralnych wartości.
- [ ] Cienie: `SHADOW-01/02/03`; brak nowej warstwy unoszonej, więc pozostaje istniejące `--shadow-elevation-low` paneli.
- [ ] Interakcje: `COLOR-07`, `OPACITY-01/02`, `TYPO-18/19/20`; stany hover/active/disabled dziedziczone z `Button`, `TextField`, `SelectField`; blokada podwójnego zapisu i startu podczas mutacji.
- [ ] Komponenty: używamy gotowych `Button`, `TextField`, `SelectField`, `StatusBadge`, `Notice`, `Panel`, `InlineError`; bez nowych elementów `<button>`, `<input>` ani `<select>` inline.

## Sondy i wyniki

### Falsyfikacja zachowania anotacji przy zmianie nazwy

1. Plik `backend/app/access/store/repositories/profiles.py` skopiowano przez `Copy-Item`; SHA-256 kopii i oryginału: `F7F5AF…`.
2. Tymczasowo wprowadzono błąd usuwający anotacje powiązane ze zmienianą kategorią.
3. Test zachowania identyfikatora kategorii nie przeszedł dokładnie na asercji `annotation_category_ids == {seed.alternate_category_id}`: wynik był pustym zbiorem.
4. Plik odtworzono przez `Copy-Item`; SHA-256 wrócił do `F7F5AF…`, a test przeszedł.

### Falsyfikacja determinizmu i rozdzielności splitów

1. Plik `backend/app/managers/workflow/export_use_cases.py` skopiowano przez `Copy-Item`; SHA-256 kopii i oryginału: `0756DE…`.
2. Usunięcie ziarna z funkcji przydziału spowodowało oczekiwaną porażkę asercji `changed_ids != first_ids`.
3. Wyzerowanie przesunięć identyfikatorów między częściami spowodowało oczekiwaną porażkę testu rozdzielności: 6 identyfikatorów wobec 4 unikalnych.
4. Plik odtworzono przez `Copy-Item`; SHA-256 wrócił do `0756DE…`, a oba testy przeszły.

### Zgodność schematu z Roboflow v8

Porównano dokument z `CocoExportEngine.build_roboflow` z plikiem:

`D:\my\Projects\Highlights\highlights-ai\ml\datasets\quake_champions\Quake Champions.v8.coco\test\_annotations.coco.json`

| Poziom | Klucze wspólne | Różnice | Typy wartości |
| --- | --- | --- | --- |
| Dokument | `annotations`, `categories`, `images`, `info`, `licenses` | brak | zgodne |
| Kategoria | `id`, `name`, `supercategory` | brak | zgodne: `int`, `str`, `str` |
| Obraz | `id`, `license`, `file_name`, `height`, `width` | v8 dodatkowo ma `date_captured` i `extra`; DatasetFactory celowo ich nie zmyśla | typy wspólnych pól zgodne |
| Anotacja | `id`, `image_id`, `category_id`, `bbox`, `iscrowd`, `area`, `segmentation` | brak | zgodne |

`bbox` w v8 zawiera elementy `int` i `float`. Silnik zachowuje liczby zmiennoprzecinkowe wejścia; sonda z `x=188.5` wygenerowała `bbox` z typami `float` i `int`.

### Testy przed pełną bramką

- Backend, testy profilu/COCO/reconciliation: `78 passed`.
- Frontend, pełny Vitest: `677 passed`.
- Frontend, `npm run build`: PASS.
- Testy UI obejmują ostrzeżenie o zmianie grupy przed zapisem, konflikt nazwy, dokładny kontrakt POST Roboflow, walidację sumy proporcji oraz manifest trzech części.

### Commity

- `990c24d feat(profiles): rename categories safely`
- `4b5d774 feat(exports): add Roboflow COCO variant`
- `1421439 feat(frontend): configure Roboflow exports and rename classes`
- `b5851fc test(exports): complete blocking COCO builder`
- `dbe5e05 test(e2e): follow generic export action label`

### Pełna bramka i kontrola wizualna

Końcowy, nieprzerwany przebieg:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\t.wisniewski\.traycer\worktrees\thomschery__datasetfactory\feat-fe-016-roboflow-export-and-rename\scripts\check.ps1`

| Bramka | Wynik |
| --- | --- |
| backend format | PASS |
| backend lint | PASS |
| backend typy | PASS |
| backend testy | PASS, 370/370 |
| frontend typy | PASS |
| frontend testy | PASS, 677/677 |
| frontend build | PASS |
| E2E | PASS, 19/19 |
| E2E root safety | PASS, 2/2 |

Wynik: **9/9 PASS, zero SKIP**.

E2E ponownie zapisał dwa istniejące zrzuty. Pomiar RGB wykazał:

- `error-1440.png`: znany dryf 9 pikseli, bbox `(312,95)–(315,101)`, maksymalna delta 1;
- `exports-1440.png`: 3639 pikseli, bbox `(918,292)–(1229,340)`, maksymalna delta 216 — rzeczywista zmiana copy akcji eksportu.

Oba pliki odtworzono z HEAD przez `Copy-Item`; odświeżeń zrzutów nie dołączono do zmian.

Próba kontroli przez Browser na działającym lokalnym frontendzie nie mogła wybrać przeglądarki: runtime zwrócił pustą listę `available browsers: []`. Repozytoryjne E2E Chromium przeszło 19/19 i obejmuje viewporty 1440×1000 oraz 1920×1080, a nowe stany mają testy interakcji i dostępności. Nie zapisano osobnych nowych zrzutów profilu i formularza Roboflow, więc nie oznaczamy tej części jako wykonanej kontroli manualnej.

Po kontroli zatrzymano serwer frontendowy. Porty 8000, 5173 i 5174 są wolne.

## Kontrola wizualna FE-016

Lukę domyka `frontend/e2e/fe016-visual-qa.spec.ts` — repozytoryjny Playwright, wzorem `fe015-visual-qa.spec.ts`. Spec zapisuje cztery zrzuty bez `fullPage` do `docs/tickets/FE-016/screenshots/`: `profile-rename-*` i `export-variant-*` w 1440×1000 oraz 1920×1080.

### Co widać na zrzutach

`profile-rename-1440x1000.png` i `profile-rename-1920x1080.png`: edytowany wiersz klasy `7` z wpisaną nazwą `osiem`. Nad listą klas stały `Notice` „Ukończone eksporty pozostają niezmienne” z treścią o tym, że zmiana obejmie wyłącznie przyszłe eksporty. Pod polem tekstowym ostrzeżenie `warning` „Klasa zmieni grupę” z pełnym zdaniem „Po zapisaniu klasa przejdzie z «Znaki (OCR)» do «Pola HUD (gra)»”. Akcje „Zapisz nazwę” i „Anuluj” wyrównane do prawej krawędzi wiersza, w całości w viewporcie. Układ poprawny w obu rozdzielczościach; szerszy viewport rozciąga panel, a tekst pozostaje na `--measure-copy`.

`export-variant-1440x1000.png` i `export-variant-1920x1080.png`: panel „Nowy eksport” z wariantem `Roboflow COCO — train / valid / test`, trzema polami proporcji `80 / 10 / 10` w jednym rzędzie oraz polem „Ziarno podziału” w rzędzie niższym. Przycisk „Uruchom eksport” w obrębie panelu.

### Znalezisko: pole ziarna wypadało z rzędu proporcji

Pierwszy przebieg pokazał realny błąd układu, którego nie widziała żadna asercja funkcjonalna: cztery pola dzieliły jeden rząd `repeat(4, …)`, a ponieważ tylko „Ziarno podziału” ma tekst pomocniczy, jego `input` lądował **72 px** poniżej pozostałych trzech. Widoczne w obu viewportach.

Poprawka jest lokalna dla ekranu eksportu — `Field` jest wspólny dla FE-014 i FE-015 i nie został ruszony. Trzy proporcje tworzą własny rząd `.df-exports__split-ratios`, ziarno stoi pod nimi.

### Falsyfikacja asercji geometrycznej

1. `frontend/src/features/exports/ExportsScreen.css` skopiowano przez `Copy-Item`; SHA-256: `996BA4…BF1F`.
2. Przywrócono poprzedni układ (`display: contents` na rzędzie proporcji, `repeat(4, …)` na kontenerze), czyli dokładnie stan sprzed poprawki.
3. **Pierwsza wersja asercji przeszła.** Porównywała wyłącznie trzy pola proporcji między sobą, a te pozostają wyrównane także w zepsutym układzie — asercja nie widziała właśnie tego błędu, dla którego powstała.
4. Asercję wzmocniono: pola, których etykiety zaczynają się w jednym rzędzie, muszą mieć `input` w jednym rzędzie. Probe na tym samym zepsutym układzie padł dokładnie na `„Train (%)” and „Ziarno podziału” start on one row but their inputs do not at 1440x1000`, `Expected: <= 1`, `Received: 72`.
5. Plik odtworzono przez `Copy-Item`; SHA-256 wrócił do `996BA4…BF1F`, a spec przeszedł.

### Bramka po dołożeniu specu

Jeden nieprzerwany przebieg `scripts/check.ps1`: **9/9 PASS**, `skipped 0`. Backend 370/370, frontend 677/677, build PASS, E2E **20/20** (nowy spec), root safety PASS.

Cztery zrzuty FE-016 wygenerowane przez bramkę są bajt w bajt identyczne z zacommitowanymi — `git status` ich nie pokazał.

Bramka odświeżyła dwa zrzuty FE-001. Pomiar RGB wobec HEAD:

| Plik | Piksele | Bbox | Maks. delta | Rozstrzygnięcie |
| --- | --- | --- | --- | --- |
| `error-1440.png` | 9 | `(312,95)–(315,101)` | 1 | znany dryf |
| `exports-1440.png` | 3639 | `(918,292)–(1229,340)` | 216 | realna zmiana: akcja nazywa się teraz „Skonfiguruj nowy eksport”, a zrzut FE-001 pokazuje „Uruchom nowy eksport” |

`error-1440.png` odtworzono przez `Copy-Item` z blobu HEAD — dryfu nie commitujemy.

`exports-1440.png` odświeżono jawnym commitem dokumentacyjnym `b71e515`, wzorem `83d60ec` (FE-012) i `d50d407` (FE-015): zmiana etykiety jest skutkiem FE-016, więc zrzut starszego ticketu przestałby odpowiadać interfejsowi. Region zweryfikowano wzrokowo — przycisk pokazuje „Skonfiguruj nowy eksport”.

### Uwaga poza zakresem FE-016

Pole z `width="short"` i tekstem pomocniczym łamie etykietę i opis na `12ch`, bo `.df-field--short` ogranicza cały `Field`, nie samą kontrolkę. Dotyczy to tak samo istniejącego „Interwał próbkowania (ms)” w `RunLaunchForm` (widoczne w `docs/tickets/FE-001/screenshots/materials-1440.png`). Zachowano zgodność z istniejącym wzorcem; zmiana `Field` dotknęłaby FE-014 i FE-015, więc to materiał na osobny ticket.
