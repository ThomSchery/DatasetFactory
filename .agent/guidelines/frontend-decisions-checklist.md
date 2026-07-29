---
version: "1.0"
description: Checklista decyzji architektonicznych frontendu. Playbook stosuje ją w Fazie 1 (Discovery), gdy tabela funkcjonalności zawiera UI. Zamyka luki, których nie pokrywa design system.
---

# 🎛️ frontend-decisions-checklist.md

> Design system (tokeny, siatka, typografia) pokrywa poziom PIKSELI.
> Ta checklista pokrywa poziom ARCHITEKTURY frontendu — decyzje,
> które bez jawnego zamknięcia coding agent będzie zgadywał.
>
> Sposób użycia: Playbook, Faza 1. Dla każdej pozycji agent stosuje
> Silnik Pytań i Decyzji (opcje A/B/C, trade-offy, rekomendacja,
> jedna decyzja na raz). Decyzje zapisuje w docs/CONTEXT.md
> (sekcja "Frontend — Decyzje") i propaguje do Tech Planu.
> Pozycje już rozstrzygnięte w artefaktach — POMIŃ (nie pytaj ponownie).

---

**(ID: FE-01)** Framework UI:

    Jeśli sekcja "Stos Technologiczny" w docs/CONTEXT.md już
    określa framework UI — decyzja jest ZAMKNIĘTA; nie otwieraj
    jej ponownie, przejdź do FE-02.

    Domyślnie: React (spójnie z STACK_DEFAULTS).
    NIEKONIECZNIE React — jeśli kontekst wskazuje inaczej
    (zespół zna Vue/Svelte/Angular, projekt to głównie treść
    statyczna → SSR/HTMX może wystarczyć), agent proponuje
    alternatywę wg kryteriów Boring Technology.
    Reguły P6 mają pierwszeństwo: znany framework > domyślny.

**(ID: FE-02)** Stan aplikacji (client state):

    Kiedy lokalny (useState), kiedy współdzielony?
    A: Tylko lokalny + podnoszenie stanu (małe aplikacje)
    B: Lekki store (Zustand/odpowiednik) dla stanu współdzielonego
    C: Kontekst per obszar funkcjonalny
    Reguła: globalny store tylko dla stanu faktycznie
    współdzielonego między odległymi widokami.
    Zakaz duplikowania stanu globalnego w lokalnym "dla wygody".

**(ID: FE-03)** Stan serwera (server state):

    Jak dane z backendu żyją we froncie?
    A: Fetch w komponencie + jawne stany idle/loading/success/error
    B: Warstwa query-cache (TanStack Query/odpowiednik)
    C: Polling / WebSocket / SSE — dla danych zmiennych w czasie
    MUSI być rozstrzygnięte: strategia odświeżania (kiedy dane
    są nieaktualne?) i strategia dla operacji długotrwałych
    (job na backendzie → polling statusu vs push).

**(ID: FE-04)** Routing:

    Struktura tras odzwierciedla ścieżki użytkownika z CONTEXT.md.
    MUSI być rozstrzygnięte: trasy chronione (auth guard),
    zachowanie przy braku uprawnień, deep-linking do stanów
    aplikacji (czy stan widoku żyje w URL?).

**(ID: FE-05)** Formularze i walidacja:

    A: Kontrolowane + walidacja ręczna (mało formularzy)
    B: Biblioteka formularzy + schema walidacji (dużo formularzy)
    Reguła: walidacja frontendowa NIGDY nie zastępuje backendowej
    (DTO z regułami — patrz zakazane kompromisy strategii).
    Komunikaty błędów per pole, spójne z konwencją FE-06.

**(ID: FE-06)** Konwencje stanów UI:

    Każdy widok pobierający dane MUSI mieć zaprojektowane stany:
    pusty / ładowanie / błąd / sukces. Agent definiuje je RAZ
    (wzorce, komponenty) i stosuje wszędzie.
    Operacje mutujące: stan przycisku (disabled+spinner),
    obsługa błędu (toast? inline?), optimistic update TAK/NIE.

**(ID: FE-07)** Responsywność:

    Jakie urządzenia realnie obsługujemy w v1?
    A: Desktop-only (świadomy wybór, zapisany w TECH_DEBT jeśli
       mobile planowany później)
    B: Responsive z breakpointami z tailwind.config.js
    C: Mobile-first
    Pamiętaj o GRID-12: elementy nie skalują się proporcjonalnie.

**(ID: FE-08)** Dostępność (a11y) — poziom ambicji:

    Minimum zawsze: semantyczny HTML, obsługa klawiatury dla
    interakcji, kontrast wg COLOR-* z guidelines, hit areas
    wg GRID-03..07.
    Decyzja: czy v1 celuje w pełne WCAG AA (czytniki ekranu,
    aria-*)? Jeśli nie — wpis do TECH_DEBT.

**(ID: FE-09)** Struktura folderów frontendu:

    Domyślnie: feature-based + common/ (wzorzec z
    new-component.TEMPLATE.md).
    Jeśli backend = Modularny Monolit: foldery feature
    odzwierciedlają moduły backendu tam, gdzie to naturalne
    (spójny język między FE i BE).

**(ID: FE-10)** Testy frontendu — zakres v1:

    A: Testy logiki (utils, store) + smoke render kluczowych widoków
    B: A + testy interakcji krytycznych ścieżek (Testing Library)
    C: B + e2e ścieżki krytycznej (Playwright)
    Decyzja MUSI odwoływać się do priorytetów z tabeli
    funkcjonalności — testuj ścieżkę krytyczną, nie wszystko.

**(ID: FE-11)** Komunikacja z AI/LLM z frontendu (jeśli dotyczy):

    Frontend NIGDY nie woła providera AI bezpośrednio
    (klucze API w przeglądarce = sekret w kodzie klienta).
    Zawsze przez backend. Dla odpowiedzi streamowanych —
    decyzja: SSE vs WebSocket. Obowiązuje llm-boundary-review.md
    po stronie backendu.

---

## Wyjście

Po przejściu checklisty agent AKTUALIZUJE docs/CONTEXT.md:

    ## Frontend — Decyzje
    | ID | Decyzja | Wybór | Uzasadnienie |
    |----|---------|-------|--------------|
    | FE-01 | Framework | ... | ... |
    | ...  | ...      | ...  | ...          |

Decyzje propagują się do Tech Planu i ticketów (zasada spójności
z Playbooka).
