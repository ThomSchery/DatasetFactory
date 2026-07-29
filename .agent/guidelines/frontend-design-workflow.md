---
version: "1.0"
description: Bootstrap systemu spójnego designu w nowym projekcie frontendowym. Agent wykonuje kroki 0-5 raz, na starcie prac nad UI. Domyślnie React + Tailwind; dla innego stacku patrz sekcja Adaptacja.
---

# 🎨 frontend-design-workflow.md

> Cel: po wykonaniu kroków każdy agent pracujący w projekcie
> tworzy spójny UI. Mechanizm: łańcuch plików, w którym każdy
> wskazuje następny — agent nie może "zgubić drogi".
>
> WYKONAWCA: CODING AGENT, w ramach pierwszego ticketu UI
> (np. FE-SETUP). Agent architektury (Playbook) NIE wykonuje
> tych kroków sam — obowiązuje go zakaz pisania kodu; jego
> zadaniem jest utworzenie ticketu wskazującego ten plik.

## Wymaganie wstępne — plik wytycznych UI/UX

Uniwersalny plik `_agent_oriented_guidelines_final_UI_UX_v3.md`
(100+ reguł z ID: GRID-*, COLOR-*, TYPO-*, RADIUS-*, SHADOW-*...)
jest źródłem prawdy dla całego workflow.

Na starcie agent sprawdza, czy plik istnieje w
`.agent/guidelines/` (w tej paczce — TAK). Jeśli go brakuje —
agent PYTA użytkownika o lokalizację i kopiuje plik do
`.agent/guidelines/` albo zapisuje wskazaną ścieżkę do użycia
we wszystkich odwołaniach poniżej.

Bez tego pliku workflow NIE startuje.

Plik jest NIEZMIENNY dla agenta. Nowsza wersja (v4...) zastępuje go
w paczce w całości — nigdy nie edytuj kopii w projekcie.

Na końcu pliku jest sekcja „Errata redakcyjna" — dopisek opiekuna
zestawu o brakującym ID BORDER-04 i zgubionych nagłówkach podsekcji.
NIE jest wytyczną projektową; pomiń ją przy Design Planie.

## Łańcuch plików (mapa nawigacji)

    .agent/main.md lub BOOTSTRAP                 ← punkt startowy
        └→ src/AGENTS.md                          ← lekki wskaźnik (zmienny)
            └→ .agent/guidelines/new-component.md ← twarde reguły (niezmienne)
                ├→ tailwind.config.js             ← TOKENY (komentarze z ID)
                └→ [wytyczne UI/UX v3]            ← REGUŁY UŻYCIA
                   (czytaj CAŁY moduł, nie pojedyncze ID)

## KROK 0 — punkt startowy

Upewnij się, że plik startowy agenta w projekcie (main.md /
CLAUDE.md / AGENTS.md w rootcie) zawiera regułę: "Przed modyfikacją
kodu w src/ przeczytaj lokalny AGENTS.md. Plan zadania MUSI
zawierać listę elementów UI + wytyczne, które mają zastosowanie."

## KROK 1 — tailwind.config.js

Sekcje UNIWERSALNE (kopiuj 1:1; wartości wynikają z wytycznych):

    spacing (8-point grid, GRID-02): size-xs 8px, size-sm 16px,
      size-md 24px, size-lg 32px, size-xl 48px, size-xxl 64px
    lineHeight (LHEIGHT-09/10/11): tight 1.2, standard 1.5, loose 1.8
    borderRadius (RADIUS-02): none 0, sm 4px, md 8px, lg 16px, pill 9999px
    boxShadow (SHADOW-03): elevation-low, elevation-high (dwuwarstwowe)
    letterSpacing (LSPACE-03/09): normal 0 (domyślna wartość czcionki —
      LSPACE-02) + maksymalnie dwa warianty odchylenia, np.
      tight -0.02em (duże nagłówki, algorytm LSPACE-06),
      wide 0.05em (tekst all-caps, algorytm LSPACE-07).
      Zakres bezpieczny wg LSPACE-03; limit palety wg LSPACE-09.
    opacity (COLOR-07): hover 0.8, disabled 0.2

Sekcje DO DOSTOSOWANIA (z Figmy / brand identity — ZAPYTAJ
użytkownika): screens, fontFamily, fontSize (lineHeight wg
LHEIGHT-*; nigdy 'auto'; nigdy < 12px poza mikrokopią), colors
(MUSI zawierać: bg-primary, cards-neutral-fill, stroke-strong/weak,
text-strong/weak, fill-strong/brand, status-error/warning/success,
overlay-scrim).

Przy KAŻDEJ sekcji komentarz z ID wytycznej — to drogowskaz
do modułu w pliku UI/UX v3.

## KROK 2 — src/AGENTS.md (lekki wskaźnik)

    # Frontend Domain Rules
    1. Przed pracą z UI przeczytaj .agent/guidelines/new-component.md
       (twarde reguły, procedura, katalog komponentów, definicje).
    2. Błędy i próby rozwiązań zapisuj w log.md bieżącego zadania.

Twarde reguły designu NIE mieszkają tutaj — ten plik może się
zmieniać, reguły nie.

## KROK 3 — .agent/guidelines/new-component.md

Utwórz z szablonu `new-component.TEMPLATE.md` (w tej paczce):
uzupełnij strukturę folderów projektu i ścieżkę do wytycznych
UI/UX v3. Katalog i definicje komponentów startują puste —
rosną wraz z projektem.

## KROK 4 — pierwszy komponent (Button)

Stwórz src/components/common/Button/ używając WYŁĄCZNIE tokenów
z tailwind.config.js. Po stworzeniu dopisz go do katalogu (§4)
i definicji (§5) w new-component.md. To jedyny dozwolony sposób
tworzenia przycisków w projekcie.

## KROK 5 — weryfikacja łańcucha

    - [ ] Punkt startowy odsyła do AGENTS.md
    - [ ] AGENTS.md odsyła do new-component.md
    - [ ] new-component.md odsyła do tailwind.config.js
          i do wytycznych UI/UX v3 (ścieżka działa!)
    - [ ] tailwind.config.js ma sekcje uniwersalne + komentarze z ID
    - [ ] Button istnieje i jest w katalogu komponentów
    - [ ] Żaden plik nie "przeskakuje" nad kolejnym w łańcuchu

## Adaptacja dla stacku innego niż React + Tailwind

Mechanizm jest przenośny, zmieniają się nośniki:

    - Tokeny: zamiast tailwind.config.js — CSS variables /
      theme file / design tokens frameworka (te same wartości,
      te same komentarze z ID).
    - Katalog komponentów: ta sama tabela, inne ścieżki
      (np. src/lib/components dla Svelte).
    - Reguły z UI/UX v3 są w 100% niezależne od frameworka.
