---
strategy_name: "Modularny Monolit"
version: "2.1"
description: "Architektura modułowa z wyraźnymi granicami kontekstów. DDD + Event Storming."
---

# 🧱 Strategia Modularny Monolit

> **Źródło:** Materiały o Modularnym Monolicie, DDD, Event Storming
>
> **Zasady tej strategii:**
> - GRANICE MODUŁÓW SĄ ŚWIĘTE — moduł A nie sięga do wnętrzności modułu B.
> - CRUD GDZIE MOŻNA, DDD GDZIE TRZEBA — nie każdy moduł wymaga pełnego DDD.
> - EVENTUAL CONSISTENCY — między modułami nie ma transakcji, są zdarzenia.
> - BUDUJ TAK JAKBYŚ MÓGŁ WYCIĄĆ — ale nie wycinaj bez powodu.

---

## Jak agent pracuje z tym plikiem

    1. Wykonaj Punkty 1-2 z .agent/strategies/_COMMON.md
       (punkt po punkcie, tak samo jak niżej).
    2. Wróć tutaj i załaduj TYLKO punkt nr 3.
    3. Wykonaj go. Odhacz checklistę.
    4. Zapomnij punkt 3.
    5. Załaduj punkt nr 4.
    6. Powtarzaj aż do ostatniego punktu (14).

Agent MA DOSTĘP przez cały czas do:
- `docs/CONTEXT.md` (kontekst + tabela funkcjonalności)
- `docs/TECH_DEBT.md` (jeśli istnieje)
- Reguł Wytwórczych z PROJECT_GATE.md (moduł: Reguły Wytwórcze)

---

<!-- POINTS:1-2 — WYDZIELONE -->
## Punkty 1-2: wspólne dla wszystkich strategii

Punkt 1 (Dobór Technologii — Boring Technology) i Punkt 2
(Ocena Istniejącego Kodu) są identyczne dla każdej strategii
i mieszkają w jednym pliku:

    .agent/strategies/_COMMON.md

Wykonaj je STAMTĄD — punkt po punkcie, wg AGENT-03 — a następnie
wróć tutaj i załaduj Punkt 3.

Fragmenty oznaczone w tamtym pliku `[TYLKO MODULAR_MONOLITH]` WYKONAJ — dotyczą tej strategii.

Wyjścia tych punktów (sekcje "Stos Technologiczny" i "Rewizja
Istniejącego Kodu" w docs/CONTEXT.md) są wejściem dla Punktu 3.

---

<!-- POINT:3 START -->
## Punkt 3: Event Storming — Big Picture

### Wejście
Agent czyta z `docs/CONTEXT.md`:
- Ścieżki użytkownika
- Tabela funkcjonalności (v1)
- P2 (typy użytkowników)

### Działanie

> Cel: Odkryć WSZYSTKIE zdarzenia zachodzące w systemie
> i ułożyć je w chronologiczną oś czasu.
>
> Zdarzenie domenowe (Domain Event) to fakt który już się wydarzył,
> zapisany w czasie przeszłym, np. ZamówienieZłożone, BiletOpłacony.

**(ID: MMOD-08)** Agent przeprowadza rozmowę z użytkownikiem
używając poniższych pytań. Agent przechodzi przez KAŻDĄ
ścieżkę użytkownika z `docs/CONTEXT.md`.

Pytania odkrywające zdarzenia:

    1. "Opisz krok po kroku co się dzieje gdy użytkownik [główna akcja]."
    2. "Co się dzieje ZARAZ POTEM?"
    3. "Co może pójść NIE TAK w tym kroku?"
    4. "Czy ktoś powinien zostać POWIADOMIONY o tym zdarzeniu?"
    5. "Czy jest coś co musi się wydarzyć ZANIM to będzie możliwe?"
    6. "Czy jest wersja tego procesu dla innego typu użytkownika?"

Agent powtarza pytania dla KAŻDEGO głównego procesu biznesowego.

**(ID: MMOD-09)** Agent zapisuje zdarzenia w formie tabeli:

    | # | Zdarzenie | Aktor | Wyzwalacz | Następne zdarzenie |
    |---|-----------|-------|-----------|--------------------|
    | 1 | KontoUtworzono | Użytkownik | Formularz rejestracji | EmailWeryfikacyjnyWysłano |
    | 2 | EmailWeryfikacyjnyWysłano | System | KontoUtworzono | KontoZweryfikowano |
    | 3 | ZamówienieZłożone | Klient | Przycisk "Zamów" | PłatnośćRozpoczęta |

**(ID: MMOD-10)** Hotspoty — podczas odkrywania zdarzeń
agent oznacza miejsca niejasne lub ryzykowne:

    🔥 HOTSPOT — miejsce wymagające doprecyzowania
    
    Przykłady:
    - "Nie wiem jak działa naliczanie rabatów" → 🔥
    - "Tu mogą być wyjątki od reguły" → 🔥
    - "Klient jeszcze nie zdecydował jak to ma działać" → 🔥

Każdy hotspot agent MUSI zgłosić użytkownikowi
zanim przejdzie do następnego punktu.

### Checklista

    - [ ] Wszystkie ścieżki użytkownika przeanalizowane
    - [ ] Zdarzenia odkryte i zapisane w tabeli
    - [ ] Hotspoty zidentyfikowane i zgłoszone użytkownikowi
    - [ ] Hotspoty rozwiązane lub świadomie odłożone
    - [ ] Użytkownik zaakceptował tabelę zdarzeń

### Wyjście — ARTEFAKT
Agent TWORZY plik `docs/MODULES.md` z początkową strukturą:

    # Dekompozycja Systemu

    ## Zdarzenia Domenowe
    | # | Zdarzenie | Aktor | Wyzwalacz | Następne zdarzenie |
    |---|-----------|-------|-----------|--------------------|
    | 1 | ... | ... | ... | ... |

    ## Hotspoty
    | # | Opis | Status |
    |---|------|--------|
    | 1 | ... | Rozwiązany / Odłożony |

    Kolejne sekcje zostaną dodane w następnych punktach.

### Przejście
Zapomnij ten punkt → załaduj punkt 4.

<!-- POINT:3 END -->

---

<!-- POINT:4 START -->
## Punkt 4: Poziom Procesów

### Wejście
Agent czyta:
- `docs/MODULES.md` (tabela zdarzeń domenowych)

### Działanie

> Cel: Wzbogacić każde zdarzenie o komendy, aktorów i reguły biznesowe.

**(ID: MMOD-11)** Dla KAŻDEGO zdarzenia z tabeli agent dodaje:

**Komendy (Commands)** — intencje użytkownika wywołujące zdarzenia:

    Zdarzenie: ZamówienieZłożone
    Komenda: ZłóżZamówienie
    Aktor: Klient
    Dane wejściowe: lista produktów, adres dostawy, metoda płatności

**Aktorzy** — kto inicjuje akcje:

    - Użytkownik końcowy (Klient, Admin, Moderator)
    - System (Timer, Scheduler, Cron)
    - System zewnętrzny (Webhook, API partnera)

**Reguły biznesowe** — warunki które muszą być spełnione:

    Komenda: ZłóżZamówienie
    Reguły:
      - Klient musi mieć zweryfikowany email
      - Koszyk nie może być pusty
      - Każdy produkt musi być dostępny w magazynie

**(ID: MMOD-12)** Agent prezentuje wzbogaconą tabelę:

    | Zdarzenie | Komenda | Aktor | Dane wejściowe | Reguły biznesowe |
    |-----------|---------|-------|----------------|------------------|
    | ZamówienieZłożone | ZłóżZamówienie | Klient | produkty, adres, płatność | email zweryfikowany, koszyk niepusty |
    | PłatnośćZakończona | — (event z systemu zewn.) | System płatności | kwota, status | kwota = suma zamówienia |

### Checklista

    - [ ] Każde zdarzenie ma przypisaną komendę (lub jest reakcją systemu)
    - [ ] Każda komenda ma aktora i dane wejściowe
    - [ ] Reguły biznesowe zidentyfikowane
    - [ ] Użytkownik zaakceptował wzbogaconą tabelę

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE `docs/MODULES.md` — rozszerza tabelę
zdarzeń o kolumny Komenda, Dane wejściowe, Reguły biznesowe:

    ## Zdarzenia Domenowe (wzbogacone)
    | # | Zdarzenie | Komenda | Aktor | Dane wejściowe | Reguły biznesowe | Następne zdarzenie |
    |---|-----------|---------|-------|----------------|------------------|--------------------|
    | 1 | ... | ... | ... | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 5.

<!-- POINT:4 END -->

---

<!-- POINT:5 START -->
## Punkt 5: Wyznaczenie Granic (Bounded Contexts → Moduły)

### Wejście
Agent czyta:
- `docs/MODULES.md` (wzbogacona tabela zdarzeń z komendami i regułami)
- Tabela funkcjonalności z `docs/CONTEXT.md`

### Działanie

> Cel: Pogrupować zdarzenia i komendy w logiczne obszary
> które staną się modułami.

**(ID: MMOD-13)** Agent NIE grupuje "po wyczuciu".
Stosuje 5 heurystyk w kolejności:

**Kryterium 1 — Wspólny język:**

    Czy te zdarzenia używają tych samych pojęć?
    "Zamówienie" w kontekście sklepu vs "Zamówienie" w kontekście magazynu
    to mogą być RÓŻNE rzeczy → różne moduły.

**Kryterium 2 — Wspólny aktor:**

    Czy te zdarzenia są wywoływane przez tego samego aktora
    w ramach jednego procesu? Jeśli tak → kandydat na jeden moduł.

**Kryterium 3 — Wspólny cykl życia danych:**

    Czy dane powstają, żyją i umierają razem?
    Adres dostawy żyje z zamówieniem → razem.
    Profil klienta żyje niezależnie → osobno.

**Kryterium 4 — Częstotliwość zmian:**

    Czy te reguły zmieniają się razem?
    Reguły cenowe zmieniają się co tydzień, dane klienta raz na rok
    → osobne moduły.

**Kryterium 5 — Organizacyjny:**

    Czy za te funkcje odpowiada ten sam zespół / dział?
    Płatności → dział finansowy.
    Katalog produktów → dział merchandisingu.
    Różne działy → różne moduły.

**(ID: MMOD-14)** Agent prezentuje wynik grupowania:

    | Moduł | Zdarzenia | Komendy | Główny aktor | Heurystyki |
    |-------|-----------|---------|--------------|------------|
    | Klienci | KontoUtworzono, ProfilZaktualizowano | UtwórzKonto, ZaktualizujProfil | Klient | język, cykl życia |
    | Zamówienia | ZamówienieZłożone, ZamówienieAnulowane | ZłóżZamówienie, AnulujZamówienie | Klient | język, aktor, zmienność |
    | Płatności | PłatnośćRozpoczęta, PłatnośćZakończona | RozpocznijPłatność | System | organizacyjny, język |

### Checklista

    - [ ] Wszystkie zdarzenia przypisane do modułów
    - [ ] Każde przypisanie uzasadnione co najmniej 1 heurystyką
    - [ ] Brak zdarzeń "bezdomnych" (nieprzypisanych)
    - [ ] Użytkownik zaakceptował podział na moduły

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Moduły
    | Moduł | Zdarzenia | Komendy | Główny aktor | Heurystyki |
    |-------|-----------|---------|--------------|------------|
    | Klienci | KontoUtworzono, ProfilZaktualizowano | UtwórzKonto, ZaktualizujProfil | Klient | język, cykl życia |
    | Zamówienia | ZamówienieZłożone, ZamówienieAnulowane | ZłóżZamówienie, AnulujZamówienie | Klient | język, aktor, zmienność |
    | ... | ... | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 6.

<!-- POINT:5 END -->

---

<!-- POINT:6 START -->
## Punkt 6: CRUD vs DDD per moduł

### Wejście
Agent czyta:
- `docs/MODULES.md` (tabela modułów, reguły biznesowe)

### Działanie

> Cel: Dla KAŻDEGO modułu zdecydować czy wymaga pełnego DDD
> czy wystarczy proste CRUD.

**(ID: MMOD-15)** Agent odpowiada na 4 pytania diagnostyczne
dla KAŻDEGO modułu:

    1. "Czy moduł ma reguły biznesowe które mogą się ZMIENIĆ?"
       NIE → CRUD
       TAK → pytanie 2
    
    2. "Czy operacje to głównie zapis/odczyt bez transformacji?"
       TAK → CRUD
       NIE → pytanie 3
    
    3. "Czy są zależności między encjami w ramach jednej operacji?"
       NIE → CRUD
       TAK → pytanie 4
    
    4. "Czy istnieją niezmienniki (reguły które ZAWSZE muszą być prawdziwe)?"
       NIE → CRUD (prosty serwis z walidacją)
       TAK → DDD (agregaty)

**(ID: MMOD-16)** Podsumowanie:

    CRUD gdy:
      - Proste operacje zapisu/odczytu
      - Brak lub minimalne reguły biznesowe
      - Moduł "wspierający" (np. Katalog, Ustawienia, Słowniki)
    
    DDD gdy:
      - Skomplikowane reguły biznesowe
      - Wiele aktorów wpływających na te same dane
      - Reguły mogą się zmieniać w czasie
      - Moduł jest "core" systemu (np. Zamówienia, Rezerwacje)

**(ID: MMOD-17)** Ścieżka migracji CRUD → DDD:

    Jeśli moduł zaczął jako CRUD ale logika rośnie:
    1. Wyodrębnij reguły walidacyjne z serwisu do obiektu domenowego
    2. Obiekt domenowy staje się Agregatem
    3. Serwis staje się handlerem komendy
    4. Nie musisz zmieniać interfejsów zewnętrznych modułu

Agent informuje użytkownika o tej ścieżce dla modułów
które są "na granicy" między CRUD a DDD.

**(ID: MMOD-18)** Agent prezentuje decyzje:

    | Moduł | Typ | Uzasadnienie |
    |-------|-----|--------------|
    | Klienci | CRUD | Proste operacje, brak reguł biznesowych |
    | Zamówienia | DDD | Złożone reguły, niezmienniki, wielu aktorów |
    | Płatności | CRUD | Wrapper na system zewnętrzny, logika w providerze |

### Checklista

    - [ ] 4 pytania diagnostyczne zadane dla każdego modułu
    - [ ] Każdy moduł oznaczony jako CRUD lub DDD
    - [ ] Decyzje uzasadnione
    - [ ] Moduły "na granicy" zidentyfikowane
    - [ ] Użytkownik zaakceptował podział

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE `docs/MODULES.md` — dodaje kolumnę
"Typ (CRUD/DDD)" do tabeli modułów:

    ## Moduły
    | Moduł | Typ (CRUD/DDD) | Zdarzenia | Komendy | Główny aktor | Heurystyki | Uzasadnienie |
    |-------|----------------|-----------|---------|--------------|------------|--------------|
    | Klienci | CRUD | ... | ... | ... | ... | Proste operacje, brak reguł |
    | Zamówienia | DDD | ... | ... | ... | ... | Złożone reguły, niezmienniki |
    | ... | ... | ... | ... | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 7.

<!-- POINT:6 END -->

---

<!-- POINT:7 START -->
## Punkt 7: Projektowanie Agregatów

### Wejście
Agent czyta:
- `docs/MODULES.md` (tabela modułów z typami CRUD/DDD, reguły biznesowe)

### Działanie

> Cel: Dla każdego modułu oznaczonego jako DDD zaprojektować agregaty.
> Moduły CRUD — pomiń w tym punkcie.

**(ID: MMOD-19)** Agregat to klaster obiektów traktowany
jako jedna jednostka pod kątem zmian danych.
Ma jeden obiekt główny (Aggregate Root).

Zasady projektowania agregatów:

    1. JEDEN AGREGAT = JEDNA TRANSAKCJA
       Nigdy nie modyfikuj dwóch agregatów w jednej transakcji.
    
    2. AGREGAT CHRONI NIEZMIENNIKI
       Reguły biznesowe które ZAWSZE muszą być prawdziwe
       są wymuszane wewnątrz agregatu.
       
       Przykład: "Zamówienie musi mieć co najmniej 1 pozycję"
       → Agregat Zamówienie nie pozwoli usunąć ostatniej pozycji.
    
    3. REFERENCJE MIĘDZY AGREGATAMI = TYLKO ID
       Agregat A nie trzyma obiektu Agregatu B.
       Trzyma tylko jego identyfikator.
    
    4. MAŁE AGREGATY
       Im mniejszy agregat, tym mniej konfliktów współbieżności.
       Jeśli agregat ma 15 pól — prawdopodobnie jest za duży.

**(ID: MMOD-20)** Spójność między agregatami:

    W ramach jednego modułu:
      Dwa agregaty muszą się zsynchronizować?
      → Zdarzenie domenowe + handler w tym samym module
      → Eventual Consistency (nie transakcja!)
    
    Między modułami:
      → Zdarzenie integracyjne (opisane w punkcie 10)

**(ID: MMOD-21)** Agent prezentuje agregaty per moduł DDD:

    Moduł: Zamówienia
    
    Agregat: Zamówienie (Aggregate Root)
      - PozycjaZamówienia (Entity)
      - AdresDostawy (Value Object)
      - Niezmienniki:
        - Minimum 1 pozycja
        - Suma > 0
        - Status: Nowe → Opłacone → Wysłane → Dostarczone
      - Zdarzenia: ZamówienieZłożone, ZamówienieOpłacone, ZamówienieAnulowane

### Checklista

    - [ ] Agregaty zaprojektowane dla każdego modułu DDD
    - [ ] Każdy agregat ma Aggregate Root
    - [ ] Niezmienniki zidentyfikowane
    - [ ] Referencje między agregatami przez ID (nie obiekty)
    - [ ] Agregaty są małe (nie za dużo pól/encji)
    - [ ] Użytkownik zaakceptował projekt agregatów

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Agregaty (moduły DDD)

    ### Moduł: Zamówienia
    
    **Agregat: Zamówienie (Aggregate Root)**
    - Encje: PozycjaZamówienia
    - Value Objects: AdresDostawy
    - Niezmienniki:
      - Minimum 1 pozycja
      - Suma > 0
    - Zdarzenia: ZamówienieZłożone, ZamówienieOpłacone, ZamówienieAnulowane
    
    ### Moduł: [kolejny moduł DDD]
    ...

### Przejście
Zapomnij ten punkt → załaduj punkt 8.

<!-- POINT:7 END -->

---

<!-- POINT:8 START -->
## Punkt 8: Struktura Folderów

### Wejście
Agent czyta:
- `docs/MODULES.md` (tabela modułów z typami CRUD/DDD, agregaty)
- Stos technologiczny z `docs/CONTEXT.md`

### Działanie

> Cel: Zbudować fizyczny układ plików wymuszający modularność.

**(ID: MMOD-22)** System składa się z trzech głównych segmentów:

    📁 src/
    ├── 📁 Bootstrapper/
    │   ├── Program/Startup         ← punkt wejścia
    │   └── Rejestracja modułów     ← każdy moduł rejestruje swoje serwisy
    │
    ├── 📁 Modules/
    │   ├── 📁 [NazwaModułu1]/
    │   │   └── (struktura wewnętrzna zależy od CRUD/DDD)
    │   ├── 📁 [NazwaModułu2]/
    │   │   └── (struktura wewnętrzna)
    │   └── 📁 [NazwaModułu3]/
    │       └── (struktura wewnętrzna)
    │
    └── 📁 Shared/
        ├── Abstrakcje/             ← Entity, AggregateRoot, ValueObject
        ├── Kontrakty/              ← Integration Events, Query Contracts
        ├── Infrastruktura/         ← IRepository, IEventBus
        └── Typy/                   ← Money, DateRange, Address

**Bootstrapper:**

    Centralny punkt startowy aplikacji.
    Jedyny element znający WSZYSTKIE moduły.
    Odpowiada za uruchomienie i orkiestrację.
    NIE zawiera logiki biznesowej.

**(ID: MMOD-23)** Struktura WEWNĄTRZ modułu zależy od typu:

**Moduł CRUD (niska złożoność):**

    📁 Modules/[NazwaModułu]/
    ├── 📁 Api/
    │   ├── Endpoints               ← kontrolery/endpointy
    │   └── Contracts               ← DTO request/response
    ├── 📁 Core/
    │   ├── Model                   ← prosty model danych
    │   ├── Serwis                  ← logika CRUD
    │   └── Walidator               ← walidacja wejścia
    ├── 📁 Data/
    │   ├── Repository              ← dostęp do danych
    │   └── DbConfig                ← konfiguracja tabeli/schematu
    └── ModuleSetup                 ← rejestracja w Bootstrapperze

**Moduł DDD (wysoka złożoność):**

    📁 Modules/[NazwaModułu]/
    ├── 📁 Api/
    │   ├── Endpoints               ← kontrolery/endpointy
    │   └── Contracts               ← DTO request/response
    ├── 📁 Application/
    │   ├── 📁 Commands/
    │   │   ├── [NazwaKomendy]      ← handler komendy
    │   │   └── ...
    │   ├── 📁 Queries/
    │   │   └── [NazwaZapytania]    ← handler zapytania
    │   └── 📁 Events/
    │       └── [NazwaEventu]Handler ← reakcja na event
    ├── 📁 Domain/
    │   ├── [AggregateRoot]         ← Aggregate Root
    │   ├── [Entity]                ← Entity
    │   ├── [ValueObject]           ← Value Object
    │   └── [DomainService]         ← Domain Service (opcjonalnie)
    ├── 📁 Infrastructure/
    │   ├── Repository              ← implementacja repozytorium
    │   └── DbConfig                ← konfiguracja schematu
    └── ModuleSetup                 ← rejestracja w Bootstrapperze

**(ID: MMOD-23A)** Kompozycja rejestracji modułu (DI) — projektowana OD RAZU,
nie jako późniejszy refaktor:

    1. Root rejestracji modułu (ModuleSetup / odpowiednik w danym frameworku)
       deklaruje TYLKO warstwę aplikacyjną: endpointy, fasadę, use case'y,
       persystencję, query. Orientacyjnie ~6–16 rejestracji.
    
    2. Każdy podkatalog funkcjonalny modułu (np. wycena/, powiadomienia/,
       raportowanie/) dostaje WŁASNĄ jednostkę rejestracji (podmoduł),
       importowaną przez root.
       ❌ "God module" — rejestracja całej domeny w jednym pliku.
          Doświadczenie: moduły z 50+ rejestracjami zawsze wymagają
          późniejszego, kosztownego rozbicia — nowy moduł powstaje
          od razu podzielony.
    
    3. Moduł ma wydzieloną jednostkę kontraktową (np. katalog access/),
       która jako JEDYNA jest importowana przez inne moduły.
    
    4. Podmoduł sam deklaruje zależności od kontraktów innych modułów,
       których używa — root nie jest workiem na importy "dla dzieci".

Repo-lokalny guideline kompozycji modułów
(`.agent/guidelines/[framework]-module-composition.md`) — przykłady
reguł tego punktu i MMOD-26A w składni kontenera DI wybranego stacku —
tworzy CODING AGENT razem z PIERWSZYM modułem aplikacji i aktualizuje,
gdy zmienia się wzorzec rejestracji.

Agent architektury NIE tworzy tego pliku (AGENT-01: przykłady są
kodem). Jego obowiązkiem jest zapisać wymóg w `docs/MODULES.md`,
tak aby Playbook wystawił ticket na jego utworzenie — analogicznie
do ticketu FE-SETUP po stronie frontendu. Plik jest jednym
z dozwolonych wyjątków od zakazu pisania do `.agent/`
(BOOTSTRAP, reguła 6).

### Checklista

    - [ ] Struktura Bootstrapper/Modules/Shared utworzona
    - [ ] Każdy moduł ma strukturę CRUD lub DDD (wg punktu 6)
    - [ ] Nazwy folderów odpowiadają nazwom modułów z punktu 5
    - [ ] Rejestracja DI podzielona: root aplikacyjny + podmoduły per podkatalog + access/
    - [ ] Użytkownik zaakceptował strukturę

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Struktura Folderów
    [drzewo katalogów z tego punktu — Bootstrapper/Modules/Shared
     + wewnętrzna struktura każdego modułu CRUD/DDD]

### Przejście
Zapomnij ten punkt → załaduj punkt 9.

<!-- POINT:8 END -->

---

<!-- POINT:9 START -->
## Punkt 9: Zarządzanie Zależnościami i Enkapsulacja

### Wejście
Agent czyta:
- `docs/MODULES.md` (struktura folderów)

### Działanie

**(ID: MMOD-24)** Kierunek zależności:

    Bootstrapper → zależy od WSZYSTKICH modułów (rejestruje je)
    Moduły       → zależą od Shared (bazowe abstrakcje)
    Shared       → nie zależy od NICZEGO

**(ID: MMOD-25)** Izolacja modułów — BEZWZGLĘDNA REGUŁA:

    Moduł A NIE MOŻE posiadać bezpośredniej referencji do Modułu B.
    
    ❌ Modules/Zamowienia → using Modules.Klienci.Domain
    ❌ Modules/Zamowienia → using Modules.Klienci.Data
    ✅ Modules/Zamowienia → using Shared.Kontrakty.Klienci

**(ID: MMOD-26)** Enkapsulacja — co jest publiczne a co prywatne:

    Publiczne (widoczne dla innych modułów i Bootstrappera):
      ✅ ModuleSetup (rejestracja)
      ✅ Kontrakty w Shared (Integration Events, Query Interfaces)
      ✅ Endpointy API (dla klientów HTTP)
    
    Prywatne (ukryte wewnątrz modułu):
      🔒 Domain (Agregaty, Value Objects)
      🔒 Application (Handlery komend i zapytań)
      🔒 Infrastructure (Repozytoria, konfiguracja DB)

**(ID: MMOD-26A)** Porty i tokeny DI — BEZWZGLĘDNA REGUŁA
(niezależna od języka; dotyczy każdego kontenera DI, w którym
rejestracja odbywa się po kluczu/tokenie):

    1. Każdy port (interfejs kontraktu) ma NAZWANĄ STAŁĄ tokenu DI
       zdefiniowaną obok interfejsu (np. STORAGE_PORT).
       ❌ Literał stringa powtarzany w miejscach wstrzykiwania
       ✅ Jedna stała importowana wszędzie
       (W językach, gdzie kontener rozwiązuje zależności po typie
        interfejsu, reguła jest spełniona automatycznie.)
    
    2. Rejestracja portu = jawna rejestracja klasy + ALIAS tokenu
       wskazujący na tę samą instancję.
       ❌ Ukryta rejestracja tworząca drugą instancję klasy
          albo zasłaniająca klasę przed resztą modułu
    
    3. Eksport / upublicznienie z modułu to ŚWIADOMA DECYZJA
       z konkretnym konsumentem.
       ❌ Upublicznianie fasady/serwisu "domyślnie" albo "na zapas"
       Martwy eksport usuwa się natychmiast, nie odkłada na audyt.
    
    4. Kontrakty między modułami wychodzą WYŁĄCZNIE przez jednostkę
       kontraktową modułu (MMOD-23A pkt 3) eksportującą tokeny portów.

**(ID: MMOD-27)** Kontrolery/Endpointy:

    Znajdują się WEWNĄTRZ modułów (folder Api/).
    NIE w Bootstrapperze.
    Bootstrapper tylko skanuje i rejestruje endpointy z modułów.

### Checklista

    - [ ] Kierunek zależności zweryfikowany
    - [ ] Brak bezpośrednich referencji między modułami
    - [ ] Enkapsulacja określona (publiczne vs prywatne)
    - [ ] Tokeny portów jako stałe, aliasy przez useExisting, eksporty z konsumentem (MMOD-26A)
    - [ ] Endpointy w modułach, nie w Bootstrapperze

### Wyjście
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Zależności
    
    ```mermaid
    graph TD
        B[Bootstrapper] --> M1[Moduł 1]
        B --> M2[Moduł 2]
        B --> M3[Moduł 3]
        M1 --> S[Shared]
        M2 --> S
        M3 --> S
    ```
    
    ## Enkapsulacja
    | Element | Widoczność | Powód |
    |---------|-----------|-------|
    | ModuleSetup | Publiczny | Rejestracja w Bootstrapperze |
    | Domain/ | Prywatny | Szczegóły implementacji modułu |
    | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 10.

<!-- POINT:9 END -->

---

<!-- POINT:10 START -->
## Punkt 10: Komunikacja Między Modułami

### Wejście
Agent czyta:
- `docs/MODULES.md` (moduły, zdarzenia wzbogacone, agregaty)

### Działanie

> Cel: Zdefiniować JAK moduły rozmawiają ze sobą.
> Moduły NIE MOGĄ się wywoływać bezpośrednio (MMOD-25).

#### 10a. Zdarzenia integracyjne (Asynchroniczne — DOMYŚLNE)

**(ID: MMOD-28)** Gdy moduł A musi POWIADOMIĆ inne moduły o fakcie:

    Moduł Zamówienia publikuje: ZamówienieZłożoneIntegrationEvent
    Moduł Magazyn subskrybuje: reaguje rezerwacją towaru
    Moduł Powiadomienia subskrybuje: wysyła email do klienta
    
    Kontrakt zdarzenia żyje w: Shared/Kontrakty/
    Definiuje go NADAWCA (moduł publikujący)
    
    Każdy handler MUSI być idempotentny
    (przetworzenie tego samego eventu 2x daje ten sam efekt)

#### 10b. Zapytania synchroniczne (Query — dozwolone z ograniczeniami)

**(ID: MMOD-29)** Gdy moduł A potrzebuje DANYCH z modułu B:

    OPCJA 1 — Interfejs w Shared (PREFEROWANE):
      Shared/Kontrakty/IKatalogQuery
      Moduł Katalog implementuje ten interfejs
      Moduł Zamówienia wywołuje interfejs (nie wie kto implementuje)
    
    OPCJA 2 — Lokalna kopia danych:
      Moduł Zamówienia słucha eventów z Katalogu
      i trzyma własną kopię potrzebnych danych (nazwa, cena)
      Lepsza wydajność, ale dane mogą być nieaktualne

    Zakazane:
      ❌ Bezpośredni dostęp do tabel innego modułu
      ❌ Import klas domenowych innego modułu

#### 10c. Procesy międzymodułowe (Saga / Process Manager)

**(ID: MMOD-30)** Gdy proces biznesowy obejmuje wiele modułów:

    OPCJA 1 — Choreografia (PROSTSZA, domyślna):
      Każdy moduł reaguje na eventy poprzedniego.
      Brak centralnego koordynatora.
      Dobre dla prostych procesów (3-4 kroki).
    
    OPCJA 2 — Saga / Process Manager (dla złożonych):
      Dedykowany obiekt koordynujący żyjący w module inicjującym.
      Wie jakie kroki zostały wykonane.
      Wie jak COFNĄĆ kroki gdy coś się nie powiedzie (kompensacja).
      Używaj gdy: więcej niż 4 kroki LUB potrzebne cofanie.

#### 10d. Niezawodność komunikacji

**(ID: MMOD-31)** Outbox Pattern:

    Problem: Event został opublikowany ale handler nie zdążył go przetworzyć.
    
    Rozwiązanie — Outbox Pattern:
      1. Moduł zapisuje event do tabeli Outbox
         (w tej samej transakcji co dane)
      2. Background job odczytuje Outbox i publikuje event na bus
      3. Po potwierdzeniu dostarczenia — oznacza jako wysłany
    
    Na start (MVP): Można pominąć Outbox i użyć prostego
    in-process event bus. Ale agent MUSI zapisać to
    w docs/TECH_DEBT.md jako dług do spłacenia.

### Checklista

    - [ ] Zdarzenia integracyjne zdefiniowane (kto publikuje, kto subskrybuje)
    - [ ] Zapytania synchroniczne zidentyfikowane (kto pyta kogo o co)
    - [ ] Procesy międzymodułowe: choreografia vs saga — decyzja podjęta
    - [ ] Outbox Pattern: wdrożony lub zapisany w TECH_DEBT
    - [ ] Użytkownik zaakceptował model komunikacji

### Wyjście
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Komunikacja
    | Nadawca | Event/Query | Odbiorca | Typ (async/sync) | Wzorzec |
    |---------|-------------|----------|------------------|---------|
    | Zamówienia | ZamówienieZłożoneEvent | Magazyn | async | Choreografia |
    | Zamówienia | IKlientQuery | Klienci | sync | Interfejs w Shared |
    | ... | ... | ... | ... | ... |
    
    ## Procesy Międzymodułowe
    | Proces | Kroki | Wzorzec | Kompensacja |
    |--------|-------|---------|-------------|
    | Złożenie zamówienia | 4 kroki | Choreografia | — |
    | ... | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 11.

<!-- POINT:10 END -->

---

<!-- POINT:11 START -->
## Punkt 11: Reguły dla Shared

### Wejście
Agent czyta:
- `docs/MODULES.md` (komunikacja, kontrakty)

### Działanie

**(ID: MMOD-32)** Shared POWINIEN zawierać:

    ✅ Abstrakcje bazowe (Entity, AggregateRoot, ValueObject)
    ✅ Interfejsy infrastrukturalne (IRepository, IEventBus, IUnitOfWork)
    ✅ Kontrakty integracyjne (Integration Events, Query Contracts)
    ✅ Wyjątki bazowe (DomainException, NotFoundException)
    ✅ Typy wspólne (Money, DateRange, Address, Pagination)

**(ID: MMOD-33)** Shared NIE POWINIEN zawierać:

    ❌ Logiki biznesowej żadnego modułu
    ❌ Konkretnych implementacji repozytoriów
    ❌ Modeli specyficznych dla jednego modułu
    ❌ "Utilsów" które rosną w nieskończoność
    
    TEST: Jeśli klasa w Shared ma sens TYLKO w kontekście
    jednego modułu → PRZENIEŚ ją do tego modułu.

**(ID: MMOD-34)** Agent weryfikuje czy planowana zawartość Shared
spełnia powyższe reguły. Jeśli coś nie pasuje — przesuwa
do odpowiedniego modułu.

### Checklista

    - [ ] Zawartość Shared zdefiniowana
    - [ ] Żadna klasa specyficzna dla jednego modułu nie jest w Shared
    - [ ] Kontrakty integracyjne z punktu 10 umieszczone w Shared
    - [ ] Test "czy ma sens w innym module?" przeszedł dla każdej klasy

### Wyjście
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Shared — Zawartość
    | Element | Typ | Powód obecności w Shared |
    |---------|-----|--------------------------|
    | Entity | Abstrakcja bazowa | Używana przez wszystkie moduły DDD |
    | IEventBus | Interfejs infrastrukturalny | Komunikacja między modułami |
    | ZamówienieZłożoneEvent | Kontrakt integracyjny | Definiowany przez Zamówienia, konsumowany przez Magazyn |
    | Money | Typ wspólny | Używany w wielu modułach |
    | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 12.

<!-- POINT:11 END -->

---

<!-- POINT:12 START -->
## Punkt 12: Baza Danych

### Wejście
Agent czyta:
- `docs/MODULES.md` (moduły, typy CRUD/DDD)
- Stos technologiczny z `docs/CONTEXT.md`

### Działanie

**(ID: MMOD-35)** Separacja danych — BEZWZGLĘDNA REGUŁA:

    Każdy moduł posiada WŁASNY schemat lub zestaw tabel.
    
    ✅ Moduł Zamówienia → schemat "orders"
    ✅ Moduł Klienci → schemat "customers"
    
    ❌ Moduł Zamówienia → SELECT z customers.klienci
    ❌ Wspólne tabele modyfikowane przez wiele modułów

**(ID: MMOD-36)** Dozwolone wyjątki:

    ✅ Tabele lookup (kraje, waluty) — w schemacie "shared"
    ✅ Widoki (VIEW) do raportowania cross-modułowego — READ ONLY
    
    Raportowanie cross-modułowe:
    OPCJA 1: Dedykowany moduł Raportowanie z własnymi widokami
    OPCJA 2: Event-driven — moduł Raportowanie słucha eventów
    ❌ ZAKAZANE: Bezpośrednie JOINy między schematami modułów

**(ID: MMOD-37)** DbContext / konfiguracja bazy:

    Osobny DbContext (lub odpowiednik) PER MODUŁ.
    NIE jeden wspólny DbContext dla całej aplikacji.

**(ID: MMOD-38)** Strategia In-Memory na start:

    1. Zacznij z repozytoriami In-Memory (słownik/lista w pamięci)
    2. Skup się na logice biznesowej i kontraktach między modułami
    3. Przejdź na prawdziwą bazę GDY:
       - Logika modułu jest stabilna
       - Potrzebujesz trwałości danych między restartami
       - Potrzebujesz zapytań (filtrowanie, sortowanie, paginacja)
    4. Dzięki interfejsowi IRepository — zamiana jest jedną klasą
    5. Wybór In-Memory dla modułu = wpis do docs/TECH_DEBT.md
       (analogicznie jak pominięcie Outboxa w MMOD-31)
       z triggerem przejścia na prawdziwą bazę

### Checklista

    - [ ] Schemat bazy per moduł zdefiniowany
    - [ ] Brak cross-modułowych tabel (poza lookup)
    - [ ] Osobny DbContext per moduł
    - [ ] Strategia start: In-Memory lub prawdziwa baza — decyzja podjęta
    - [ ] Użytkownik zaakceptował strategię bazodanową

### Wyjście
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcję:

    ## Baza Danych
    | Moduł | Schemat | Strategia start | Przejście na prawdziwą bazę |
    |-------|---------|-----------------|----------------------------|
    | Zamówienia | orders | In-Memory | Gdy logika stabilna |
    | Klienci | customers | Prawdziwa baza | Od razu — potrzeba trwałości |
    | ... | ... | ... | ... |

### Przejście
Zapomnij ten punkt → załaduj punkt 13.

<!-- POINT:12 END -->

---

<!-- POINT:13 START -->
## Punkt 13: Estymacje PERT i Plan Implementacji

### Wejście
Agent czyta:
- `docs/MODULES.md` (lista modułów z zależnościami)
- Tabela funkcjonalności z `docs/CONTEXT.md`
- P3 (budżet czasowy)

### Działanie

#### Diagram zależności

**(ID: MMOD-39)** Agent identyfikuje MOMENTY INTEGRACJI:

    Moment Integracji = chwila, gdy dwa moduły
    muszą ze sobą współpracować.

Procedura:

    1. Wypisz wszystkie moduły z docs/MODULES.md
    2. Dla każdego modułu określ zależności
       (co musi istnieć wcześniej)
    3. Narysuj graf: węzły = kamienie milowe,
       strzałki = aktywności
    4. Znajdź ŚCIEŻKĘ KRYTYCZNĄ
       (najdłuższą drogę start → cel)

#### Ścieżka krytyczna

**(ID: MMOD-40)** Zasady:

    PRAWO: Projektu NIE DA SIĘ zrealizować szybciej
           niż trwa ścieżka krytyczna.
    WNIOSEK: Dodawanie zasobów poza ścieżką krytyczną
             NIE przyspiesza projektu.
    AKCJA: Optymalizuj TYLKO zadania NA ścieżce krytycznej.

#### Estymacja czasu — wzór PERT

**(ID: MMOD-41)** Dla KAŻDEGO modułu agent stosuje wzór:

    Estymacja = (O + 4M + P) / 6

    O = scenariusz OPTYMISTYCZNY ("wszystko idzie gładko")
    M = scenariusz NAJBARDZIEJ PRAWDOPODOBNY ("normalnie")
    P = scenariusz PESYMISTYCZNY ("wszystko się sypie")

**REGUŁA:** Jeśli użytkownik pyta "ile to zajmie" —
NIGDY nie podawaj jednej liczby.
ZAWSZE podaj trzy scenariusze (O, M, P) i wyliczoną estymację PERT.

#### Kolejność implementacji

**(ID: MMOD-42)** Dla modularnego monolitu kolejność to:

    1. SHARED          → bazowe abstrakcje i kontrakty
    2. Moduły CRUD     → proste, szybkie, dają fundament danych
    3. Moduły DDD      → złożone, core systemu
    4. Komunikacja     → eventy integracyjne, saga (jeśli potrzebna)
    5. Bootstrapper    → spinanie całości
    6. API / Client    → na końcu

Agent MOŻE zmienić kolejność jeśli ścieżka krytyczna
wskazuje inną optymalną sekwencję. Zmiana wymaga uzasadnienia.

### Checklista

    - [ ] Zależności między modułami zidentyfikowane
    - [ ] Ścieżka krytyczna wyznaczona
    - [ ] Estymacja PERT dla każdego modułu
    - [ ] Kolejność implementacji ustalona
    - [ ] Plan porównany z budżetem czasowym (P3)
    - [ ] Użytkownik zaakceptował plan

### Wyjście
Agent AKTUALIZUJE `docs/MODULES.md` dodając sekcje:

    ## Zależności Implementacyjne
    
    ```mermaid
    graph LR
        S[Shared] --> C1[Klienci CRUD]
        S --> C2[Katalog CRUD]
        C1 --> D1[Zamówienia DDD]
        C2 --> D1
        D1 --> K[Komunikacja]
        K --> B[Bootstrapper]
    ```
    
    ## Ścieżka Krytyczna
    [opis + wyróżnienie]
    
    ## Estymacje
    | Moduł | O | M | P | PERT | Na ścieżce krytycznej? |
    |-------|---|---|---|------|----------------------|
    | Shared | 0.5d | 1d | 2d | 1.1d | Tak |
    | Klienci | 1d | 2d | 4d | 2.2d | Nie |
    | Zamówienia | 3d | 7d | 14d | 7.5d | Tak |
    
    ## Kolejność Implementacji
    1. [moduł] — [uzasadnienie]
    2. ...
    
    ## Sumaryczny Czas
    - Optymistyczny: [X dni]
    - PERT: [Y dni]
    - Pesymistyczny: [Z dni]
    - Budżet użytkownika (P3): [porównanie]

### Przejście
Zapomnij ten punkt → załaduj punkt 14.

<!-- POINT:13 END -->

---

<!-- POINT:14 START -->
## Punkt 14: Złote Zasady i Przekazanie do Playbooka

### Wejście
Agent czyta:
- `docs/CONTEXT.md`
- `docs/MODULES.md`
- `docs/TECH_DEBT.md` (jeśli istnieje)

### Działanie

#### Weryfikacja złotych zasad

**(ID: MMOD-43)** Agent weryfikuje czy projekt spełnia złote zasady:

**Dozwolone kompromisy (OK jeśli zastosowane):**

    ✅ Synchroniczne zapytanie między modułami gdy async jest przerost
    ✅ Wspólna tabela lookup (kraje, waluty) w schemacie "shared"
    ✅ Uproszczenie modułu do CRUD gdy logika jest trywialna
    ✅ In-process event bus zamiast pełnego message brokera na start
    ✅ Pominięcie Outbox Pattern na etapie MVP (zapisane w TECH_DEBT)

**Zakazane kompromisy (MUSI być spełnione):**

    ❌ Bezpośredni dostęp do tabel innego modułu (SELECT/UPDATE)
    ❌ Logika biznesowa modułu A w kodzie modułu B
    ❌ Cykliczne zależności między modułami
    ❌ Pominięcie granic modułów "bo szybciej"
    ❌ Jeden DbContext dla całej aplikacji
    ❌ Kontrolery w Bootstrapperze zamiast w modułach
    ❌ "God module" — rejestracja całej domeny w jednym module DI (MMOD-23A)
    ❌ Stringowe tokeny DI w miejscach wstrzykiwania (MMOD-26A)
    ❌ Martwe / nadmiarowe eksporty z modułów (MMOD-26A)
    ❌ Import wnętrza innej domeny z pominięciem *AccessModule (MMOD-26A)
    ❌ Sekrety (klucze API, hasła, tokeny) zaszyte w kodzie zamiast w konfiguracji
    ❌ Endpoint bez jawnej decyzji o uprawnieniach (brak guarda ≠ endpoint publiczny)
    ❌ Endpoint przyjmujący wejście bez walidacji (DTO bez reguł walidacyjnych)
    ❌ Nowa zależność dodana bez weryfikacji (utrzymanie paczki, znane podatności)

Jeśli JAKIKOLWIEK zakazany kompromis został złamany —
agent MUSI to naprawić przed przekazaniem do Playbooka.

Gate weryfikacyjny do PRZEKAZANIA coding agentowi (agent architektury
go NIE uruchamia — na tym etapie nie ma kodu, obowiązuje AGENT-01):

    Oprócz builda i testów wymagany jest DI smoke test — test
    kompilujący/budujący PEŁNY graf kontenera DI aplikacji
    z podstawionymi atrapami zasobów zewnętrznych (baza danych,
    kolejki, storage), bez uruchamiania serwera. Kompilator/typechecker
    i testy jednostkowe NIE wykrywają błędów wiringu modułów — test
    grafu DI powstaje razem z PIERWSZYM modułem aplikacji.

Agent zapisuje ten wymóg w podsumowaniu (MMOD-45) jako pozycję
pakietu handoff. Playbook wpisuje go do Done Criteria ticketu
zakładającego pierwszy moduł (Faza 5, punkt 8).

#### Gotowość na mikroserwisy

**(ID: MMOD-44)** Agent weryfikuje:

    Buduj tak aby moduł MOŻNA BYŁO wyciąć. Ale NIE wycinaj bez powodu.
    
    Wycinaj moduł do mikroserwisu GDY:
      □ Moduł wymaga INNEGO skalowania niż reszta
      □ Moduł wymaga INNEGO cyklu deploymentu
      □ Moduł wymaga INNEJ technologii
      □ Zespół tego modułu jest niezależny organizacyjnie
    
    Jeśli ŻADEN warunek nie spełniony → zostaw w monolicie.
    
    Single Deployment Unit:
    Mimo podziału logicznego — na początku wdrażaj system
    jako JEDNĄ aplikację (uproszczenie DevOps).

#### Podsumowanie strategii

**(ID: MMOD-45)** Agent prezentuje użytkownikowi podsumowanie:

    ## Podsumowanie strategii Modularny Monolit

    ### Architektura
    - Moduły: [liczba] ([X] CRUD, [Y] DDD)
    - Komunikacja: [Z] eventów integracyjnych, [W] zapytań sync
    [diagram z docs/MODULES.md]

    ### Stos technologiczny
    [z docs/CONTEXT.md]

    ### Złote zasady
    - Dozwolone kompromisy zastosowane: [lista]
    - Zakazane kompromisy: ✅ Żaden nie złamany

    ### Gotowość na mikroserwisy
    - Moduły gotowe do wycięcia: [lista]
    - Moduły wymagające pracy przed wycięciem: [lista + co brakuje]
    - Rekomendacja: [zostaw w monolicie / rozważ wycięcie X]

    ### Dług techniczny
    [liczba wpisów w TECH_DEBT.md]
    [lista najważniejszych z priorytetem]

    ### Estymacja
    - Optymistyczny: [X dni]
    - PERT: [Y dni]
    - Pesymistyczny: [Z dni]

#### Przekazanie do Playbooka

**(ID: MMOD-46)** Strategia Modularny Monolit kończy pracę.

Artefakty wygenerowane przez strategię:

    docs/CONTEXT.md  — zaktualizowany (stos, rewizja kodu)
    docs/MODULES.md  — pełna dekompozycja systemu
    docs/TECH_DEBT.md — jeśli istnieje

Agent przekazuje kontrolę do AI Architecture Agent Playbook.
Playbook przejmuje od Bloku 0 — Orientacja.

### Checklista

    - [ ] Złote zasady zweryfikowane (zakazane kompromisy nienaruszone)
    - [ ] Gotowość na mikroserwisy oceniona
    - [ ] Podsumowanie zaprezentowane użytkownikowi
    - [ ] Użytkownik zaakceptował podsumowanie
    - [ ] Kontrola przekazana do Playbooka

### Wyjście
Brak nowych artefaktów.
Strategia w stanie ZAKOŃCZONA.
Dalsze kroki (walidacja, tickety, handoff) realizuje Playbook.

<!-- POINT:14 END -->
