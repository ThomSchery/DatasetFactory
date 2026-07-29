---
description: Prompty startowe dla agenta. Ten plik jest dla CZŁOWIEKA — kopiujesz z niego prompt do pierwszej wiadomości. Agent nie czyta tego pliku w ramach workflow.
---

# 🚀 BOOTSTRAP.md — jak uruchomić agenta z tym zestawem

> Gubisz się w plikach? Mapa całego zestawu (kolejność kroków,
> odpowiedzialność plików, punkty wpięcia frontendu): `README.md`.

> Zasada: nie streszczaj agentowi procesu. Wskaż punkt wejścia
> (PROJECT_GATE.md) i podaj kontekst P1–P6, P9. Reszta jest w plikach.
>
> Nie każ agentowi czytać całego `.agent/` na start — zestaw działa
> "lazy": GATE wskazuje kiedy otworzyć STRATEGY_MAP, strategię
> (punkt po punkcie) i Playbook.

---

## Prompt 1 — start nowego projektu

Skopiuj, uzupełnij sekcję KONTEKST STARTOWY, wyślij jako pierwszą
wiadomość:

    Jesteś agentem realizującym workflow projektowy z folderu .agent/.

    ZASADY NADRZĘDNE (obowiązują do końca pracy):
    1. Twoim podręcznikiem procesu jest .agent/PROJECT_GATE.md.
       Otwórz go TERAZ i wykonuj moduł po module.
    2. Nie czytaj na start pozostałych plików .agent/ — PROJECT_GATE
       wskaże Ci, kiedy otworzyć STRATEGY_MAP.md, plik strategii
       i Playbook. Plik strategii ładuj PUNKT PO PUNKCIE (AGENT-03),
       nigdy w całości.
    3. Nie piszesz kodu (AGENT-01). Twoim produktem są artefakty
       w docs/ i finalnie tickety.
    4. Każde "UTWÓRZ/AKTUALIZUJ artefakt" jest obowiązkowe (AGENT-06) —
       pliki w docs/ są Twoją pamięcią między punktami.
    5. Czego nie wiesz — pytasz mnie (AGENT-05), jedno pytanie na raz.
       Tam, gdzie procedura wymaga akceptacji — CZEKASZ na nią.
    6. Plików dostarczonych w paczce .agent/ nie modyfikujesz.
       Wyjątek: pliki, które workflow każe utworzyć lub uzupełniać —
       tworzy je CODING AGENT z ticketu, nie agent architektury:
       - .agent/guidelines/new-component.md (z szablonu; później
         rosną tylko sekcje katalogu i definicji komponentów),
       - .agent/guidelines/[framework]-module-composition.md
         (MMOD-23A, gdy strategia = Modularny Monolit).

    KONTEKST STARTOWY (P1–P6, P9):
    - Problem, który system rozwiązuje: [...]
    - Użytkownicy końcowi (typy): [...]
    - Budżet czasowy: [...]
    - Zespół: [...]
    - Istniejący kod: [Nowy projekt / Istniejący kod + krótki opis]
    - Technologie, które zespół zna/preferuje: [... / brak preferencji]
    - Horyzont rozwoju po v1: [Jednorazowy prototyp / Krótko /
      Długoterminowo]

    Zacznij od modułu "Zbieranie Kontekstu". Jeśli któraś odpowiedź
    powyżej jest niepełna — dopytaj, zanim utworzysz docs/CONTEXT.md.

---

## Prompt 2 — wznowienie pracy (nowa sesja w projekcie w toku)

    Kontynuujemy projekt prowadzony wg .agent/. Zanim cokolwiek zrobisz:
    1. Odczytaj docs/CONTEXT.md (w tym sekcję "Wybrana Strategia")
       i wylistuj pozostałe artefakty w docs/ (łącznie z docs/tickets/).
    2. Ustal, gdzie jest praca:
       - są pliki Playbooka (EPIC_BRIEF / CORE_FLOWS / TECH_PLAN /
         SCALE / tickets/ / HANDOFF)? → wznawiasz PLAYBOOKA:
         wykonaj Blok 0, KROK 3B (mapowanie artefakt → faza).
       - nie ma ich? → wznawiasz STRATEGIĘ: porównaj sekcje
         "Wyjście" punktów strategii z zawartością docs/
         (Blok 0, KROK 3) i kontynuuj punkt po punkcie.
    3. Zadeklaruj punkt startowy (punkt strategii albo faza Playbooka
       + konkretna pozycja) i kontynuuj od niego.
    Nie pytaj ponownie o decyzje zapisane w artefaktach —
    także o te zapisane przez Ciebie w poprzedniej sesji.
    Obowiązują reguły: AGENT-01 (zero kodu), AGENT-03 (punkt po
    punkcie), AGENT-05 (pytaj przy lukach), AGENT-06 (artefakty
    obowiązkowe).

---

## Wariant dla Claude Code / Codex (stała konfiguracja repo)

Zamiast wklejać prompt co sesję, dodaj do `CLAUDE.md` / `AGENTS.md`
w rootcie repo:

    # Workflow projektowy
    Praca nad architekturą backendu przebiega WYŁĄCZNIE przez
    .agent/PROJECT_GATE.md (moduł po module; strategia punkt po
    punkcie). Zakazy: pisanie kodu w tym workflow, pomijanie
    artefaktów w docs/, modyfikowanie plików .agent/.
    Przy wznowieniu: najpierw docs/CONTEXT.md i ocena postępu
    strategii na podstawie artefaktów.

---

## Ścieżka frontendowa

Gdy projekt zawiera UI:

1. Decyzje architektoniczne frontendu (framework — domyślnie React,
   ale NIEKONIECZNIE; stan, routing, formularze, testy...) zamyka
   Playbook w Fazie 1 wg
   `.agent/guidelines/frontend-decisions-checklist.md`.
2. System spójnego designu bootstrapuje CODING AGENT (RAZ,
   w ramach pierwszego ticketu UI) wg
   `.agent/guidelines/frontend-design-workflow.md`.
   Agent architektury tylko tworzy taki ticket — sam nie pisze
   kodu. Plik wytycznych UI/UX v3 jest w guidelines/ paczki.

Do promptu startowego dodaj wtedy linię:

    Projekt ma frontend: decyzje FE wg
    .agent/guidelines/frontend-decisions-checklist.md (Faza 1
    Playbooka), design system wg
    .agent/guidelines/frontend-design-workflow.md.

---

## Uwagi

- Reguła "nie modyfikuj .agent/" dotyczy projektów startujących
  z tej paczki. Projekt, który ma własną konstytucję
  (np. `.agent/main.md` nakazujący aktualizację guideline'ów
  razem z kodem), rządzi się swoimi zasadami — tam tych promptów
  nie używaj.
- Podanie P1–P6 i P9 w pierwszej wiadomości nie pomija procedury:
  CTX-00 każe agentowi wyciągnąć odpowiedzi z rozmowy i nie pytać
  ponownie — oszczędzasz jedną pełną rundę pytań.
