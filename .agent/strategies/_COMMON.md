---
strategy_name: "Punkty wspólne strategii"
version: "1.0"
description: "Punkty 1-2 identyczne dla wszystkich strategii: dobór technologii (Boring Technology) i ocena istniejącego kodu. Plik ładowany punkt po punkcie tak samo jak plik strategii."
---

# 🔗 Punkty wspólne strategii

> Ten plik NIE jest strategią. Zawiera Punkty 1-2, które każda
> strategia wykonuje identycznie — wcześniej były kopiowane
> do każdego pliku strategii i rozjeżdżały się przy edycji.
>
> Kolejność pracy nie zmienia się: agent wykonuje Punkt 1 i Punkt 2
> STĄD, a od Punktu 3 wraca do pliku wybranej strategii.
> Obowiązuje AGENT-03 — jeden punkt naraz, potem "zapomnij".

## Warianty strategii

Fragmenty oznaczone `[TYLKO MODULAR_MONOLITH]` wykonuje wyłącznie
agent pracujący z tą strategią. Wszystko pozostałe obowiązuje
każdą strategię.

Agent MA DOSTĘP przez cały czas do:
- `docs/CONTEXT.md` (kontekst + tabela funkcjonalności)
- `docs/TECH_DEBT.md` (jeśli istnieje)
- Reguł Wytwórczych z PROJECT_GATE.md (moduł: Reguły Wytwórcze)

---

<!-- POINT:1 START -->
## Punkt 1: Dobór Technologii (Boring Technology)

### Wejście
Agent czyta z `docs/CONTEXT.md`:
- P6 (technologie które zna zespół)
- Tabela funkcjonalności (kolumna "Wersja: v1")
- P7 (typ projektu: MVP / Produkt)

### Działanie

**(ID: COMMON-01)** Agent proponuje stos technologiczny
na podstawie P6 (co zespół zna).

Reguły wyboru:

    1. Zespół zna konkretny framework → ZAPROPONUJ TEN FRAMEWORK.
       Nie szukaj lepszego. Boring Technology.

    2. Zespół zna język ale nie framework → zaproponuj
       NAJPOPULARNIEJSZY framework dla tego języka.

    3. Zespół nie ma preferencji → użyj FALLBACK listy poniżej.

**(ID: COMMON-02)** Fallback — gdy P6 nie daje jasnej odpowiedzi:

Agent NIE polega na liście technologii zapisanej w plikach strategii.
Otwiera `.agent/STACK_DEFAULTS.md` i proponuje stack stamtąd,
odpowiedni dla P7 (MVP / Produkt).

Reguła świeżości:

    1. STACK_DEFAULTS.md zawiera datę ostatniego przeglądu.
    2. Jeśli przegląd jest starszy niż 12 miesięcy LUB agent wie,
       że któraś pozycja przestała spełniać kryteria poniżej —
       agent dobiera stack samodzielnie wg kryteriów i sugeruje
       użytkownikowi aktualizację STACK_DEFAULTS.md.
    3. Jeśli plik STACK_DEFAULTS.md nie istnieje — agent dobiera
       stack wg kryteriów i proponuje utworzenie pliku.

Kryteria kwalifikacji technologii (Boring Technology):

    1. Stabilne wydanie — nie beta/RC (PROD-03), obecne na rynku od lat
    2. Duża społeczność i pula programistów (łatwo znaleźć pomoc i ludzi)
    3. Przewidywalny cykl wydań / wsparcie LTS
    4. Dojrzały ekosystem dla typowych potrzeb
       (auth, ORM, kolejki, deploy)
    5. Dopasowanie do problemu (P1), zespołu (P4)
       i typu projektu (P7)

**(ID: COMMON-03)** Agent MUSI uzasadnić KAŻDY wybór technologii
jednym zdaniem. Uzasadnienie MUSI odwoływać się do
kontekstu projektu (P6, P7, tabela funkcjonalności).

**(ID: COMMON-04)** Zakazane wzorce:

    ❌ Resume Driven Development (wybór "bo fajnie wygląda w CV")
    ❌ Hype Driven Development (wybór "bo wszyscy o tym mówią")
    ❌ Framework w wersji beta/RC jako fundament (PROD-03)

Dozwolone wyjątki:

    ✅ Użytkownik explicite chce się uczyć nowej technologii
    ✅ Wymóg biznesowy (klient wymaga konkretnego stacku)

### Checklista

    - [ ] Stos technologiczny wybrany na podstawie P6
    - [ ] Każdy wybór ma uzasadnienie
    - [ ] Żaden wybór nie łamie PROD-02 ani PROD-03
    - [ ] Użytkownik zaakceptował stos

### Wyjście
Agent AKTUALIZUJE `docs/CONTEXT.md` dodając sekcję:

    ## Stos Technologiczny
    - Backend: [wybór] — [uzasadnienie]
    - Frontend: [wybór] — [uzasadnienie]
    - Baza danych: [wybór] — [uzasadnienie]
    - Deploy: [wybór] — [uzasadnienie]

Projekt bez backendu (STRATEGY_MAP, Krok 0B): pozycję "Backend"
zastąp zapisem, skąd biorą się dane (cudze API / BaaS / brak),
a "Baza danych" — decyzją o trwałości po stronie klienta.

### Przejście
Zapomnij ten punkt → załaduj punkt 2 z tego pliku.

<!-- POINT:1 END -->

---

<!-- POINT:2 START -->
## Punkt 2: Ocena Istniejącego Kodu

### Wejście
Agent czyta z `docs/CONTEXT.md`:
- P5 (istniejący kod: Nowy projekt / Istniejący kod)

### Działanie

**(ID: COMMON-05)** Agent sprawdza wartość P5.

**Jeśli P5 = Nowy projekt** → odhacz checklistę, przejdź
do Punktu 3 w pliku wybranej strategii.

**Jeśli P5 = Istniejący kod** → wykonaj poniższą procedurę.

**(ID: COMMON-06)** Rewizja istniejącego kodu:

Kolejność pozyskania wiedzy o kodzie (agent NIE zaczyna
od pytania — pyta o to, czego nie da się odczytać):

    1. Jeśli agent ma dostęp do repozytorium — CZYTA je sam.
       Odczyt (nie modyfikacja) nie łamie AGENT-01.
       Minimum: układ katalogów, plik zależności (package.json /
       pom.xml / requirements.txt / *.csproj), konfiguracja
       uruchomienia, obecność i rodzaj testów, migracje,
       punkty wejścia. Odczyt jest próbkowaniem — agent nie
       ładuje całego repo do kontekstu.
       [TYLKO MODULAR_MONOLITH] Dodatkowo: faktyczne granice
       modułów — kto kogo importuje. To wejście do MMOD-25.
    2. Wynik odczytu agent PRZEDSTAWIA użytkownikowi
       do potwierdzenia lub korekty.
    3. Dopiero czego nie widać w kodzie — pyta:
       punkty bólu, co działa dobrze i nie może być ruszone,
       plany biznesowe wobec starych modułów, historia awarii.
    4. Brak dostępu do repozytorium — agent prosi o opis
       struktury i przechodzi do oceny poniżej.

Agent ocenia:

    1. STRUKTURA — jak zorganizowany jest istniejący kod?
       (foldery, moduły, warstwy, czy jest podział logiczny)

    2. TESTY — czy istnieją testy? Jakie pokrycie?
       (jednostkowe, integracyjne, brak)

    3. ZALEŻNOŚCI — jakie biblioteki/frameworki są używane?
       Czy są aktualne? Czy są martwe?

    4. PUNKTY BÓLU — co użytkownik chce zmienić?
       Co działa dobrze i NIE powinno być ruszane?

**(ID: COMMON-06A)** Twarda reguła odpowiedzialności klas:

Agent NIE uznaje dużej liczby metod ani linii za automatyczny błąd.
Są to sygnały do audytu. Klasa MUSI zostać zaplanowana do podziału,
jeżeli łączy metody zmieniające się z różnych powodów, miesza warstwy
techniczne albo przekracza granice modułów lub warstw.

Każda nowa klasa i każdy refaktor klasy MUSZĄ spełniać poniższe warunki:

    1. Klasa ma jedną nazwaną odpowiedzialność.
    2. Publiczne API jest możliwie wąskie.
    3. Orkiestracja, persistence, reguły domenowe i mapowanie API
       nie są łączone bez jawnego uzasadnienia.
    4. Integracje między modułami przechodzą przez publiczne
       kontrakty i interfejsy — nigdy przez wnętrza.
    5. Spójny algorytm może pozostać w jednej klasie nawet wtedy,
       gdy składa się z wielu prywatnych metod.
    6. Przed naprawą modułu agent tworzy zbiorczą mapę hotspotów dla
       wszystkich klas i serwisów modułu, zamiast odkładać ich ocenę
       na późniejsze audyty wykonywane plik po pliku.
    7. Naprawa modułu NIE jest zakończona, dopóki każdy hotspot
       nie zostanie sklasyfikowany i zamknięty w ramach planu modułu.
    8. Refaktor NIE jest poprawny, jeżeli odpowiedzialności dużej klasy
       zostały jedynie przeniesione do nowego use case'u, koordynatora,
       handlera albo fasady. Po każdej ekstrakcji agent MUSI ponownie
       ocenić wszystkie nowe i istotnie powiększone klasy.
    9. [TYLKO MODULAR_MONOLITH] Gate końcowy MUSI porównać knowledge
       graph przed i po refaktorze oraz potwierdzić, że cienka fasada
       nie deleguje do nowego God Objectu.

Podział ról: agent architektury PLANUJE (mapa hotspotów, klasyfikacja,
kolejność ekstrakcji, wymagane testy zachowania) — punkty 6-9 realizuje
CODING AGENT w ramach ticketów, jako gate zamknięcia naprawy modułu.
Plan bez wskazanego wykonawcy i bez Done Criteria jest niekompletny.

Podczas audytu klas agent stosuje checklistę z
`.agent/guidelines/class-responsibility-review.md`.
[TYLKO MODULAR_MONOLITH] Knowledge graph wskazuje kandydatów
do audytu, ale sam nie stanowi werdyktu architektonicznego.

**(ID: COMMON-06B)** Twarda reguła ograniczenia blast radius przepływów LLM:

Agent traktuje odpowiedź LLM jako niezaufane wejście aż do zakończenia
walidacji. Przepływ AI MUSI rozdzielać przygotowanie wejścia, komunikację z
providerem, parsowanie, walidację schematu, reguły domenowe oraz zapis albo
efekt uboczny. Provider adapter NIE MOŻE zawierać reguł domenowych.

Awaria modelu, providera albo parsera NIE MOŻE bez kontroli zatruwać dalszego
pipeline'u ani uruchamiać efektów ubocznych. Timeouty, retry i fallbacki MUSZĄ
być jawne, ograniczone oraz testowalne. Wyniki wpływające na zapis lub decyzje
domenowe MUSZĄ przechowywać adekwatne provenance: provider, model, wersję
promptu i schematu, wynik walidacji, confidence oraz użyty fallback.

Sandbox albo osobny izolowany runtime jest wymagany dla generowanego kodu,
operacji shell, filesystem, swobodnego dostępu sieciowego i innych ryzykownych
efektów ubocznych. Zwykła inferencja nie uzasadnia wydzielenia — pozostaje
w tej samej aplikacji.

Podczas projektowania i audytu przepływów AI agent stosuje checklistę z
`.agent/guidelines/llm-boundary-review.md`.

**(ID: COMMON-07)** Na podstawie rewizji agent podejmuje decyzję:

**Ścieżka A — Strangler Fig Pattern (DOMYŚLNA):**

    Warunki: Istniejący kod działa, ma jakąkolwiek wartość.

    Procedura:
    1. NIE proponuj przepisania od zera ("Big Bang Rewrite").
    2. Zidentyfikuj granicę (seam) w istniejącym systemie.
    3. Zbuduj NOWY moduł obok starego.
    4. Przekieruj ruch do nowego modułu.
    5. Wyłącz stary moduł.
    6. Powtórz dla kolejnych części.

Agent mapuje funkcjonalności z tabeli (v1) na istniejący kod:

    | Funkcjonalność | Istnieje w starym kodzie? | Akcja |
    |----------------|--------------------------|-------|
    | F01            | Tak — działa dobrze      | Zostaw |
    | F02            | Tak — źle napisane       | Strangler Fig |
    | F03            | Nie                      | Nowy moduł |

**Ścieżka B — Przepisanie:**

    Dozwolone TYLKO gdy WSZYSTKIE warunki spełnione:
    - Stary kod nie ma testów I nie da się ich dodać
    - Technologia jest martwa (brak wsparcia, brak społeczności)
    - Użytkownik explicite chce i rozumie ryzyko

    Agent MUSI zapytać:
    "Przepisanie od zera jest ryzykowne. Stary system działa
     i dostarcza wartość. Czy na pewno chcesz przepisać?
     Ryzyko: [opis]. Alternatywa: Strangler Fig Pattern."

### Checklista

    - [ ] P5 sprawdzone
    - [ ] Jeśli Istniejący kod: repozytorium odczytane (lub odnotowany brak dostępu)
    - [ ] Jeśli Istniejący kod: kod zrewidowany (struktura, testy, zależności, punkty bólu)
    - [ ] Jeśli Istniejący kod: ścieżka wybrana (Strangler Fig / Przepisanie)
    - [ ] Jeśli Istniejący kod: tabela mapowania funkcjonalności na istniejący kod
    - [ ] Użytkownik zaakceptował podejście

### Wyjście
Jeśli Istniejący kod — agent AKTUALIZUJE `docs/CONTEXT.md` dodając sekcję:

    ## Rewizja Istniejącego Kodu

    ### Struktura
    [opis]

    ### Testy
    [opis]

    ### Zależności
    [lista + status]

    ### Punkty Bólu
    [co zmienić]

    ### Podejście
    [Strangler Fig / Przepisanie + uzasadnienie]

    ### Mapowanie Funkcjonalności
    | Funkcjonalność | Istnieje? | Akcja |
    |----------------|-----------|-------|
    | F01            | ...       | ...   |

### Przejście
Zapomnij ten punkt → wróć do pliku wybranej strategii
i załaduj z niego Punkt 3.

<!-- POINT:2 END -->

---

## Mapa dawnych ID

Do wersji zestawu sprzed wydzielenia tego pliku punkty 1-2 miały
osobne ID w każdej strategii. Odwołania historyczne czytaj tak:

| Dawne (PRAGMATIC) | Dawne (MODULAR_MONOLITH) | Obecne |
|---|---|---|
| PRAG-01 | MMOD-01 | COMMON-01 |
| PRAG-02 | MMOD-02 | COMMON-02 |
| PRAG-03 | MMOD-03 | COMMON-03 |
| PRAG-04 | MMOD-04 | COMMON-04 |
| PRAG-05 | MMOD-05 | COMMON-05 |
| PRAG-06 | MMOD-06 | COMMON-06 |
| PRAG-06A | MMOD-06A | COMMON-06A |
| PRAG-06B | MMOD-06B | COMMON-06B |
| PRAG-07 | MMOD-07 | COMMON-07 |

Numeracja punktów 3+ w plikach strategii i ich ID (PRAG-08+,
MMOD-08+) pozostają bez zmian.
