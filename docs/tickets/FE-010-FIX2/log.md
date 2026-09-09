# FE-010-FIX2 — log implementacji

## Zakres i przyczyna

Fixup obejmuje wyłącznie cykl klawisza `Space` w `RegionOverlay`. FIX1
rozstrzygał gotowość do panu i anulowanie natywnego zachowania na podstawie
bieżącego położenia wskaźnika podczas `keydown`. To rozdzieliło dwie decyzje:
`Space` mógł rozpocząć pan po późniejszym wejściu na kanwę, mimo że jego
`keydown` nie został anulowany, albo mógł zostać anulowany nad kanwą bez
jakiegokolwiek panu.

Naprawa ma rozstrzygać anulowanie dopiero na `keyup`, na podstawie zapisanego
faktu rozpoczęcia gestu `Space` + LMB. Bez panu przeglądarka zachowuje pełną
natywną obsługę aktywnego przycisku. Nie zmieniamy `WeakSet<Event>` dla
outside-dismiss, geometrii, wysokości panelu ani obsługi kółka.

## Design Plan

### Elementy interfejsu i stosowane wytyczne

| Element | Decyzja | Moduły / ID UI/UX |
| --- | --- | --- |
| Powierzchnia `RegionOverlay` | `Space` nadal sygnalizuje gotowość do panu i z LMB rozpoczyna istniejący gest. Informacja, że bieżące naciśnięcie `Space` zostało użyte do panu, jest zapisywana przy rzeczywistym `pointerdown` gestu i konsumowana na odpowiadającym `keyup`. Bez zmian wizualnych, hit-testingu i mapowania współrzędnych. | UI & Visuals: `OVERLAY-06`, `COLOR-07`; Typography: `OPACITY-02` |
| `Button` „Usuń” w dokowanym panelu anotacji | Gdy `Space` posłużył do panu, `keyup` jest anulowany i nie może uruchomić destrukcyjnej natywnej aktywacji. Panel, anotacja i liczba żądań pozostają bez zmian. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| `Button` „Dopasuj kanwę do widoku” („Resetuj zoom”) | Gdy nie wystąpił pan, `keydown` i `keyup Space` pozostają natywne nawet przy wskaźniku nad kanwą, więc przycisk resetuje zoom z klawiatury. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |
| Pozostałe przyciski dokowanego panelu | Ten sam kontrakt natywnej aktywacji bez panu; bez zmian callbacków, copy, focus ringów i stanów disabled. | UI & Visuals: `COLOR-07`; Typography: `OPACITY-02`; katalog komponentów `new-component.md`, sekcje 4–5 |

### Obowiązkowa checklista

- [x] **Layout/Siatka:** brak zmian layoutu i spacingu; istniejące tokeny
  `--size-*` pozostają nietknięte.
- [x] **Typografia:** brak zmian `fontSize`, `lineHeight`, `fontWeight` i copy.
- [x] **Kolory:** brak nowych kolorów i zmian stanów wizualnych; istniejący
  kontrakt interakcji `COLOR-07` pozostaje bez zmian.
- [x] **Obramowania:** brak zmian obrysów, szerokości i promieni.
- [x] **Cienie:** brak nowych warstw i cieni.
- [x] **Interakcje:** `Space` bez panu pozostaje natywny; `Space` użyty do panu
  anuluje wyłącznie kończący go `keyup`. Niewidoczne warstwy nadal nie blokują
  wskaźnika (`OVERLAY-06`), a wygląd pressed/disabled nadal wynika z istniejących
  tokenów (`COLOR-07`, `OPACITY-02`).
- [x] **Komponenty:** zmiana pozostaje wewnątrz istniejącego `RegionOverlay` i
  reużywa istniejący `Button`; nie powstaje nowy komponent ani inline control.

## Plan regresji

- Vitest `RegionOverlay`: osobno natywne `Space` na reset zoomu bez panu oraz
  anulowanie `keyup` po `Space` + LMB; dodatkowo zabezpieczenie powtórzeń
  `keydown`, aby nie zgubiły faktu użycia klawisza do panu.
- Vitest ekranu anotacji: pełna kolejność z findingu z fokusem na „Usuń”,
  wejściem wskaźnika na kanwę po `keydown`, panem i zerem żądań `DELETE`;
  osobny przycisk panelu zachowuje natywną aktywację bez panu.
- Chromium: obie sondy recenzenta uruchomione osobno i raportowane z liczbą
  żądań mutujących; ponowna weryfikacja dziewięciu zachowań FE-009.
- Pełna bramka `scripts/check.ps1`: jeden nieprzerwany przebieg 9/9, zero SKIP.

## Implementacja

- `RegionOverlay` przechowuje osobno stan fizycznie trzymanego `Space` oraz
  fakt, że właśnie to naciśnięcie zostało użyte do rozpoczęcia panu LMB.
- `keydown Space` nie jest już anulowany na podstawie chwilowego położenia
  wskaźnika. Nadal ustawia gotowość do panu i lokalny stan kursora, ale pozwala
  przeglądarce zachować natywny cykl aktywnego przycisku.
- `pointerdown` zapisuje użycie `Space` tylko dla `Space` + LMB. Middle-pan nie
  jest przypisywany do klawisza i istniejący marker `WeakSet<Event>` pozostaje
  bez zmian.
- `keyup Space` odczytuje zapisany fakt użycia do panu, czyści oba stany i
  wywołuje `preventDefault()` wyłącznie po takim geście. Powtórzony `keydown`
  z auto-repeat nie zeruje flagi przed odpowiadającym `keyup`.
- `blur` czyści stan bez próby anulowania nieistniejącego zdarzenia. Nie
  zmieniono panelu, kółka, geometrii ani żadnych styli.

## Próby, błędy i korekty sond

1. Dwa testy komponentu uruchomione przed implementacją dały oczekiwane FAIL:
   `keyup` po panie był dozwolony, a `keydown` bez panu nad kanwą był anulowany.
2. Pierwsza wersja sondy ekranowej użyła deskryptora user-event `{Space>}`.
   Oznacza on logiczny klawisz o nazwie `Space`, a nie fizyczny kod `Space`, więc
   guard go nie rozpoznał i zwykły pointerdown zamknął panel. Sondę skorygowano
   do `[Space>]` / `[/Space]`; kod produktu nie wymagał zmiany z tego powodu.
3. Po implementacji i korekcie sondy dwa docelowe pliki Vitest zakończyły się
   wynikiem **61/61 PASS**. Typecheck oraz rozszerzony pakiet pięciu plików
   FE-009/FE-010 zakończyły się **129/129 PASS**.
4. Impeccable detector dla zakresu `layout` i zmienionych plików zwrócił zero
   findingów.

## Sondy Chromium FE-010-FIX2

Obie strony konfliktu zostały sprawdzone w jednym dedykowanym scenariuszu
Chromium, ale z osobnymi asercjami i osobnym zliczeniem żądań `DELETE`:

1. **„Usuń” → `keydown Space` poza kanwą → wejście → pan → `keyup`:** transform
   kadru zmienił się, panel pozostał otwarty, jedna anotacja nadal była w DOM,
   liczba `DELETE /annotations/ann-1` wyniosła **0**.
2. **„Dopasuj kanwę do widoku” → wskaźnik nad kanwą → samo `Space`:** zoom
   zmienił się z **125% do 100%**, a liczba `DELETE /annotations/ann-1`
   pozostała **0**. Natywna aktywacja przycisku działa bez panu.

Dedykowany przebieg sondy: **1/1 PASS**. Ta sama sonda weszła następnie do
pełnego zestawu E2E i przeszła ponownie.

## Regresje FE-009 — potwierdzone zachowania

Pełny suite zachował wszystkie dziewięć niezmienników z ticketu bazowego:

1. outside-dismiss nie zjada tego samego gestu rozpoczynającego nowy bbox;
2. klik, drag i resize własnego bboxa nie zamykają panelu;
3. `Escape` pozostaje nieobsłużony;
4. `Enter` w pustym, zautofokusowanym filtrze nie wybiera klasy i nie zapisuje;
5. panel remountuje się tylko po zmianie anotacji, nie po reselect/refetchu;
6. błąd zapisu zachowuje lokalny draft;
7. strzałki wysyłają zero PATCH, a `Enter` dokładnie jeden z bieżącą wersją;
8. baseline gestu jest izolowany między anotacjami i epokami wyboru;
9. panel pozostaje zadokowany pod obrazem i nie przykrywa kanwy.

## Pełna bramka

Jeden nieprzerwany przebieg
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check.ps1`
zakończył się **PASS — 9/9 bramek, 0 SKIP**:

- backend format, lint i mypy: PASS;
- backend: **347/347 testów**;
- frontend typy: PASS;
- frontend: **40/40 plików, 607/607 testów**;
- build produkcyjny: PASS; jedyne ostrzeżenie dotyczy istniejącego głównego
  chunka powyżej 500 kB;
- Chromium E2E: **7/7 scenariuszy**;
- bezpieczeństwo katalogu roboczego E2E: **2/2 testy**.
