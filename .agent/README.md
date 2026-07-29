---
description: Mapa zestawu — kto za co odpowiada i w jakiej kolejności. Punkt wejścia dla CZŁOWIEKA. Agent czyta ten plik tylko na wyraźne polecenie.
version: "1.0"
---

# 🗺️ README — mapa zestawu .agent/

> Jedno wejście, jeden pipeline. Frontend NIE ma osobnego gate'u —
> jest odgałęzieniem wspólnego przepływu (kontekst projektu:
> problem, użytkownicy, ścieżki, funkcjonalności — jest jeden
> i wspólny dla obu warstw).

---

## Legenda

    Nazwy bez ścieżki / .agent/...  → pliki DOSTARCZONE w paczce
                                      (agent je tylko czyta)
    → docs/...                      → artefakty TWORZONE/AKTUALIZOWANE
                                      przez agenta W TRAKCIE pracy
                                      (są jego pamięcią między krokami)

Wyjątki (pliki tworzone w projekcie przez CODING AGENTA z ticketu):
new-component.md — z szablonu new-component.TEMPLATE.md (ticket
FE-SETUP); [framework]-module-composition.md — przy strategii
Modularny Monolit (MMOD-23A).

## Oś czasu — kto, co, kiedy

```
 TY (człowiek)
 └─ 0. BOOTSTRAP.md → kopiujesz prompt startowy + kontekst P1-P6, P9
        │
 AGENT ARCHITEKTURY (nie pisze kodu)
        ▼
 ETAP 1: PROJECT_GATE.md  ................. brama projektu
 ├─ Kontekst (P1-P6, P9)         → docs/CONTEXT.md
 ├─ Ścieżki i funkcjonalności    → tabela funkcjonalności, P7, P8
 │    └─ uproszczenia            → docs/TECH_DEBT.md
 ├─ Wybór strategii              → czyta STRATEGY_MAP.md
 │    └─ brak dopasowania?       → docs/CUSTOM_WORKFLOW.md
 └─ handoff do strategii
        ▼
 ETAP 2a: strategies/_COMMON.md  .......... punkty wspólne
 ├─ Punkt 1: stack               → STACK_DEFAULTS.md (fallback)
 │                               → CONTEXT.md: "Stos Technologiczny"
 └─ Punkt 2: istniejący kod      → class-responsibility-review.md
                                 → llm-boundary-review.md (flow AI)
        ▼
 ETAP 2b: strategies/[WYBRANA].md  ........ architektura właściwa
 │       (ładowana PUNKT PO PUNKCIE, nigdy w całości)
 └─ Punkty 3+                    → artefakty strategii w docs/
        ▼
 ETAP 3: AI_Architecture_Agent_Playbook.md  ... domknięcie
 ├─ Blok 0: orientacja (co już zrobiono — czyta docs/)
 │    └─ KROK 3B: wznowienie własnej pracy (artefakt → faza)
 ├─ Faza 1: Discovery
 │    ├─ nfr-checklist.md                    ← ZAWSZE
 │    └─ frontend-decisions-checklist.md     ← gdy projekt ma UI
 ├─ Faza 2: artefakty → docs/EPIC_BRIEF.md, CORE_FLOWS.md,
 │                       TECH_PLAN.md, SCALE.md
 ├─ Faza 3: walidacja (stress-test, spójność, reguły strategii)
 ├─ Faza 4: TICKETY → docs/tickets/ + INDEX.md
 │                    (+ ticket FE-SETUP, gdy projekt ma UI)
 └─ Faza 5: handoff → docs/HANDOFF.md dla coding agenta
        │
 CODING AGENT (pisze kod — POZA tym workflow)
        ▼
 ETAP 4: implementacja z ticketów
 ├─ ticket FE-SETUP → wykonuje frontend-design-workflow.md
 │    (tworzy: tailwind.config.js, src/AGENTS.md,
 │     new-component.md z new-component.TEMPLATE.md, Button)
 ├─ każda praca z UI → new-component.md → tokeny + moduły
 │     z _agent_oriented_guidelines_final_UI_UX_v3.md
 ├─ standardy → react-coding-standards.md
 └─ każde uproszczenie → aktualizuje docs/TECH_DEBT.md
```

---

## Odpowiedzialność plików

### Rdzeń pipeline'u (kolejność wykonania)

| # | Plik | Odpowiada za | Uruchamia |
|---|------|--------------|-----------|
| 0 | BOOTSTRAP.md | prompty startowe | człowiek |
| 1 | PROJECT_GATE.md | kontekst projektu, uproszczenia, wybór strategii | prompt startowy |
| 2 | STRATEGY_MAP.md | reguły dopasowania strategii | GATE (moduł Wybór Strategii) |
| 3 | strategies/PRAGMATIC.md | architektura: proste warstwy (IDesign) | GATE po wyborze |
| 3 | strategies/MODULAR_MONOLITH.md | architektura: moduły, DDD | GATE po wyborze |
| 4 | AI_Architecture_Agent_Playbook.md | discovery luk, walidacja, tickety, handoff | strategia po ostatnim punkcie |

### Pliki wspierające (wołane z rdzenia)

| Plik | Odpowiada za | Woła go |
|------|--------------|---------|
| strategies/_COMMON.md | Punkty 1-2 wspólne dla strategii: dobór technologii, ocena istniejącego kodu | GATE po wyborze (REDIR-01), przed plikiem strategii |
| STACK_DEFAULTS.md | fallback technologii (datowany) | _COMMON.md, Punkt 1 |
| guidelines/nfr-checklist.md | decyzje: auth, RODO, backup, limity... | Playbook, Faza 1 (zawsze) |
| guidelines/frontend-decisions-checklist.md | decyzje FE: stan, routing, formularze, testy... | Playbook, Faza 1 (gdy UI) |
| guidelines/class-responsibility-review.md | audyt odpowiedzialności klas | _COMMON.md, Punkt 2 + refaktory |
| guidelines/llm-boundary-review.md | granice przepływów AI | _COMMON.md, Punkt 2 + projektowanie flow AI |

### Pliki dla coding agenta (po handoffie)

| Plik | Odpowiada za | Kiedy |
|------|--------------|-------|
| guidelines/frontend-design-workflow.md | bootstrap design systemu (raz) | ticket FE-SETUP |
| guidelines/new-component.TEMPLATE.md | szablon twardych reguł UI projektu | tworzony w FE-SETUP |
| guidelines/_agent_oriented_guidelines_final_UI_UX_v3.md | 100+ reguł designu (GRID/COLOR/TYPO...) | każda praca z UI |
| guidelines/react-coding-standards.md | standardy kodu React | każda praca z UI |

### Pliki dla człowieka (agent ich nie czyta)

| Plik | Rola |
|------|------|
| README.md | ta mapa |
| BOOTSTRAP.md | prompty (agent dostaje treść, nie plik) |
| CHANGES.md | historia zmian zestawu |

---

## Artefakty tworzone podczas pracy (docs/)

Tworzenie tych plików NIE jest opcjonalne — wymuszają je reguły
w plikach źródłowych (AGENT-06: każde "UTWÓRZ/AKTUALIZUJ artefakt"
jest obowiązkowe; Playbook w Bloku 0 ODMAWIA pracy bez CONTEXT.md):

| Artefakt | Tworzy | Reguła | Aktualizują później |
|----------|--------|--------|---------------------|
| docs/CONTEXT.md | GATE, moduł Kontekst | CTX-07 | PATH-10 (funkcjonalności, P7/P8), STRAT-04 (strategia), _COMMON.md Punkt 1 (Stos Technologiczny), checklisty Playbooka (NFR, FE) |
| docs/TECH_DEBT.md | GATE, moduł Ścieżki — przy PIERWSZYM uproszczeniu | PATH-11 (tabela uproszczeń) | strategia (np. pominięty Outbox, In-Memory), Playbook, coding agent (Tech Debt Ledger — plik:linia) |
| docs/CUSTOM_WORKFLOW.md | GATE — tylko gdy żadna strategia nie pasuje | STRATEGY_MAP, Krok 5 | — |
| artefakty strategii (np. docs/MODULES.md) | strategia, sekcje "Wyjście" kolejnych punktów | per punkt | Playbook buduje na nich, nie tworzy od nowa |
| docs/EPIC_BRIEF.md, docs/CORE_FLOWS.md, docs/TECH_PLAN.md, docs/SCALE.md | Playbook, Faza 2 | tabela artefaktów Playbooka | tylko jeśli nie pokrywa ich artefakt strategii |
| docs/tickets/[ID].md + docs/tickets/INDEX.md | Playbook, Faza 4 | Standard Ticketów (§6) | INDEX aktualizowany po KAŻDYM ticketcie |
| docs/HANDOFF.md | Playbook, Faza 5 | pakiet dla coding agenta | — |

Nazwy plików Playbooka są wiążące: po nich Blok 0 kolejnej sesji
rozpoznaje, że wznawia PLAYBOOKA (KROK 3B), a nie strategię.

Mechanizm: docs/ to jedyna pamięć agenta między punktami
(strategia ładowana punkt po punkcie "zapomina" poprzednie) —
dlatego pominięcie artefaktu = utrata decyzji.

---

## Frontend — 3 punkty wpięcia (zamiast osobnego gate'u)

1. **Decyzje architektoniczne FE** — Playbook, Faza 1,
   frontend-decisions-checklist.md → sekcja "Frontend — Decyzje"
   w docs/CONTEXT.md.
2. **Ticket FE-SETUP** — Playbook, Faza 4; wykonuje go coding
   agent wg frontend-design-workflow.md.
3. **Codzienna praca z UI** — coding agent: new-component.md
   → tokeny → moduły wytycznych UI/UX v3.

Kontekst (użytkownicy, ścieżki, funkcjonalności) jest WSPÓLNY
i zbierany RAZ — w GATE. Dlatego nie istnieje FRONTEND_GATE.

---

## Zasady nawigacji (dla agenta, gdy dostanie ten plik)

1. NIE czytaj wszystkiego naraz — każdy plik rdzenia wskazuje
   następny; strategię ładuj punkt po punkcie.
2. Pamięcią między krokami są artefakty w docs/ — nie kontekst
   rozmowy.
3. Decyzje raz zapisane w docs/ są zamknięte — nie otwieraj ich
   ponownie.
