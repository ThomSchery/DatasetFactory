# Aktualizacja domyślnych dokumentów — backport z projektu Highlights AI

> Plik dla człowieka (historia zmian zestawu).
> Agent NIE czyta go w ramach workflow.

Źródło wzbogaceń: `highlights-ai/.agent/guidelines/MODULAR_MONOLITH.md`
(+ pliki towarzyszące `class-responsibility-review.md`,
`llm-boundary-review.md`, `nest-module-composition.md`).

## MODULAR_MONOLITH.md (zaktualizowany)

Przeniesione 1:1 z wersji projektowej, z uogólnieniem odwołań
specyficznych dla repo:

- **MMOD-06A** (Punkt 2) — twarda reguła odpowiedzialności klas:
  liczba metod/linii = sygnał do audytu, nie werdykt; zbiorcza mapa
  hotspotów modułu przed naprawą; zakaz "przenoszenia hotspotu" do
  nowego use case'u/koordynatora/fasady; gate porównujący knowledge
  graph przed i po refaktorze (cienka fasada nie może delegować do
  nowego God Objectu).
- **MMOD-06B** (Punkt 2) — ograniczenie blast radius przepływów LLM:
  odpowiedź modelu = niezaufane wejście do czasu walidacji; rozdział
  etapów (wejście → provider adapter → parsowanie → walidacja schematu
  → reguły domenowe → zapis/efekt); provenance wyników AI; sandbox dla
  ryzykownych efektów ubocznych.
- **MMOD-23A** (Punkt 8) — kompozycja rejestracji modułu (DI)
  projektowana OD RAZU: root tylko warstwa aplikacyjna (~6–16
  rejestracji), podmoduły per podkatalog funkcjonalny, wydzielona
  jednostka kontraktowa (access/) jako jedyna powierzchnia importu,
  podmoduł sam importuje swoje zależności. Zakaz "god module"
  (doświadczenie: moduły z 50+ rejestracjami zawsze wymagały
  kosztownego rozbicia).
- **MMOD-26A** (Punkt 9) — porty i tokeny DI: nazwana stała tokenu obok
  interfejsu; rejestracja klasa + alias (useExisting-style, bez drugiej
  instancji); eksport = świadoma decyzja z konsumentem, martwe eksporty
  usuwane od razu; kontrakty między modułami wyłącznie przez jednostkę
  kontraktową.
- **Punkt 14** — rozszerzona lista zakazanych kompromisów: god module,
  stringowe tokeny DI, martwe eksporty, import wnętrza innej domeny
  z pominięciem access-modułu, sekrety w kodzie, endpoint bez jawnej
  decyzji o uprawnieniach, DTO bez walidacji, niezweryfikowana nowa
  zależność.
- **Punkt 14** — nowy gate weryfikacyjny: DI smoke test (kompilacja
  pełnego grafu DI z atrapami zasobów zewnętrznych; tworzony razem
  z pierwszym modułem — tsc i unit testy nie wykrywają błędów wiringu).
- Zaktualizowane checklisty Punktów 8, 9.

Uogólnienia względem wersji projektowej:

- Odwołania do checklist wskazują `.agent/guidelines/...`.
- Odwołanie do repo-lokalnego `nest-module-composition.md` zastąpione
  regułą: agent tworzy `[framework]-module-composition.md` dla wybranego
  stacku razem z pierwszym modułem.

## PRAGMATIC.md (zaktualizowany; poprawiona nazwa z PRAGMATRIC.md)

Przeniesione tylko elementy niezależne od architektury modularnego
monolitu:

- **PRAG-06A / PRAG-06B** (Punkt 2) — odpowiedniki MMOD-06A/06B
  (odpowiedzialność klas + blast radius LLM), z odwołaniami do tych
  samych checklist.
- **Punkt 6 (PRAG-18)** — zakazane kompromisy rozszerzone o: sekrety
  w kodzie, endpoint bez decyzji o uprawnieniach, wejście bez
  walidacji, niezweryfikowana zależność; oraz warunkowy gate DI smoke
  test (jeśli stack używa kontenera DI).

Świadomie NIE przeniesiono MMOD-23A/26A (struktura podmodułów DI,
access-moduły) — zakładają strukturę modułową, której strategia
Pragmatyczna (warstwy IDesign) nie definiuje.

## Nowe pliki towarzyszące (dołączyć do zestawu domyślnego)

- **class-responsibility-review.md** — checklista audytu
  odpowiedzialności klas i interpretacji knowledge graph; klasyfikacja
  Healthy / Review / Split required; gate zakończenia naprawy modułu;
  zakaz przenoszenia hotspotu. Przykłady z projektu zastąpione
  generycznymi archetypami.
- **llm-boundary-review.md** — checklista granic przepływów LLM:
  podział etapów, provenance, izolacja wykonawcza, wymagane testy
  (odpowiedź poprawna / uszkodzona / odrzucona domenowo / timeout /
  fallback / brak efektów ubocznych bez walidacji). Przykłady z projektu
  zastąpione generycznymi archetypami.

Sugerowane docelowe położenie: `.agent/guidelines/`.

## Nieprzeniesione (specyficzne dla projektu)

- `nest-module-composition.md` — konkretna składnia NestJS; w zestawie
  domyślnym zastąpione regułą tworzenia odpowiednika per framework
  (MMOD-23A).
- `main.md`, `lessons_learned.md`, `known-tradeoffs.md`, plany, audyty,
  branch sandboxy — artefakty per-projekt, nie szablony.

## Aktualizacja 2: de-hardcoding technologii

- **PRAG-02 / MMOD-02** — usunięte zaszyte listy fallback stacków.
  W ich miejsce: odwołanie do `.agent/STACK_DEFAULTS.md`, reguła
  świeżości (>12 mies. lub utrata kryteriów → agent dobiera sam
  i sugeruje aktualizację pliku) oraz kryteria kwalifikacji
  Boring Technology (stabilność, społeczność, LTS, ekosystem,
  dopasowanie do P1/P4/P7).
- **STACK_DEFAULTS.md (nowy)** — jedyne miejsce z technologiami
  z nazwy: datowany, z changelogiem przeglądów i lustrzanymi
  kryteriami kwalifikacji.

## Aktualizacja 3: spójność pipeline'u (finalna paczka)

- **BACKEND_GATE.md v1.2:**
  - PATH-12 nie dobiera już stacku — jawnie deleguje do Punktu 1
    strategii; usunięta sekcja "Stack Technologiczny" z szablonu
    PATH-10 (koniec dwóch sekcji o stacku w CONTEXT.md).
  - CTX-06: P6 = wyłącznie znajomość/preferencje zespołu,
    nigdy nie nadpisywane finalnym stackiem.
  - CTX-06B (nowe): pytanie o horyzont rozwoju → P9
    (Jednorazowy prototyp / Krótko / Długoterminowo);
    P9 dodane do szablonu CONTEXT.md.
  - PATH-07: korekta P9 — jednorazowy prototyp zawsze = MVP.
  - HANDOFF-01: poprawiona nazwa pliku Playbooka; kontekst P1-P9.
- **STRATEGY_MAP.md v1.3:** warning_when i Krok 2b oparte o P9
  zamiast hipotetycznego pytania; not_for MODULAR_MONOLITH
  odwołuje się do P9; kompatybilność podniesiona do GATE v1.2+.
- **AI_Architecture_Agent_Playbook.md:** Blok 0 czyta też P9
  (jedyna zmiana; reszta bez modyfikacji).
- Finalna struktura paczki: strategie w `strategies/`,
  checklisty w `guidelines/`.

## Aktualizacja 4: rozszerzenie frontendowe

- **frontend-decisions-checklist.md (nowy)** — FE-01..FE-11:
  framework (React domyślnie, niekoniecznie), client/server state,
  routing, formularze, konwencje stanów UI, responsywność, a11y,
  struktura folderów (mapowanie na moduły backendu), testy,
  zakaz wołania providerów AI z przeglądarki. Stosowana w Fazie 1
  Playbooka; decyzje trafiają do docs/CONTEXT.md.
- **frontend-design-workflow.md (nowy)** — bootstrap łańcucha
  design systemu (adaptacja skilla z Highlights); plik wytycznych
  UI/UX v3 LINKOWANY (utrzymywany w jednym miejscu u użytkownika,
  agent pyta o ścieżkę); sekcja adaptacji dla stacków innych niż
  React+Tailwind.
- **new-component.TEMPLATE.md (nowy)** — uniwersalne twarde reguły
  (reużywalność, obowiązkowy Design Plan) + pusty katalog
  i definicje komponentów do wypełniania per projekt.
- **react-coding-standards.md (nowy)** — zgenerycyzowane standardy
  z Highlights, powiązane z decyzjami FE-02/03/06.
- **BOOTSTRAP.md** — dodana sekcja "Ścieżka frontendowa"
  z dopiskiem do promptu startowego.

## Aktualizacja 5

- **AI_Architecture_Agent_Playbook.md** — Faza 1: twarde wpięcie
  frontend-decisions-checklist.md (gdy tabela funkcjonalności
  zawiera UI), niezależne od promptu startowego.

## Aktualizacja 6

- **_agent_oriented_guidelines_final_UI_UX_v3.md** dołączony do
  guidelines/ (kopia 1:1 z Highlights; plik niezmienny,
  wersjonowany w nazwie).
- **frontend-design-workflow.md** — wymaganie wstępne: agent
  najpierw szuka pliku w guidelines/, pyta o ścieżkę tylko gdy brak.

## Aktualizacja 7: spójność i domknięcie luk

- **nfr-checklist.md (nowy)** — NFR-01..07: auth/uprawnienia
  (model całościowy), dane osobowe/retencja, backup (RPO/RTO),
  obserwowalność, wydajność/wolumeny, limity, zgodność branżowa.
  Wpięta na stałe w Fazę 1 Playbooka.
- **BACKEND_GATE PROD-02** — usunięta sprzeczność z PATH-12:
  stack dobiera WYŁĄCZNIE Punkt 1 strategii; PROD-02 definiuje
  teraz zasady doboru, nie wykonawcę.
- **Playbook** — Faza 1: jeden blok checklist (NFR zawsze,
  FE gdy UI); Faza 5 Agent Philosophy: "Tech Debt Ledger" —
  coding agent utrzymuje docs/TECH_DEBT.md (plik:linia).
- **MMOD-38** — wybór In-Memory = obowiązkowy wpis do TECH_DEBT
  z triggerem (symetrycznie do MMOD-31).
- **FE-01** — jawna reguła zamknięcia: framework z "Stos
  Technologiczny" nie jest ponownie otwierany.
- **BOOTSTRAP** — reguła 6 z wyjątkiem (new-component.md itp.);
  jawny wykonawca bootstrapu designu = coding agent (usuwa
  konflikt z zakazem kodu w Playbooku); usunięta nieaktualna
  prośba o ścieżkę UI/UX v3 (plik jest w paczce).
- **frontend-design-workflow.md** — nagłówek WYKONAWCA: coding
  agent przez ticket FE-SETUP.
- **Strategie** — komentarze MAINTENANCE/SYNC przy zduplikowanych
  Punktach 1-2 (dla opiekuna zestawu); wersje w frontmatter:
  MODULAR_MONOLITH 2.0, PRAGMATIC 1.1; checklisty i guideline'y
  frontendowe: 1.0.

## Aktualizacja 8

- **README.md (nowy)** — mapa zestawu: oś czasu (człowiek → GATE →
  strategia → Playbook → coding agent), tabele odpowiedzialności
  wszystkich plików, 3 punkty wpięcia frontendu, uzasadnienie
  braku FRONTEND_GATE (jeden kontekst = jeden gate).
- **BOOTSTRAP.md** — odsyłacz do README.

## Aktualizacja 9

- **README.md** — legenda (pliki dostarczone vs artefakty tworzone
  w docs/) + tabela artefaktów z regułami wymuszającymi ich
  utworzenie (CTX-07, PATH-10/11, STRAT-04, sekcje Wyjście
  strategii, tabela artefaktów Playbooka) i wyjaśnieniem mechanizmu
  pamięci.

## Aktualizacja 10: zmiana nazwy bramy

- **BACKEND_GATE.md → PROJECT_GATE.md** (v1.3) — nazwa odzwierciedla
  faktyczną rolę: brama CAŁEGO projektu (kontekst, funkcjonalności,
  wybór strategii); backendowe są strategie, nie brama.
  Zaktualizowane wszystkie odwołania: STRATEGY_MAP (v1.4,
  kompatybilność v1.3+), Playbook, BOOTSTRAP, README, strategie,
  nfr-checklist. Wcześniejsze wpisy w tym changelogu odwołują się
  do starej nazwy — historycznie poprawnie.

## Aktualizacja 11: naprawa sprzeczności wewnętrznych (audyt 2026-07)

Siedem miejsc, w których zestaw przeczył sam sobie i agent musiałby
zgadywać. Bez zmian w metodzie — tylko domknięcie spójności.

- **Playbook, Blok 0 / Faza 4** — opis tabeli funkcjonalności
  zgodny z PATH-10 (ID, Nazwa, Typ użytkownika, Wersja,
  Implementacja, Uproszczenie, Koszt odkręcenia, Ryzyko).
  Usunięte odwołania do nieistniejącej kolumny „Priorytet";
  kolejność ticketów opiera się teraz na kolumnie „Wersja".
- **Playbook, Faza 4** — dodany OBOWIĄZKOWY ticket **FE-SETUP**
  (cel, wejście, Done Criteria wg KROK 5 frontend-design-workflow).
  Wcześniej ticket istniał wyłącznie w README — projekt z UI
  dostawał tickety bez bootstrapu design systemu.
- **Playbook, Faza 5, punkt 8 (nowy)** — „Gate'y wykonawcze":
  DI smoke test, gate odpowiedzialności klas, gate granic AI.
  Playbook wpisuje je do Done Criteria ticketów.
- **PRAG-18 / MMOD-43** — DI smoke test przestał być czynnością
  agenta architektury („uruchamia") i jest wymogiem przekazywanym
  coding agentowi. Na etapie strategii nie istnieje jeszcze kod,
  a AGENT-01 zabrania jego pisania.
- **PRAG-06A / MMOD-06A + class-responsibility-review.md +
  llm-boundary-review.md** — jawny podział ról: architekt PLANUJE
  (mapa hotspotów, klasyfikacja, kolejność ekstrakcji), coding agent
  WYKONUJE gate'y i testy jako warunek zamknięcia ticketu.
- **MMOD-23A** — guideline kompozycji modułów
  (`[framework]-module-composition.md`) tworzy coding agent
  z ticketu, nie agent architektury (zawiera przykłady kodu).
  Wyjątek dopisany do BOOTSTRAP reguła 6 i legendy README.
- **STRATEGY_MAP** — „Krok 1.5 Korekta Istniejącego Kodu"
  przemianowany na **Krok 0** i przeniesiony PRZED filtrowanie:
  korekta zmienia P8, a filtrowanie działa na P8. Skorygowane P8
  zapisywane do CONTEXT.md i obowiązujące do Kroku 2b.
- **P8 = „Srednia" → „Średnia"** w PROJECT_GATE i STRATEGY_MAP
  (7 miejsc). Dopisana reguła w PATH-08: P7/P8 to słowa kluczowe
  porównywane dosłownie — bez synonimów i wariantów fleksyjnych.
- **REDIR-02** — moduł HANDOFF-01 i reguła REDIR-03 pozostają
  w kontekście po przejściu do strategii; wcześniej instrukcja
  przekazania do Playbooka mogła zostać usunięta z kontekstu.

Nienaprawione w tej aktualizacji (zamknięte w Aktualizacji 12):
ścieżka ticketów, wznowienie w Playbooku, migracje/środowiska/CI-CD,
projekt bez backendu, klasyfikacja P7, czytanie repo.

## Aktualizacja 12: domknięcie luk 8-13 (audyt 2026-07)

Sześć miejsc, w których agent nie miał instrukcji i musiałby
zgadywać. Nadal bez zmian w metodzie — dokładanie brakujących
rozstrzygnięć.

- **Playbook — nazwane pliki artefaktów.** Faza 2 ma teraz kolumnę
  "Plik": docs/EPIC_BRIEF.md, CORE_FLOWS.md, TECH_PLAN.md,
  SCALE.md. Faza 4: `docs/tickets/[ID].md` + `docs/tickets/INDEX.md`
  (ID, tytuł, status szkic/gotowy, zależności, gate; aktualizowany
  po KAŻDYM ticketcie). Faza 5: pakiet handoff zapisywany jako
  `docs/HANDOFF.md`, nie tylko wypowiadany w czacie.
  Nazwy są WIĄŻĄCE — po nich kolejna sesja rozpoznaje postęp.
- **Playbook, Blok 0 — KROK 3B (nowy): wznowienie pracy Playbooka.**
  Tabela artefakt → faza (kiedy faza jest domknięta) + procedura
  ustalenia pierwszej pozycji bez wyniku. KROK 2 zna teraz pliki
  Playbooka i nie bierze ich za artefakty strategii. KROK 4
  raportuje postęp faz i ticketów.
- **BOOTSTRAP, Prompt 2** — rozwidlenie przy wznowieniu:
  wznawiasz strategię czy Playbooka (wg obecności jego plików).
- **nfr-checklist.md → v1.1** — NFR-08 środowiska i konfiguracja
  (skąd sekrety, czym różnią się środowiska), NFR-09 migracje
  i dane startowe (narzędzie, odwracalność, kto uruchamia,
  dane istniejące, migracje per schemat modułu przy MMOD-35),
  NFR-10 uruchomienie lokalne jedną komendą i bramka jakości
  (co uruchamia CI, co człowiek). Migracje dopisane do zakresu
  Tech Planu.
- **STRATEGY_MAP — Krok 0B: projekt bez backendu.** Aplikacja
  czysto kliencka nie idzie już do CUSTOM_WORKFLOW: PRAGMATIC
  z adaptacją (przy P8 = Wysoka — MODULAR_MONOLITH bez Punktu 12).
  **PRAGMATIC, Punkt 4** — sekcja "Adaptacja: projekt bez backendu":
  mapowanie warstw IDesign na nośniki klienckie, granica zaufania
  na kliencie, sekrety, trwałość danych w przeglądarce.
- **PATH-07 — klasyfikacja P7 na wielu sygnałach.** Sam brak listy
  "później" nie czyni projektu Produktem: P9 = Prototyp/Krótko →
  MVP; wstępny "Produkt" wymaga potwierdzenia 2 z 5 sygnałów
  (horyzont, liczba typów użytkowników, użytkownicy zewnętrzni,
  budżet w miesiącach, funkcjonalność o konsekwencjach
  biznesowych). Zawyżony Produkt = cięższy stack i cięższa
  strategia.
- **PRAG-06 / MMOD-06 — agent najpierw CZYTA repozytorium**, potem
  przedstawia wynik do korekty, a pyta wyłącznie o to, czego w
  kodzie nie widać (punkty bólu, plany, historia awarii). Odczyt
  nie łamie AGENT-01. MMOD-06 dodatkowo czyta faktyczne granice
  modułów (kto kogo importuje — wejście do MMOD-25.)

Nienaprawione w tej aktualizacji (zamknięte w Aktualizacji 13):
duplikat Punktów 1-2, BORDER-04, LSPACE-06/07.

## Aktualizacja 13: koniec duplikatu Punktów 1-2 (audyt 2026-07)

- **strategies/_COMMON.md (nowy)** — Punkt 1 (Dobór Technologii)
  i Punkt 2 (Ocena Istniejącego Kodu) w JEDNYM miejscu, zamiast
  ~250 linii kopii w każdej strategii pilnowanej komentarzem
  MAINTENANCE. Kopie zdążyły się rozjechać: PRAG-06A pkt 4 mówił
  "przez interfejsy", MMOD-06A "przez publiczne kontrakty";
  MMOD-06A miał pkt 9 (gate knowledge graph), PRAG-06A nie miał.
  Warianty rozwiązane znacznikiem `[TYLKO MODULAR_MONOLITH]`
  wewnątrz pliku — nie kopią pliku.
- **Nowe ID: COMMON-01..07 (+06A, 06B)** zastępują PRAG-01..07
  i MMOD-01..07. Mapa dawnych ID jest w stopce _COMMON.md.
  ID punktów 3+ (PRAG-08+, MMOD-08+) bez zmian.
- **AGENT-03 i REDIR-01** opisują teraz pracę z dwoma plikami:
  _COMMON.md (punkty 1-2), potem plik strategii (punkty 3+).
  Zasada "punkt po punkcie" bez zmian.
- **STACK_DEFAULTS, README** — odwołania przepięte na
  _COMMON.md; oś czasu README rozbita na ETAP 2a / 2b.
- **frontend-design-workflow.md, KROK 1** — poprawione odwołanie
  dla `letterSpacing`: wartości tokenów wynikają z LSPACE-02/03/09
  (domyślna wartość czcionki, bezpieczny zakres, limit palety),
  a LSPACE-06/07 to algorytmy zastosowania (ściskanie nagłówków,
  rozstrzelanie all-caps) — wcześniej cytowane jako wartości.

- **_agent_oriented_guidelines_final_UI_UX_v3.md** — dopisana na końcu
  sekcja "Errata redakcyjna" (dopisek opiekuna zestawu, jawnie
  oznaczony jako NIE-wytyczna; żadna reguła nie zmieniona):
  brakujące ID BORDER-04 (nieużywane — nie uzupełniamy zmyśloną regułą
  i nie przenumerowujemy, bo zerwałoby odwołania), zgubione przy
  konwersji nagłówki podsekcji ("B. Obramowanie" zaczyna się od
  `#### 3.`, "Nakładki" od `#### 2.`, "Odstępy Między Akapitami"
  przeskakuje 1 → 3, dwa puste nagłówki na końcu "Casing"),
  oraz ciąg `!!!!!!!!!!` z materiału źródłowego.
  Lukę BORDER-04 zamknie dopiero ewentualna wersja v4.
- **frontend-design-workflow.md** — nota o erracie przy wymaganiu
  wstępnym: agent pomija ją przy Design Planie.
