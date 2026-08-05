# Kontekst Projektu

> Artefakt bramki `.agent/PROJECT_GATE.md`. Sekcje P1–P9 pochodzą z modułu
> „Zbieranie Kontekstu" (CTX-01 … CTX-07). Sekcje „Ścieżki Użytkownika",
> „Funkcjonalności", „Typ Projektu" i „Złożoność Biznesowa" dodał moduł
> „Ścieżki i Funkcjonalności" (PATH-10) po akceptacji użytkownika 2026-07-30.

## Problem Biznesowy

[P1] Budowanie datasetów treningowych z własnych nagrań gameplay jest dziś
ręczne: każda klatka wymaga narysowania boksów i przypisania klas. Koszt rośnie
liniowo z liczbą klatek, a błędy w etykietach trafiają do modelu bez kontroli.

DatasetFactory zamienia ten koszt na jednorazowy opis HUD-u danej gry. Profil
gry — regiony HUD i klasy, łącznie z liczbami ujemnymi oraz odczytami
specyficznymi dla gry (health, armour) — sprawia, że każde kolejne nagranie tej
samej gry da się etykietować bez powtarzania pracy. Znaki (`-`, `/`, `0–9`, `A–Z`)
dostają osobne boksy, więc model generalizuje na liczby, których nie widział.

## Użytkownicy Końcowi

[P2] Jeden typ użytkownika:

- **Autor datasetu (solo)** — buduje własny dataset treningowy z własnych
  nagrań. Pracuje sam, zwykle wieczorem, na tym samym monitorze, na którym gra.
  Nie jest zespołem etykietującym, nie ma zmian ani roli recenzenta. Sesja
  kończy się, kiedy on tak zdecyduje.

Drugi odbiorca nie został potwierdzony.

## Budżet Czasowy

[P3] Miesiące. Brak presji terminu — pełny pipeline z SAM 3 mieści się
w horyzoncie, ale zakres v1 jest celowo węższy (patrz „Zakres v1" niżej).

## Zespół

[P4] 1 osoba.

Konsekwencja z `STACK_DEFAULTS.md` (korekta wg P4): nawet gdyby klasyfikacja
wskazała „Produkt", stack dobieramy z sekcji MVP. Ciężki stack bez zespołu,
który go utrzyma, to dług operacyjny od dnia 1.

## Istniejący Kod

[P5] **Nowy projekt** — repozytorium `DatasetFactory` nie zawiera jeszcze kodu
aplikacji. Istnieją natomiast artefakty, które wiążą implementację:

| Artefakt | Rola |
|----------|------|
| `PRODUCT.md` | prawda produktowa: 5 ekranów, 5 etapów pipeline'u, rodziny klas, język interfejsu |
| `DESIGN.md` | zapisany kontrakt kierunku „Signal Rack" — **nadpisany** decyzją o baseline'ie (patrz niżej) |
| `designs/baseline-impeccable/` | wyekstrahowany baseline `Home — Impeccable`: HTML, CSS, tokeny, inwentarz klas |
| `designs/glass-control/` | alternatywny run designu, render-QA `blocked` — nie jest baseline'em v1 |
| `.agent/` | wytyczne wytwórcze, standardy React, checklisty NFR i frontendu |

Zewnętrzne, nieobjęte tym repozytorium:

- `D:\my\Projects\Instatic` — laboratorium designu (źródło baseline'u w `.tmp/dev.db`).
- `highlights-ai` — osobny projekt autora. Ponownie używamy z niego **wyłącznie
  znajomości stacku frontendu**, nie kodu; kod vision/OCR nie jest przenoszony.

## Technologie

[P6] Znajomość i preferencje autora (zapis, nie finalny stack):

- Frontend: Vite + React + Tailwind — znane z `highlights-ai`, preferowane.
- TypeScript — język pierwszego wyboru dla warstwy aplikacyjnej.
- Python — preferowany dla warstwy przetwarzania wideo, OCR i SAM 3
  (dojrzałe biblioteki: ffmpeg, silniki OCR, modele segmentacji).
- NestJS — znany z `highlights-ai`, ale oceniony jako cięższy niż potrzebny
  dla jednoosobowego MVP.

Twarde wymagania narzucone z zewnątrz: brak.

Uwaga do baseline'u: `designs/baseline-impeccable/page.css` to czysty CSS na
tokenach `--df-*` / `--color-*`, nie Tailwind. Sposób przeniesienia tokenów do
warstwy frontendu rozstrzyga Punkt 1 wybranej strategii, nie ten plik (PATH-12).

Finalny stack zapisze sekcja „Stos Technologiczny", tworzona przez strategię.
Ten plik jej nie uprzedza (PROD-02).

## Horyzont Rozwoju

[P9] **Jednorazowy prototyp** — po v1 brak planu dalszego rozwoju. Narzędzie ma
wyprodukować dataset, nie stać się produktem.

Konsekwencja z PATH-07 (reguła 1): P7 = `MVP` bezwarunkowo, niezależnie od
budżetu liczonego w miesiącach.

## Decyzje Wiążące Przed Bramką

Rozstrzygnięte przez użytkownika 2026-07-30, przed modułem „Ścieżki
i Funkcjonalności":

| Decyzja | Treść | Skutek |
|---------|-------|--------|
| Baseline wizualny | `Home — Impeccable` | Nadpisuje kontrakt „Signal Rack" z `DESIGN.md`. `PRODUCT.md` nazywał warianty Impeccable/Console „incumbent evidence, explicitly not authority" — ta klauzula zostaje świadomie uchylona dla v1. |
| Zakres v1 | Jeden pionowy przepływ: profil gry → import wideo → klatki → podgląd anotacji | Pozostałe ekrany istnieją jako destynacje nawigacji, bez pełnej funkcjonalności. |
| Proces | Pełne przejście `PROJECT_GATE` przed kodem | Kod powstaje z ticketów, nie z rozmowy (AGENT-01). |

Utrzymane bez zmian z `PRODUCT.md`:

- Nawigacja zawiera dokładnie: Dashboard, Profile gier, Materiały, Anotacje, Eksporty.
- Pipeline ma pięć nazwanych etapów w kolejności: Próbkowanie → Regiony HUD →
  OCR → SAM 3 → Weryfikacja.
- Nic nie opuszcza narzędzia bez weryfikacji człowieka.
- Modele działają lokalnie; stan GPU jest widoczny w interfejsie.
- Język interfejsu: polski; terminy techniczne (OCR, SAM 3, HUD, nazwy klas)
  pozostają angielskie.
- Wartości demonstracyjne muszą być oznaczone jako ilustracyjne.

## Ścieżki Użytkownika

### Autor datasetu (solo)

Otwiera aplikację → tworzy profil gry (klatka referencyjna → regiony HUD →
klasy: `-`, `/`, `0–9`, `A–Z`, `health`, `armour`, klasy per gra) → importuje nagranie
`MP4`/`MKV`/`MOV` i wybiera profil oraz interwał próbkowania → aplikacja próbkuje
klatki → wycina regiony HUD → uruchamia OCR (znaki, boksy, confidence) → autor
ogląda podgląd anotacji na klatce → koryguje klasę, usuwa boks, poprawia jego
geometrię albo dorysowuje brakujący → akceptuje albo odrzuca klatkę → w razie
potrzeby wraca do odrzuconej klatki i otwiera ją ponownie → eksportuje
zaakceptowane klatki jako `COCO JSON`.

Etap `SAM 3` jest w tej ścieżce widoczny jako stan pipeline'u, ale jego
implementacja jest poza v1.

## Funkcjonalności

Tabela zaakceptowana przez użytkownika 2026-07-30. **Wiążąca na cały projekt.**
Agent realizuje te ustalenia i nie pyta ponownie o uproszczenia (PROD-05).
Pełne uzasadnienia, koszty odkręcenia i ryzyka: artefakt bramki
„DatasetFactory — bramka MVP: ścieżki i funkcjonalności".

| ID | Nazwa | Typ użytkownika | Wersja | Implementacja | Uproszczenie | Koszt odkręcenia | Ryzyko |
|----|-------|-----------------|--------|---------------|--------------|------------------|--------|
| F01 | Utworzenie profilu gry | Autor datasetu | v1 | uproszczona | Regiony na jednej klatce referencyjnej, profil bez wersjonowania | ~1 dzień, 2–3 pliki | Inna rozdzielczość nagrania = przesunięte regiony |
| F03 | Import nagrania | Autor datasetu | v1 | uproszczona | Ścieżka do pliku lokalnego, bez uploadu | ~0.5 dnia, 1 plik | Przeniesienie pliku psuje projekt |
| F04 | Próbkowanie klatek | Autor datasetu | v1 | uproszczona | Stały interwał `ffmpeg`, domyślnie 1 fps | ~1 dzień, 1 plik | Duplikaty klatek w datasecie |
| F05 | Wycięcie regionów HUD | Autor datasetu | v1 | pełna | — | — | — |
| F06 | OCR regionów | Autor datasetu | v1 | uproszczona | Wymienialny moduł `OcrEngine`; Tesseract tylko eksperymentalny adapter, wybór silnika produkcyjnego odroczony | ~3–7 dni na benchmark/adapter | Niska trafność może zwiększyć odrzuty; adapter musi być jawnie oznaczony jako experimental |
| F07 | Mapowanie znaków na klasy | Autor datasetu | v1 | pełna | Bazowy alfabet obejmuje `-`, `/`, `0–9`, `A–Z` | — | — |
| F08 | Ekran weryfikacji | Autor datasetu | v1 | pełna | Korekta klasy, usunięcie boksu, rysowanie nowych i zmiana geometrii istniejących; odrzuconą klatkę można otworzyć ponownie | — | — |
| F11 | Eksport `COCO JSON` | Autor datasetu | v1 | uproszczona | Jeden plik, bez podziału train/val | ~0.5 dnia, 1 plik | Podział datasetu poza narzędziem |
| F12 | Dashboard | Autor datasetu | v1 | uproszczona | Stan bieżącej sesji i GPU, bez historii | ~1 dzień, 1–2 pliki | Brak trendu jakości między sesjami |
| F13 | Materiały | Autor datasetu | v1 | pełna | — | — | — |
| F14 | Stan pipeline'u | Autor datasetu | v1 | uproszczona | Progres odpytywany cyklicznie, bez strumienia zdarzeń | ~1 dzień, 2 pliki | Opóźniony obraz stanu |
| F15 | Trwałość projektu | Autor datasetu | v1 | uproszczona | Lokalny `SQLite`, jeden projekt naraz | ~1 dzień, 1–2 pliki | Utrata pliku bazy = utrata sesji |
| F16 | Powłoka interfejsu | Autor datasetu | v1 | uproszczona | Tokeny i klasy `.df-*` jako zwykły CSS, bez portu na Tailwind | ~1–2 dni, warstwa stylów | Rozjazd z późniejszymi iteracjami designu |
| F02 | Lista i edycja profili gier | Autor datasetu | później | — | — | — | — |
| F09 | Ręczne boksy ikon HUD | Autor datasetu | v1 | uproszczona | Rysowanie i zmiana geometrii boksu w dowolnym miejscu klatki; bez wieloboków i masek | ~2 dni, backend + edytor | Ręczna praca rośnie, gdy OCR jest słaby |
| F10 | SAM 3 — maski i tracking | Autor datasetu | później | — | — | — | — |

## Typ Projektu (wyliczony)

[P7] **MVP**

Sygnały, które zdecydowały:

- Istnieje lista „później" (F02, F10) → wstępnie `MVP`. F09 został wciągnięty do
  v1 decyzją z 2026-08-04, gdy okazało się, że przy `quality_gate=failed`
  Tesseracta brak ręcznego boksu wymusza odrzucanie całych klatek razem z ich
  poprawnymi odczytami.
- P9 = `Jednorazowy prototyp` → reguła 1 z PATH-07 wymusza `MVP` bezwarunkowo,
  niezależnie od budżetu liczonego w miesiącach.
- P4 = 1 osoba → korekta wg `STACK_DEFAULTS.md` i tak kieruje na stack MVP.

Zaakceptowane przez użytkownika 2026-07-30.

## Złożoność Biznesowa (wyliczona)

[P8] **Średnia**

Za wyższą oceną: proces pięcioetapowy z zależnościami między etapami, integracja
z lokalnymi modelami (OCR, później SAM 3), przetwarzanie długotrwałe wymagające
raportowania stanu.

Za niższą: jeden typ użytkownika, brak integracji z systemami zewnętrznymi, brak
płatności i danych osób trzecich, awaria bez konsekwencji biznesowych — koszt
błędu to powtórzenie etykietowania.

Zaakceptowane przez użytkownika 2026-07-30.

## Wybrana Strategia

**Pragmatyczna** (`.agent/strategies/PRAGMATIC.md`, wersja 1.2).

Strategia została zaakceptowana przez użytkownika 2026-07-30. Wybrano ją,
ponieważ projekt jest jednoosobowym, jednorazowym MVP o średniej złożoności,
a jego funkcjonalności tworzą jeden pionowy proces. Strategia Modularnego
Monolitu została odrzucona przez jej regułę `not_for` dla jednorazowego
prototypu i zespołu jednoosobowego.

## Stos Technologiczny

Stack zaakceptowany przez użytkownika 2026-07-30 zgodnie z Punktem 1 strategii
Pragmatycznej (Boring Technology):

- **Frontend:** React + Vite + TypeScript — zespół zna ten zestaw (P6), a dla
  jednoosobowego MVP daje prosty development i statyczny build bez frameworka
  serwerowego. Baseline `Home — Impeccable` pozostaje zwykłym CSS na tokenach,
  zgodnie z F16; Tailwind nie wchodzi do v1.
- **Backend lokalny:** Python 3.12 + FastAPI — Python jest preferowany dla
  wideo/OCR (P6), a FastAPI jest dojrzałym, lekkim punktem HTTP dla lokalnego
  procesu i kontraktów API.
- **Trwałość:** SQLite + SQLAlchemy 2 + Alembic — F15 wymaga jednej lokalnej
  bazy; ten zestaw zachowuje prostotę SQLite i jawne migracje schematu.
- **Wideo i obraz:** systemowy FFmpeg + OpenCV — FFmpeg realizuje stałe
  próbkowanie F04, a OpenCV wycinanie i przygotowanie regionów HUD dla F05/F06.
- **OCR:** wymienialny interfejs `OcrEngine` z natywnymi boksami pojedynczych
  znaków. Tesseract pozostaje eksperymentalnym adapterem dev/spike po negatywnym
  Gate 2 (93,22% char accuracy, 7/11 exact, minimum IoU 0); nie jest zatwierdzonym silnikiem
  produkcyjnym. Wybór docelowego adaptera jest TD-014.
- **Testy:** pytest po stronie Python oraz Vitest + Testing Library po stronie
  React — lekkie, dojrzałe narzędzia zgodne z wybranymi ekosystemami.
- **Uruchomienie:** dwa procesy w development (`Vite` i `FastAPI`), natomiast
  lokalny build SPA jest obsługiwany przez FastAPI; brak chmury, kontenerów i
  osobnego serwera produkcyjnego dla jednorazowego prototypu (P9).

### Lokalizacja zależności i danych roboczych

- środowisko Python: `D:\my\Projects\DatasetFactory\.venv\`,
- zależności frontendowe: `D:\my\Projects\DatasetFactory\node_modules\`,
- cache pip, cache modeli oraz checkpointy OCR/SAM 3: katalogi na `D:`,
- Tesseract OCR: instalacja lub dystrybucja portable na `D:`,
- interpreter bazowy pozostaje w istniejącym `C:\Python312`; nie instalujemy
  tam bibliotek projektu.

### Rewizja OCR po Gate 2 (2026-07-30)

- Użytkownik zaakceptował wydzielony moduł `OcrEngine` i odroczył wybór
  docelowego silnika do czasu reprezentatywnego benchmarku.
- TK-004 używa Tesseract wyłącznie jako adaptera `experimental`; API, persistence
  i późniejszy UI muszą ujawniać `engine_id`, wersję/hashy, `quality_gate=failed`
  oraz ostrzeżenie, że wynik wymaga pełnej ręcznej weryfikacji.
- Obecna portable binarka na `D:` jest zaakceptowana wyłącznie do lokalnych
  spike'ów/dev. Nie może wejść do packaged v1 bez weryfikowalnego artefaktu.
- `/` jest klasą bazową F07, nie separatorem ignorowanym ani tylko metadanymi.

## NFR — Decyzje

| ID | Decyzja | Wybór | Uzasadnienie / trigger |
|----|---------|-------|------------------------|
| NFR-01 | Uwierzytelnianie i uprawnienia | Brak auth; API nasłuchuje wyłącznie na `127.0.0.1`; wszystkie endpointy jawnie `local-public` | Jeden właściciel na jednym komputerze, bez kont i ról. Bind do interfejsu innego niż loopback wymaga wprowadzenia auth przed uruchomieniem. |
| NFR-02 | Dane osobowe i retencja | Brak celowo zbieranych danych osobowych; ścieżki, klatki i OCR pozostają lokalnie do ręcznego usunięcia projektu | Narzędzie nie wysyła telemetrii ani materiałów poza komputer. Nagranie może przypadkowo zawierać nicki — traktujemy je jak zawartość pliku użytkownika, bez indeksowania ponad OCR wybranych regionów. |
| NFR-03 | Backup i odzyskiwanie | Brak automatycznego backupu v1; stan runu i każdej klatki w SQLite pozwala wznowić od ostatniej ukończonej klatki | RPO dla awarii procesu: najwyżej aktualnie przetwarzana klatka; RTO: ponowne uruchomienie aplikacji. Utrata katalogu projektu oznacza utratę sesji (TD-011). |
| NFR-04 | Obserwowalność | Strukturalne logi plikowe z `request_id`, `run_id`, etapem i numerem klatki; błąd pipeline'u widoczny w UI; rotacja po rozmiarze | Lokalny prototyp nie potrzebuje zewnętrznego alertingu/tracingu. Logi nie zawierają cropów, pełnego OCR ani ścieżek w formie niezanonimizowanej. |
| NFR-05 | Wydajność i wolumen | 1 użytkownik, 1 aktywny run, materiał do 2 h / 50 GB; przy 1 fps do 7200 klatek | Przetwarzanie i zapis są przyrostowe; lista klatek jest stronicowana, obrazy nie są ładowane zbiorczo do RAM. Trigger @SCALE: drugi równoległy run lub >7200 klatek. |
| NFR-06 | Limity i ochrona | Brak rate limitingu HTTP; tylko jeden aktywny run; walidacja rozszerzenia, istnienia pliku, czasu ≤2 h i rozmiaru ≤50 GB; kontrola wolnego miejsca przed startem | Loopback i jeden użytkownik eliminują nadużycia sieciowe; blokada runu chroni CPU/GPU/dysk. Brak miejsca zatrzymuje run kontrolowanym błędem bez usuwania checkpointu. |
| NFR-07 | Zgodność branżowa | Nie dotyczy | Narzędzie do własnych datasetów nie jest systemem medycznym, finansowym ani skierowanym do dzieci. |
| NFR-08 | Środowiska i konfiguracja | Dwa tryby lokalne: development i packaged-local; konfiguracja z `.env`/zmiennych środowiskowych oraz wersjonowanego `.env.example`; brak sekretów | P9 wyklucza staging/chmurę. Ścieżki Tesseract, FFmpeg, workspace i cache są jawnie konfigurowalne na `D:`. |
| NFR-09 | Migracje i dane startowe | Alembic; każda zmiana modelu zawiera migrację `upgrade` i `downgrade`; migracje uruchamiane przed startem backendu; brak seedów wymaganych do działania | Nowy projekt nie ma danych legacy. Bazowy alfabet tworzony deterministycznie przez engine, nie seed bazy. |
| NFR-10 | Uruchamianie i pipeline jakości | Jedna komenda PowerShell uruchamia development i sprawdza wymagania; lokalny gate: format/lint/typecheck/test/build + smoke test composition root; brak CI w v1 | Jednoosobowy prototyp nie uzasadnia hostowanego CI; pierwszy współpracownik lub pierwsza publikacja repo jest triggerem TD-012. |

### Zachowanie długotrwałego runu

- Statusy runu: `queued → running → review_ready → completed`; kontrolowane
  odgałęzienia: `paused`, `failed`, `cancelled`.
- Status klatki: `pending → sampled → cropped → ocr_complete → review_pending →
  accepted/rejected`; przejścia są monotoniczne poza jawnym ponowieniem etapu.
- Restart zamienia osierocony `running` na `paused` i wznawia od pierwszej
  nieukończonej klatki po jawnej kontroli artefaktów na dysku.
- Ponowienie jest idempotentne dla `(run_id, frame_index, stage)`; nie tworzy
  duplikatów klatek ani anotacji.
- Anulowanie kończy aktualną operację subprocess, zachowuje checkpoint i może
  zostać wznowione jako nowa próba tego samego runu.

## Frontend — Decyzje

| ID | Decyzja | Wybór | Uzasadnienie |
|----|---------|-------|--------------|
| FE-01 | Framework | React + Vite + TypeScript | Zamknięte w stacku; technologia znana autorowi. |
| FE-02 | Stan aplikacji | Lokalny stan komponentów; Context tylko dla bieżącego projektu i preferencji UI | Brak globalnego store na zapas; trwały/server state nie jest duplikowany w Context. |
| FE-03 | Stan serwera | TanStack Query; zwykłe query/mutation oraz polling aktywnego runu co 2 s, zatrzymany w stanach terminalnych | F14 jawnie wybrał polling; query cache centralizuje invalidację po mutacjach. |
| FE-04 | Routing | React Router; trasy `/`, `/profiles/new`, `/materials`, `/annotations/:runId`, `/exports`; pozostałe destynacje mają jawny empty state | Brak tras chronionych (NFR-01). `runId` w URL umożliwia deep-link po restarcie przeglądarki. |
| FE-05 | Formularze i walidacja | React Hook Form + Zod; ten sam kontrakt walidowany niezależnie przez Pydantic w API | Formularz profilu i importu mają geometrię/liczne ograniczenia; ręczne kontrolowanie zwiększa ryzyko rozjazdu. |
| FE-06 | Stany UI | Wspólne wzorce `Loading`, `Empty`, `InlineError`, `FatalError`, `Progress`; mutacje blokują przycisk i pokazują spinner; brak optimistic update dla pipeline/anotacji | Operacje zmieniają trwały dataset i muszą najpierw zostać potwierdzone przez backend. |
| FE-07 | Responsywność | Desktop-first, minimalna szerokość robocza 1280 px; przy węższym oknie komunikat o niewspieranym edytorze zamiast ściskania canvasu | Użytkownik pracuje na monitorze gamingowym; precyzyjna weryfikacja boksów nie jest użyteczna na telefonie. Mobile nie jest planowany. |
| FE-08 | Dostępność | Minimum obowiązkowe: semantyka, klawiatura, focus, kontrast i hit areas; bez deklaracji pełnego WCAG AA w v1 | Lokalny prototyp solo; brak pełnego audytu czytników ekranu jest zapisany jako TD-013. |
| FE-09 | Struktura folderów | Feature-based (`dashboard`, `profiles`, `materials`, `annotations`, `exports`) + `common` + generowany `api` | Odzwierciedla nawigację i utrzymuje komponenty wspólne poza feature'ami. |
| FE-10 | Testy | Vitest/Testing Library dla logiki i krytycznych interakcji + jeden Playwright e2e pionowego przepływu na fixture wideo/OCR stub | Testujemy ścieżkę v1, nie wszystkie warianty; e2e jednocześnie weryfikuje baseline i routing. |
| FE-11 | AI/ML z frontendu | Frontend nigdy nie wywołuje Tesseract ani późniejszego SAM 3; wyłącznie lokalne API FastAPI; brak streamingu, polling | Modele i filesystem pozostają po stronie backendu; OCR nie jest LLM, ale jego wynik nadal jest niezaufany. |
