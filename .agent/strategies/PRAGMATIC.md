---
strategy_name: "Pragmatyczna"
version: "1.2"
description: "Szybkie wytwarzanie oparte na prostych warstwach i sprawdzonych technologiach. Boring Technology."
---

# 🔧 Strategia Pragmatyczna

> **Źródło:** Materiały Krzysztofa Kempińskiego — „Dyrektor Netu"
>
> **Zasady tej strategii:**
> - PRAGMATYZM PONAD PERFEKCJĘ — "Done is better than perfect."
> - NUDNA TECHNOLOGIA WYGRYWA — Sprawdzone narzędzia, nie nowinki.
> - KOMUNIKACJA PONAD KODEM — Problemy projektowe to problemy komunikacyjne.

---

## Jak agent pracuje z tym plikiem

    1. Wykonaj Punkty 1-2 z .agent/strategies/_COMMON.md
       (punkt po punkcie, tak samo jak niżej).
    2. Wróć tutaj i załaduj TYLKO punkt nr 3.
    3. Wykonaj go. Odhacz checklistę.
    4. Zapomnij punkt 3.
    5. Załaduj punkt nr 4.
    6. Powtarzaj aż do ostatniego punktu (6).

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

Fragmenty oznaczone w tamtym pliku `[TYLKO MODULAR_MONOLITH]` POMIŃ — nie dotyczą tej strategii.

Wyjścia tych punktów (sekcje "Stos Technologiczny" i "Rewizja
Istniejącego Kodu" w docs/CONTEXT.md) są wejściem dla Punktu 3.

---

<!-- POINT:3 START -->
## Punkt 3: Dekompozycja przez Zmienność

### Wejście
Agent czyta z `docs/CONTEXT.md`:
- Tabela funkcjonalności (v1)
- Ścieżki użytkownika
- Stos technologiczny
- Rewizja istniejącego kodu (jeśli Istniejący kod)

### Działanie

> Cel: Podzielić system na moduły NIE po encjach/tabelach,
> ale po OSIACH ZMIENNOŚCI — co się zmienia niezależnie,
> to osobny moduł.

#### Filtr 1 — Zmienności Infrastrukturalne

**(ID: PRAG-08)** Te elementy zmieniają się ZAWSZE.
Agent przegląda tabelę funkcjonalności i automatycznie
wydziela moduły infrastrukturalne:

**UI / Frontend:**

    - Reguła: Logika biznesowa NIGDY nie zależy od UI
    - Akcja: Wydziel interfejs między logiką a UI

**Systemy zewnętrzne — Płatności:**

    - Warunek: Tabela funkcjonalności zawiera F-kę związaną z płatnościami
    - Akcja: Interfejs PaymentGateway + konkretna implementacja
    - Przykład: Dziś Stripe, jutro PayPal — zmiana 1 pliku

**Systemy zewnętrzne — Powiadomienia:**

    - Warunek: System wysyła email / SMS / push
    - Akcja: Interfejs NotificationSender + konkretna implementacja

**Systemy zewnętrzne — Integracje:**

    - Warunek: Zewnętrzne API (kursy walut, mapy, AI)
    - Akcja: Adapter per integracja

**Tożsamość (Auth):**

    - Warunek: System ma logowanie lub uprawnienia
    - Akcja: Osobny moduł Auth/Identity

#### Filtr 2 — Zmienności Biznesowe (Domenowe)

**(ID: PRAG-09)** Dla KAŻDEJ reguły biznesowej wynikającej
z tabeli funkcjonalności agent zadaje pytanie testowe:

    "Czy wyobrażasz sobie sytuację, w której ta reguła
     działa INACZEJ?"
    
    TAK → kandydat na osobny moduł
    NIE → może zostać zahardkodowane (na razie)

Typowe zmienności biznesowe:

**Algorytmy** (Wyszukiwanie, Rekomendacje, Scoring, Pricing):

    - Akcja: Interfejs + wymienialna implementacja (Strategy Pattern)

**Logika procesu** (Workflow, Onboarding, Gamifikacja):

    - Akcja: Osobny moduł procesowy / State Machine

**Formaty danych** (Import/Export CSV/JSON/XML):

    - Akcja: Adapter per format

#### Filtr 3 — Decyzja o Granularności

**(ID: PRAG-10)** Agent stosuje reguły łączenia/rozdzielania:

    ŁĄCZENIE:    Dwa moduły ZAWSZE zmieniają się razem → POŁĄCZ
    ROZDZIELANIE: Koszt integracji < koszt zmiany monolitu → ROZDZIEL
    DOMYŚLNIE:   W razie wątpliwości → NIE ROZDZIELAJ
                 (łatwiej wydzielić później niż scalić źle rozdzielone)

### Checklista

    - [ ] Filtr zmienności infrastrukturalnych przeszedł
    - [ ] Filtr zmienności biznesowych przeszedł
    - [ ] Granularność oceniona (łączenie/rozdzielanie)
    - [ ] Lista modułów gotowa
    - [ ] Użytkownik zaakceptował listę modułów

### Wyjście — ARTEFAKT
Agent TWORZY plik `docs/MODULES.md` z początkową strukturą:

    # Dekompozycja Systemu

    ## Moduły

    | Nazwa | Typ zmienności | Uzasadnienie |
    |-------|----------------|--------------|
    | Auth | Infrastrukturalna | Provider może się zmienić |
    | PricingEngine | Biznesowa | Reguły cenowe ewoluują |
    | OrderManager | Biznesowa | Nowe scenariusze |
    | ... | ... | ... |

    Kolumna "Warstwa" zostanie dodana w punkcie 4
    (Architektura Statyczna — IDesign).

### Przejście
Zapomnij ten punkt → załaduj punkt 4.

<!-- POINT:3 END -->

---

<!-- POINT:4 START -->
## Punkt 4: Architektura Statyczna (Metoda IDesign)

### Wejście
Agent czyta:
- `docs/MODULES.md` (lista modułów z typami zmienności)
- Tabela funkcjonalności z `docs/CONTEXT.md`

### Działanie

> Cel: Przypisać każdy moduł do WARSTWY i ustalić reguły komunikacji.

#### Warstwy IDesign

**(ID: PRAG-11)** Struktura warstw od góry do dołu:

**CLIENT** — Kto używa systemu?

    - Web, Mobile, CLI, Timer, External Caller
    - CIENKI — zero logiki biznesowej
    - Jedynie wywołuje Managerów

**MANAGER** — Co system robi?

    - Scenariusze użycia / Features
    - ORKIESTRATOR — składa klocki z niższych warstw
    - Zmienia się NAJCZĘŚCIEJ

**ENGINE** — Jak to jest robione?

    - Czysta logika biznesowa, algorytmy
    - Nie wie nic o bazie danych ani o UI
    - Tu siedzi "mięso" biznesowe

**ACCESS** — Gdzie są dane/zasoby?

    - Ukrywa szczegóły techniczne zasobu
    - Zmienia się NAJRZADZIEJ

**RESOURCE** — Fizyczny zasób

    - Baza danych, system plików, zewnętrzny serwis
    - Agent NIE tworzy modułów Resource —
      to są konfiguracje/połączenia, nie moduły

**UTILITY** — Boczna ścieżka

    - Logger, Security, MessageBus, Cache
    - Test Smart Espresso: "Czy pasuje do inteligentnego
      ekspresu do kawy?" (niezwiązane z domeną = Utility)

#### Klasyfikacja modułów

**(ID: PRAG-12)** Dla KAŻDEGO modułu z listy agent zadaje
pytania klasyfikujące:

    | Pytanie                                    | Jeśli TAK → warstwa |
    |--------------------------------------------|---------------------|
    | Kto wywołuje to jako punkt wejścia?        | CLIENT              |
    | Orkiestruje inne moduły dla feature'a?      | MANAGER             |
    | Czysta logika/algorytm bez DB/UI?           | ENGINE              |
    | Ukrywa dostęp do danych/zasobów?            | ACCESS              |
    | Generyczny, pasuje do każdego projektu?     | UTILITY             |

#### Zasady komunikacji między warstwami

**(ID: PRAG-13)** Te zasady są NIENARUSZALNE:

**ZASADA 1 — TYLKO W DÓŁ:**

    Client → Manager → Engine / Access
    ✅ Manager wywołuje Engine
    ❌ Engine wywołuje Managera
    ❌ Access wywołuje Managera

**ZASADA 2 — MANAGER ↔ MANAGER: TYLKO ASYNCHRONICZNIE:**

    ✅ Przez kolejkę (Message Queue / Event Bus)
    ❌ Bezpośrednie wywołanie metody
    Powód: Zapobiega pajęczynie zależności

**ZASADA 3 — ENGINE NIE WIE O BAZIE DANYCH:**

    Engine operuje na abstrakcjach (interfejsach).
    Access dostarcza implementację.

**ZASADA 4 — CLIENT JEST CIENKI:**

    Żadnej logiki biznesowej w warstwie klienta.
    Klient jedynie wywołuje Managera i wyświetla wynik.

**ZASADA 5 — UTILITY DOSTĘPNE DLA WSZYSTKICH WARSTW:**

    Ale żadna warstwa nie może stać się Utility "przez przypadek".

#### Adaptacja: projekt bez backendu

Stosuj, gdy STRATEGY_MAP skierował tu projekt Krokiem 0B
(aplikacja czysto kliencka, front na cudzym API, narzędzie offline).

Warstwy zachowują znaczenie — zmienia się ich nośnik:

    | Warstwa  | Odpowiednik po stronie klienta |
    |----------|-------------------------------|
    | CLIENT   | widoki / strony / trasy — cienkie, bez logiki |
    | MANAGER  | logika ekranu lub przepływu (koordynuje krok po kroku) |
    | ENGINE   | czysta logika i algorytmy — bez DOM, bez fetch, bez storage |
    | ACCESS   | dostęp do zasobu: klient HTTP cudzego API, IndexedDB/localStorage, plik |
    | RESOURCE | samo API / magazyn przeglądarki — nie jest modułem |
    | UTILITY  | formatowanie, i18n, logger, analityka |

Zasady komunikacji (PRAG-13) obowiązują BEZ ZMIAN. Najczęstsze
naruszenie w projektach frontendowych: `fetch` wołany wprost
z komponentu widoku — to Client sięgający do Resource z pominięciem
Access i Managera.

Dodatkowe rozstrzygnięcia dla tego wariantu:

    1. Granica zaufania leży na kliencie — walidacja w przeglądarce
       NIE jest zabezpieczeniem. Jeśli funkcjonalność wymaga
       zabezpieczenia (płatność, uprawnienia, sekret), to znaczy,
       że projekt JEDNAK potrzebuje backendu — wróć do PATH-12
       i tabeli funkcjonalności zamiast obchodzić brak serwera.
    2. Sekrety: klucz API w kodzie klienta jest jawny. Dozwolone
       tylko klucze publiczne z ograniczeniem domeny. Reszta =
       wymóg backendu (spójne z FE-11).
    3. Trwałość danych: świadoma decyzja (pamięć sesji /
       localStorage / IndexedDB / cudze API) + odpowiedź, co się
       dzieje przy braku sieci i przy wyczyszczeniu przeglądarki.

### Checklista

    - [ ] Każdy moduł przypisany do warstwy
    - [ ] Pytania klasyfikujące zadane dla każdego modułu
    - [ ] Zasady komunikacji zweryfikowane (brak łamania)
    - [ ] Użytkownik zaakceptował architekturę

### Wyjście — ARTEFAKT
Agent AKTUALIZUJE plik `docs/MODULES.md` dodając kolumnę
"Warstwa" do tabeli modułów oraz nowe sekcje:

    # Dekompozycja Systemu

    ## Moduły

    | Nazwa | Warstwa | Typ zmienności | Uzasadnienie |
    |-------|---------|----------------|--------------|
    | Auth | Access | Infrastrukturalna | Provider może się zmienić |
    | PricingEngine | Engine | Biznesowa | Reguły cenowe ewoluują |
    | OrderManager | Manager | Biznesowa | Nowe scenariusze |
    | ... | ... | ... | ... |

    ## Diagram Warstw

    ```mermaid
    graph TD
        C[Client] --> M[Manager]
        M --> E[Engine]
        M --> A[Access]
        A --> R[(Resource)]
        U[Utility] -.-> C
        U -.-> M
        U -.-> E
        U -.-> A
    ```

    ## Zasady Komunikacji — Potwierdzenie
    - [ ] Komunikacja tylko w dół
    - [ ] Manager↔Manager asynchronicznie
    - [ ] Engine nie zależy od bazy
    - [ ] Client jest cienki

### Przejście
Zapomnij ten punkt → załaduj punkt 5.

<!-- POINT:4 END -->

---

<!-- POINT:5 START -->
## Punkt 5: Estymacje PERT i Plan Implementacji

### Wejście
Agent czyta:
- `docs/MODULES.md` (lista modułów z warstwami)
- Tabela funkcjonalności z `docs/CONTEXT.md`
- P3 (budżet czasowy)

### Działanie

#### Diagram zależności

**(ID: PRAG-14)** Agent NIE generuje listy tasków z czasami (Gantt).
Zamiast tego identyfikuje MOMENTY INTEGRACJI:

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

**(ID: PRAG-15)** Zasady:

    PRAWO: Projektu NIE DA SIĘ zrealizować szybciej
           niż trwa ścieżka krytyczna.
    WNIOSEK: Dodawanie zasobów poza ścieżką krytyczną
             NIE przyspiesza projektu.
    AKCJA: Optymalizuj TYLKO zadania NA ścieżce krytycznej.

#### Estymacja czasu — wzór PERT

**(ID: PRAG-16)** Dla KAŻDEGO modułu agent stosuje wzór:

    Estymacja = (O + 4M + P) / 6

    O = scenariusz OPTYMISTYCZNY ("wszystko idzie gładko")
    M = scenariusz NAJBARDZIEJ PRAWDOPODOBNY ("normalnie")
    P = scenariusz PESYMISTYCZNY ("wszystko się sypie")

Przykład:

    Moduł: PaymentGatewayAccess
    O:  2 dni
    M:  5 dni
    P: 14 dni
    Estymacja: (2 + 4×5 + 14) / 6 = 36/6 = 6 dni

**REGUŁA:** Jeśli użytkownik pyta "ile to zajmie" —
NIGDY nie podawaj jednej liczby.
ZAWSZE podaj trzy scenariusze (O, M, P) i wyliczoną estymację PERT.

#### Kolejność implementacji

**(ID: PRAG-17)** Domyślna kolejność wynika z warstw IDesign:

    1. ACCESS    → bez danych nic nie działa
    2. ENGINE    → core value
    3. MANAGER   → składa klocki
    4. CLIENT    → na końcu (jest cienki)
    5. UTILITY   → w miarę potrzeb, nie na zapas

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

    ## Zależności

    ```mermaid
    graph LR
        A[AuthAccess] --> B[UserEngine]
        B --> C[OrderManager]
        D[PaymentAccess] --> C
        C --> E[APIClient]
    ```

    ## Ścieżka Krytyczna
    [opis + wyróżnienie na grafie]

    ## Estymacje

    | Moduł | O | M | P | PERT | Na ścieżce krytycznej? |
    |-------|---|---|---|------|----------------------|
    | AuthAccess | 1d | 2d | 5d | 2.3d | Tak |
    | PaymentAccess | 2d | 5d | 14d | 6d | Tak |
    | OrderManager | 1d | 3d | 7d | 3.3d | Nie |

    ## Kolejność Implementacji
    1. [moduł] — [uzasadnienie]
    2. [moduł] — [uzasadnienie]
    3. ...

    ## Sumaryczny Czas
    - Optymistyczny: [X dni]
    - PERT: [Y dni]
    - Pesymistyczny: [Z dni]
    - Budżet użytkownika (P3): [porównanie]

### Przejście
Zapomnij ten punkt → załaduj punkt 6.

<!-- POINT:5 END -->

---

<!-- POINT:6 START -->
## Punkt 6: Podsumowanie i Przekazanie do Playbooka

### Wejście
Agent czyta:
- `docs/CONTEXT.md`
- `docs/MODULES.md`
- `docs/TECH_DEBT.md` (jeśli istnieje)

### Działanie

#### Weryfikacja zasad komunikacji

**(ID: PRAG-18)** Agent weryfikuje czy projekt spełnia
zasady komunikacji z punktu 4 (PRAG-13):

**Dozwolone kompromisy (OK jeśli zastosowane):**

    ✅ Utility używane przez wiele warstw
    ✅ Uproszczenie modułu gdy logika jest trywialna
    ✅ In-process event bus zamiast pełnego message brokera na start

**Zakazane kompromisy (MUSI być spełnione):**

    ❌ Komunikacja w górę (Engine → Manager, Access → Manager)
    ❌ Manager↔Manager synchronicznie (bezpośrednie wywołanie)
    ❌ Engine zależy od bazy danych / HTTP / plików
    ❌ Logika biznesowa w warstwie Client
    ❌ Pominięcie warstw "bo szybciej"
    ❌ Sekrety (klucze API, hasła, tokeny) zaszyte w kodzie zamiast w konfiguracji
    ❌ Endpoint bez jawnej decyzji o uprawnieniach (brak guarda ≠ endpoint publiczny)
    ❌ Endpoint przyjmujący wejście bez walidacji (DTO bez reguł walidacyjnych)
    ❌ Nowa zależność dodana bez weryfikacji (utrzymanie paczki, znane podatności)

Jeśli JAKIKOLWIEK zakazany kompromis został złamany —
agent MUSI to naprawić przed przekazaniem do Playbooka.

Gate weryfikacyjny do PRZEKAZANIA coding agentowi (agent architektury
go NIE uruchamia — na tym etapie nie ma kodu, obowiązuje AGENT-01):

    Jeśli stack używa kontenera DI — oprócz builda i testów
    wymagany jest DI smoke test: test kompilujący/budujący PEŁNY
    graf kontenera DI aplikacji z podstawionymi atrapami zasobów
    zewnętrznych (baza danych, kolejki, storage), bez uruchamiania
    serwera. Kompilator/typechecker i testy jednostkowe NIE wykrywają
    błędów wiringu modułów — test grafu DI powstaje razem
    z PIERWSZYM modułem aplikacji.

Agent zapisuje ten wymóg w podsumowaniu (PRAG-19) jako pozycję
pakietu handoff. Playbook wpisuje go do Done Criteria ticketu
zakładającego pierwszy moduł (Faza 5, punkt 8).

#### Podsumowanie strategii

**(ID: PRAG-19)** Agent prezentuje użytkownikowi podsumowanie:

    ## Podsumowanie strategii Pragmatyczna

    ### Architektura
    - Moduły: [liczba] ([X] w warstwie Access, [Y] Engine,
      [Z] Manager, [W] Client, [V] Utility)
    [diagram z docs/MODULES.md]

    ### Stos technologiczny
    [z docs/CONTEXT.md]

    ### Zasady komunikacji
    - Zakazane kompromisy: ✅ Żaden nie złamany
    - Dozwolone kompromisy zastosowane: [lista]

    ### Dług techniczny
    [liczba wpisów w TECH_DEBT.md]
    [lista najważniejszych z priorytetem]

    ### Estymacja
    - Optymistyczny: [X dni]
    - PERT: [Y dni]
    - Pesymistyczny: [Z dni]

#### Przekazanie do Playbooka

**(ID: PRAG-20)** Strategia Pragmatyczna kończy pracę.

Artefakty wygenerowane przez strategię:

    docs/CONTEXT.md  — zaktualizowany (stos, rewizja kodu)
    docs/MODULES.md  — dekompozycja systemu z warstwami IDesign
    docs/TECH_DEBT.md — jeśli istnieje

Agent przekazuje kontrolę do AI Architecture Agent Playbook.
Playbook przejmuje od Bloku 0 — Orientacja.

### Checklista

    - [ ] Zasady komunikacji zweryfikowane (zakazane kompromisy nienaruszone)
    - [ ] Podsumowanie zaprezentowane użytkownikowi
    - [ ] Użytkownik zaakceptował podsumowanie
    - [ ] Kontrola przekazana do Playbooka

### Wyjście
Brak nowych artefaktów.
Strategia w stanie ZAKOŃCZONA.
Dalsze kroki (walidacja, tickety, handoff) realizuje Playbook.

<!-- POINT:6 END -->