---
description: Bramka wejściowa dla backendu. Zbiera kontekst projektu, mapuje ścieżki użytkownika, kieruje agenta do wyboru strategii. NIE MODYFIKUJ tego pliku.
---

# 🚪 PROJECT_GATE.md

> Wersja: v1.6 (do v1.2 włącznie plik nosił nazwę BACKEND_GATE.md)

> ⛔ **TEN PLIK JEST NIEZMIENNY.** Agent NIE MOŻE go modyfikować ani nadpisywać.
> Jedyne pliki które agent TWORZY to artefakty w folderze `docs/`.

---

## Spis Treści

* [Moduł: Cel i Zakres](#moduł-cel-i-zakres)
* [Moduł: Reguły Pracy Agenta](#moduł-reguły-pracy-agenta)
* [Moduł: Zbieranie Kontekstu](#moduł-zbieranie-kontekstu)
* [Moduł: Ścieżki i Funkcjonalności](#moduł-ścieżki-i-funkcjonalności)
* [Moduł: Wybór Strategii](#moduł-wybór-strategii)
* [Moduł: Przekierowanie](#moduł-przekierowanie)
* [Moduł: Reguły Wytwórcze](#moduł-reguły-wytwórcze)
* [Moduł: Przekazanie do AI Architecture Agent](#moduł-przekazanie-do-ai-architecture-agent)

---

<!-- MODULE:ARTEFAKTY START -->
## Moduł: Cykl Życia Artefaktów

Poniżej pełna lista artefaktów które agent tworzy i aktualizuje
w trakcie pracy z PROJECT_GATE.

### docs/CONTEXT.md

| Krok | Co się dzieje |
|------|---------------|
| CTX-07 | TWORZONY — podstawowy kontekst projektu (P1-P6) |
| PATH-10 | AKTUALIZOWANY — ścieżki użytkownika, tabela funkcjonalności, P7, P8 |
| STRAT-04 | AKTUALIZOWANY — wybrana strategia |
| REDIR-03 | AKTUALIZOWANY — gdy użytkownik zmienia ustalenia w trakcie projektu |

### docs/TECH_DEBT.md

| Krok | Co się dzieje |
|------|---------------|
| PATH-11 | TWORZONY — jeśli tabela funkcjonalności zawiera uproszczenia |
| PROD-05 | AKTUALIZOWANY — gdy agent odkryje nowe uproszczenie w trakcie implementacji |

### docs/CUSTOM_WORKFLOW.md

| Krok | Co się dzieje |
|------|---------------|
| STRAT-02 | TWORZONY — tylko gdy żadna strategia nie pasuje |

<!-- MODULE:ARTEFAKTY END -->

<!-- MODULE:CEL START -->
## Moduł: Cel i Zakres

**(ID: GATE-00)** Agent AI NIE MOŻE pisać kodu backendowego bez przejścia
przez procedurę opisaną w tym pliku. Procedura składa się z kroków:
zebranie kontekstu → zmapowanie ścieżek i funkcjonalności →
wybór strategii → przekierowanie do pliku strategii →
przekazanie do AI Architecture Agent Playbook.

<!-- MODULE:CEL END -->

---

<!-- MODULE:REGULY_AGENTA START -->
## Moduł: Reguły Pracy Agenta

### A. Kolejność

**(ID: AGENT-01)** ZABRONIONE jest pisanie kodu na JAKIMKOLWIEK
etapie tego workflow — PROJECT_GATE, plik strategii, Playbook.

Produktem końcowym tego workflow są tickety (pliki .md)
gotowe do przekazania coding agentowi.

Kod pisze coding agent na podstawie ticketów.
Nie ten workflow.

**(ID: AGENT-02)** ZABRONIONE jest otwieranie pliku strategii
lub pliku STRATEGY_MAP.md przed ukończeniem modułu
„Ścieżki i Funkcjonalności".

### B. Ładowanie strategii — zasada „punkt po punkcie"

**(ID: AGENT-03)** Po wybraniu strategii agent pracuje z DWOMA
plikami z folderu `.agent/strategies/`:

    _COMMON.md              — Punkty 1-2 (wspólne dla strategii)
    [WYBRANA_STRATEGIA].md  — Punkty 3 i dalsze

Sposób pracy jest ten sam dla obu:

    1. Załaduj do kontekstu TYLKO punkt nr 1 (z _COMMON.md).
    2. Wykonaj go. Odhacz checklistę.
    3. Zapomnij punkt 1.
    4. Załaduj punkt nr 2 (z _COMMON.md).
    5. Wykonaj. Odhacz. Zapomnij.
    6. Załaduj punkt nr 3 — już z pliku wybranej strategii.
    7. ...aż do ostatniego punktu tego pliku.

Plik `_COMMON.md` zawiera fragmenty oznaczone
`[TYLKO MODULAR_MONOLITH]` — agent wykonuje je wyłącznie wtedy,
gdy wybraną strategią jest Modularny Monolit.

**(ID: AGENT-04)** ZABRONIONE jest ładowanie wielu punktów naraz.
ZABRONIONE jest przeskakiwanie punktów.

### C. Pytania

**(ID: AGENT-05)** Jeśli odpowiedź na którekolwiek pytanie
z modułów „Zbieranie Kontekstu" lub „Ścieżki i Funkcjonalności"
jest nieznana — agent MUSI zapytać użytkownika.
ZABRONIONE jest zgadywanie lub przyjmowanie domyślnych wartości
bez potwierdzenia użytkownika.

Jeśli użytkownik nie ma zdania na dany temat —
agent proponuje rozsądne wyjście z uzasadnieniem
i czeka na akceptację przed kontynuowaniem.

### D. Artefakty

**(ID: AGENT-06)** Każdy punkt który mówi „UTWÓRZ artefakt"
lub „AKTUALIZUJ artefakt" jest OBOWIĄZKOWY. Agent NIE MOŻE
przejść dalej bez utworzenia lub aktualizacji wskazanego pliku
w folderze `docs/`.

Artefakt = plik który agent TWORZY lub AKTUALIZUJE
w folderze `docs/` w trakcie pracy. Artefakty służą jako
pamięć agenta między punktami — bez nich agent traci
kontekst ustalony we wcześniejszych punktach.

<!-- MODULE:REGULY_AGENTA END -->

---

<!-- MODULE:KONTEKST START -->
## Moduł: Zbieranie Kontekstu

**(ID: CTX-00)** Agent zadaje użytkownikowi poniższe pytania.
Jeśli odpowiedź jest już w konwersacji — agent wyciąga ją sam
i NIE pyta ponownie. Jeśli brakuje choćby jednej — MUSI zapytać.

Jeśli użytkownik nie dostarczył żadnego kontekstu — agent
zadaje najpierw pytanie zbiorcze:

    "Zanim przejdę do szczegółów, potrzebuję podstawowego
     kontekstu. Opisz w kilku zdaniach:

     1. Co system robi (jaki problem rozwiązuje)?
     2. Kto z niego korzysta?

     Resztę doprecyzujemy krok po kroku."

### Checklist kontekstu

**(ID: CTX-01)** Problem biznesowy:
- [ ] Jaki problem biznesowy rozwiązujemy? (zapisz jako P1)

**(ID: CTX-02)** Użytkownik końcowy:
- [ ] Kto jest użytkownikiem końcowym? Wylistuj typy użytkowników.
      (zapisz jako P2)

**(ID: CTX-03)** Budżet czasowy:
- [ ] Ile czasu jest na realizację? dni / tygodnie / miesiące
      (zapisz jako P3)

**(ID: CTX-04)** Zespół:
- [ ] Ile osób? 1 osoba / mały zespół / duży zespół
      (zapisz jako P4)

**(ID: CTX-05)** Istniejący kod:
- [ ] Określ:
  - `Nowy projekt` — brak istniejącego kodu, zaczynamy od zera
  - `Istniejący kod` — istnieje kod (opisz krótko co istnieje)
  (zapisz jako P5)

**(ID: CTX-06)** Technologie:
- [ ] Jakie technologie zespół ZNA lub PREFERUJE?
      Czy są twarde wymagania co do stacku (np. narzucone
      przez klienta)? Jeśli brak — zapisz "brak preferencji".
      (zapisz jako P6)

P6 jest zapisem znajomości i preferencji zespołu.
P6 NIE jest nadpisywane finalnym stackiem — finalny stack
dobiera Punkt 1 wybranej strategii i zapisuje go WYŁĄCZNIE
w sekcji "Stos Technologiczny" w docs/CONTEXT.md.

**(ID: CTX-06B)** Horyzont rozwoju:
- [ ] Jak długo system ma być rozwijany po pierwszej wersji?
  - `Jednorazowy prototyp` — po v1 brak planu rozwoju
  - `Krótko` — rozwój do ~6 miesięcy
  - `Długoterminowo` — 6+ miesięcy / lata
  (zapisz jako P9)

**(ID: CTX-07)** Gdy WSZYSTKIE checkboxy odhaczone — UTWÓRZ plik
`docs/CONTEXT.md` wg poniższego szablonu.
Przejdź do modułu „Ścieżki i Funkcjonalności".

    # Kontekst Projektu

    ## Problem Biznesowy
    [P1]

    ## Użytkownicy Końcowi
    [P2 — lista typów użytkowników]

    ## Budżet Czasowy
    [P3]

    ## Zespół
    [P4]

    ## Istniejący Kod
    [P5: Nowy projekt / Istniejący kod + opis]

    ## Technologie
    [P6: znajomość/preferencje zespołu lub "brak preferencji"]

    ## Horyzont Rozwoju
    [P9: Jednorazowy prototyp / Krótko / Długoterminowo]

<!-- MODULE:KONTEKST END -->

---

<!-- MODULE:SCIEZKI START -->
## Moduł: Ścieżki i Funkcjonalności

### A. Ścieżki użytkownika

**(ID: PATH-01)** Agent prosi użytkownika o opisanie ścieżek
dla KAŻDEGO typu użytkownika wymienionego w P2:

    "Opisz krok po kroku co robi [typ użytkownika]
     w Twoim systemie. Od początku do końca."

Agent zbiera ścieżki dla wszystkich typów.
Jeśli użytkownik opisał ścieżki w konwersacji wcześniej —
agent wyciąga je sam i prezentuje do potwierdzenia.

### B. Lista funkcjonalności

**(ID: PATH-02)** Agent rozbija ścieżki na listę FUNKCJONALNOŚCI.
Każda funkcjonalność dostaje ID (F01, F02, F03...).
Agent prezentuje listę użytkownikowi:

    Wyciągnąłem z Twoich ścieżek następujące funkcjonalności:

    F01: [nazwa] — [krótki opis]
    F02: [nazwa] — [krótki opis]
    F03: [nazwa] — [krótki opis]
    ...

    Czy lista jest kompletna? Chcesz coś dodać lub usunąć?

Agent CZEKA na akceptację listy.

### C. Podział na wersje

**(ID: PATH-03)** Agent pyta:

    "Które funkcjonalności MUSZĄ działać w pierwszej wersji (v1)?
     Które mogą poczekać na później?"

Jeśli użytkownik nie wie — agent proponuje rozsądny podział
biorąc pod uwagę budżet czasowy (P3) i wielkość zespołu (P4).
Propozycja MUSI zawierać uzasadnienie.

Agent prezentuje podział do akceptacji.

### D. Ocena implementacji funkcjonalności v1

**(ID: PATH-04)** Dla KAŻDEJ funkcjonalności oznaczonej jako v1
agent ocenia czy można ją zaimplementować w wersji UPROSZCZONEJ.

Agent pyta użytkownika:

    "Dla każdej funkcjonalności v1 — czy masz pomysł
     jak uprościć implementację na start?
     Np. 'upload pliku — w MVP plik z dysku lokalnie,
     bez chmury'.
     Jeśli nie masz pomysłu — zaproponuję sam."

**(ID: PATH-05)** Agent zbiera propozycje użytkownika.

- Jeśli użytkownik MA pomysł — agent ocenia go
  i MOŻE zaproponować ulepszenie:

      "Twój pomysł: plik z dysku lokalnie.
       Moja sugestia: local storage + interfejs abstrakcji,
       dzięki czemu podmiana na S3 to zmiana 1 pliku zamiast 5.
       Koszt odkręcenia spada z ~3 dni do ~0.5 dnia.
       Akceptujesz moją wersję czy wolisz swoją?"

- Jeśli użytkownik NIE MA pomysłu — agent proponuje
  uproszczenie sam (jeśli widzi taką możliwość).

- Jeśli agent nie widzi sensownego uproszczenia —
  funkcjonalność idzie jako implementacja pełna.

Dla KAŻDEGO uproszczenia (własnego lub użytkownika)
agent MUSI ocenić:
- Co uproszczenie pomija
- Koszt odkręcenia (czas + liczba plików do zmiany
  + opis co trzeba zrobić)
- Ryzyko (co może pójść nie tak w międzyczasie)

**(ID: PATH-06)** Agent prezentuje ZBIORCZĄ tabelę do akceptacji:

    | ID  | Nazwa | Typ użytkownika | Wersja | Implementacja | Uproszczenie | Koszt odkręcenia | Ryzyko |
    |-----|-------|-----------------|--------|---------------|-------------|-----------------|--------|
    | F01 | ...   | Klient          | v1     | pełna         | —           | —               | —      |
    | F02 | ...   | Klient          | v1     | uproszczona   | [opis]      | [czas, pliki]   | [opis] |
    | F03 | ...   | Restaurator     | później| —             | —           | —               | —      |

    Zaakceptuj lub zmień dowolną rekomendację.

Agent CZEKA na akceptację tabeli.
Ta tabela jest WIĄŻĄCA na cały projekt.
Agent NIE PYTA ponownie o uproszczenia w trakcie implementacji —
realizuje ustalenia z tej tabeli.

Jeśli użytkownik PRZERWIE proces i zasugeruje zmianę —
agent aktualizuje tabelę i ponownie prezentuje do akceptacji.

### E. Automatyczna klasyfikacja

**(ID: PATH-07)** Agent WYLICZA typ projektu (P7 — wyliczony).

Sygnał podstawowy:

- Istnieje lista "później" (funkcjonalności poza v1)? → `MVP`
- Brak listy "później" (wszystko w v1)? → `Produkt`

Sam ten sygnał NIE wystarcza — mały projekt dostarczany w całości
za jednym razem nie jest Produktem. Agent weryfikuje wynik
sygnałami korygującymi (kolejność wiążąca):

    1. P9 = Jednorazowy prototyp → P7 = `MVP` bezwarunkowo.
       (Brak listy "później" w projekcie bez planu rozwoju
       nie czyni z niego Produktu.)

    2. P9 = Krótko (rozwój do ~6 miesięcy) → P7 = `MVP`,
       nawet gdy cały zakres jest w v1.

    3. Wstępny wynik `Produkt` wymaga POTWIERDZENIA co najmniej
       dwoma z poniższych. Jeśli spełniony jest najwyżej jeden —
       P7 = `MVP`:
       - P9 = Długoterminowo,
       - więcej niż jeden typ użytkownika (P2),
       - system ma realnych użytkowników zewnętrznych
         (nie tylko autora / zespołu),
       - P3 (budżet czasowy) liczony w miesiącach, nie dniach,
       - v1 zawiera funkcjonalność, której awaria ma
         konsekwencje biznesowe (płatności, dane klientów,
         zobowiązania wobec kontrahenta).

Wynik P7 wpływa na ciężar stacku (STACK_DEFAULTS) i na filtrowanie
strategii — zawyżony `Produkt` kosztuje projekt tygodnie.
W uzasadnieniu (PATH-09) agent wymienia sygnały, które zdecydowały.

P5 (istniejący kod) to OSOBNA informacja.
"Istniejący kod" współistnieje z typem: np. „Istniejący kod + MVP"
oznacza rozbudowę istniejącego systemu z podziałem na fazy.

**(ID: PATH-08)** Agent WYLICZA złożoność biznesową
(P8 — wyliczony) na podstawie całościowej oceny funkcjonalności v1.

Agent bierze pod uwagę liczbę i różnorodność typów użytkowników,
obecność procesów wieloetapowych, integracje z systemami
zewnętrznymi oraz zależności między funkcjonalnościami.

Na tej podstawie agent przypisuje jedną z wartości:
Niska / Średnia / Wysoka.

Wartości P7 i P8 są SŁOWAMI KLUCZOWYMI — reguły dopasowania
w STRATEGY_MAP.md porównują je dosłownie. Agent zapisuje je
w docs/CONTEXT.md dokładnie w tej pisowni (z polskimi znakami),
bez synonimów ("umiarkowana", "duża") i bez wariantów fleksyjnych.
Opis słowny i niuanse idą do uzasadnienia, nie do wartości.

**(ID: PATH-09)** Agent ogłasza wyniki klasyfikacji:

    "Na podstawie funkcjonalności v1 oceniam:
     Typ projektu: [P7 — MVP / Produkt]
     Złożoność biznesowa: [P8 — Niska / Średnia / Wysoka]

     Uzasadnienie: [krótki opis co wpłynęło na ocenę]

     Akceptujesz?"

Agent CZEKA na akceptację.

### F. Stack Technologiczny — delegacja

**(ID: PATH-12)** Dobór stacku technologicznego NIE odbywa się
w PROJECT_GATE. Wykonuje go Punkt 1 wybranej strategii
(reguły Boring Technology + `.agent/STACK_DEFAULTS.md`),
z akceptacją użytkownika.

Agent na tym etapie NIE proponuje stacku i NIE modyfikuje P6.
Jedynym źródłem prawdy o finalnym stacku jest sekcja
"Stos Technologiczny" w docs/CONTEXT.md, tworzona przez strategię.

### G. Artefakt

**(ID: PATH-10)** Agent AKTUALIZUJE plik `docs/CONTEXT.md`
(utworzony w CTX-07) dodając sekcje:

    ## Ścieżki Użytkownika

    ### [Typ użytkownika 1]
    [krok 1] → [krok 2] → [krok 3] → ...

    ### [Typ użytkownika 2]
    [krok 1] → [krok 2] → ...

    ## Funkcjonalności

    | ID  | Nazwa | Typ użytkownika | Wersja | Implementacja | Uproszczenie | Koszt odkręcenia | Ryzyko |
    |-----|-------|-----------------|--------|---------------|-------------|-----------------|--------|
    | F01 | ...   | ...             | v1     | pełna         | —           | —               | —      |
    | F02 | ...   | ...             | v1     | uproszczona   | [opis]      | [czas, pliki]   | [opis] |
    | F03 | ...   | ...             | później| —             | —           | —               | —      |

    ## Typ Projektu (wyliczony)
    [P7: MVP / Produkt + uzasadnienie]

    ## Złożoność Biznesowa (wyliczona)
    [P8: Niska / Średnia / Wysoka + uzasadnienie]

    (Sekcję "Stos Technologiczny" doda Punkt 1 wybranej strategii.)

**(ID: PATH-11)** Jeśli tabela zawiera JAKIEKOLWIEK funkcjonalności
z implementacją „uproszczona" — agent TWORZY plik `docs/TECH_DEBT.md`:

    # Dług Techniczny

    > Ten plik jest generowany automatycznie.
    > Agent aktualizuje go w trakcie implementacji.

    ## Uproszczenia z tabeli funkcjonalności

    | ID     | Funkcjonalność | Co uproszczono | Co pomija | Koszt odkręcenia | Ryzyko | Plan naprawy | Gdzie (plik:linia) |
    |--------|---------------|----------------|-----------|-----------------|--------|-------------|-------------------|
    | TD-001 | F02 — [nazwa] | [opis]         | [lista]   | [czas, pliki]   | [opis] | [kroki]     | —                  |

    Kolumna „Gdzie (plik:linia)" zostanie uzupełniona
    w trakcie implementacji gdy agent utworzy konkretne pliki.

Przejdź do modułu „Wybór Strategii".

<!-- MODULE:SCIEZKI END -->

---

<!-- MODULE:WYBOR_STRATEGII START -->
## Moduł: Wybór Strategii

**(ID: STRAT-01)** Agent otwiera plik `.agent/STRATEGY_MAP.md`.
Plik zawiera metadane wszystkich dostępnych strategii
oraz reguły dopasowania.

**(ID: STRAT-02)** Agent stosuje reguły dopasowania
z pliku STRATEGY_MAP.md używając wartości P7 i P8
z `docs/CONTEXT.md` oraz tabeli funkcjonalności.

Jeśli żadna strategia nie pasuje — agent nie blokuje procesu.
Samodzielnie projektuje dedykowany workflow na podstawie
całego kontekstu z `docs/CONTEXT.md` i zapisuje go
w `docs/CUSTOM_WORKFLOW.md`.

**(ID: STRAT-03)** Po wybraniu strategii agent ogłasza
użytkownikowi:

    "Na podstawie kontekstu wybieram strategię: [strategy_name].
     Powód: [1-2 zdania odwołujące się do P7, P8
     i tabeli funkcjonalności].
     Plik: [nazwa pliku].
     Czy akceptujesz?"

Agent CZEKA na akceptację. Bez akceptacji nie przechodzi dalej.

**(ID: STRAT-04)** Po akceptacji strategii agent AKTUALIZUJE
`docs/CONTEXT.md` dodając sekcję:

    ## Wybrana Strategia
    Nazwa: [strategy_name]
    Plik: [nazwa pliku]
    Powód wyboru: [uzasadnienie]

<!-- MODULE:WYBOR_STRATEGII END -->

---

<!-- MODULE:PRZEKIEROWANIE START -->
## Moduł: Przekierowanie

**(ID: REDIR-01)** Po akceptacji użytkownika agent:

    1. Otwiera .agent/strategies/_COMMON.md
    2. Ładuje TYLKO punkt nr 1 z tego pliku.
    3. Rozpoczyna pracę „punkt po punkcie" (reguła AGENT-03),
       przechodząc po punkcie 2 do pliku wybranej strategii
       i jego punktu 3.

**(ID: REDIR-02)** Od tego momentu agent zachowuje w kontekście:
- Reguły Wytwórcze z tego pliku (ID: PROD-02 do PROD-05)
- Moduł „Przekazanie do AI Architecture Agent" (HANDOFF-01) —
  potrzebny po ostatnim punkcie strategii
- Reguły REDIR-03 (zmiana ustaleń w trakcie projektu)
- Tabelę funkcjonalności z `docs/CONTEXT.md`
- Plik `docs/TECH_DEBT.md` (jeśli istnieje)

Pozostałe moduły PROJECT_GATE (Cel i Zakres, Zbieranie Kontekstu,
Ścieżki i Funkcjonalności, Wybór Strategii) są już wykonane
i mogą być usunięte z aktywnego kontekstu.

**(ID: REDIR-03)** Zmiana ustaleń w trakcie projektu:

Jeśli użytkownik PRZERWIE proces i zasugeruje zmianę —
agent:

    1. ZATRZYMUJE bieżącą pracę.
    2. Otwiera docs/CONTEXT.md.
    3. Aktualizuje zmienione elementy.
    4. Prezentuje zaktualizowaną tabelę funkcjonalności
       do akceptacji.
    5. Jeśli zmieniło się P7 lub P8 — otwiera STRATEGY_MAP.md
       i ponownie przechodzi przez dopasowanie strategii.
    6. Jeśli P7 i P8 bez zmian — kontynuuje bieżącą strategię
       od miejsca gdzie przerwał.

<!-- MODULE:PRZEKIEROWANIE END -->

---

<!-- MODULE:REGULY_WYTWORCE START -->
## Moduł: Reguły Wytwórcze

**(ID: PROD-00)** Poniższe reguły obowiązują przez CAŁY projekt,
niezależnie od wybranej strategii i aktualnie wykonywanego punktu.
Agent MUSI je zachować w kontekście trwale.

### A. Technologia

**(ID: PROD-02)** Stack technologiczny jest dobierany
WYŁĄCZNIE w Punkcie 1 wybranej strategii (patrz PATH-12).
Żaden inny moduł nie proponuje stacku.

Zasady doboru (obowiązują strategię):
- kontekst projektu — problem biznesowy, typ użytkowników,
  złożoność i funkcjonalności v1,
- P6 (znajomość/preferencje zespołu) jako punkt wyjścia,
- przy braku preferencji — kryteria Boring Technology
  i `.agent/STACK_DEFAULTS.md`.

**(ID: PROD-03)** ZABRONIONE jest proponowanie frameworków
w wersji beta, RC lub pre-release jako fundamentu projektu.

### B. Architektura

**(ID: PROD-04)** Domyślną architekturą jest monolit.
Agent proponuje bardziej złożoną architekturę tylko wtedy
gdy złożoność i skala projektu tego wyraźnie wymagają
i gdy jest to uzasadnione kontekstem zespołu i projektu.

### C. Uproszczenia

**(ID: PROD-05)** Wszystkie decyzje o uproszczeniach
są podejmowane w module „Ścieżki i Funkcjonalności"
i zapisane w tabeli funkcjonalności w `docs/CONTEXT.md`.

Agent realizuje ustalenia z tabeli. NIE PYTA ponownie
o uproszczenia w trakcie implementacji.

Jeśli w trakcie implementacji agent odkryje NOWĄ potrzebę
uproszczenia — agent MUSI:

    1. ZATRZYMAĆ implementację.
    2. Opisać uproszczenie: co pomija, koszt odkręcenia, ryzyko.
    3. Zapytać użytkownika o zgodę.
    4. Po akceptacji — zaktualizować tabelę w docs/CONTEXT.md
       i dodać wpis do docs/TECH_DEBT.md.

<!-- MODULE:REGULY_WYTWORCE END -->

---

<!-- MODULE:HANDOFF START -->
## Moduł: Przekazanie do AI Architecture Agent

**(ID: HANDOFF-01)** Po zakończeniu pracy przez plik strategii
agent otwiera i stosuje zasady z pliku:

    AI_Architecture_Agent_Playbook.md

Playbook pełni rolę końcowego weryfikatora.
Stosuje tylko te fazy które nie zostały wykonane
przez PROJECT_GATE i plik strategii.
Agent ocenia które fazy są już pokryte
na podstawie dostępnych artefaktów w `docs/`.

Kontekst przekazywany do Playbooka:
- `docs/CONTEXT.md` (P1-P9, tabela funkcjonalności, stos technologiczny)
- `docs/TECH_DEBT.md` (jeśli istnieje)
- Wybrana strategia (nazwa + plik)
- Artefakty wygenerowane przez plik strategii

<!-- MODULE:HANDOFF END -->