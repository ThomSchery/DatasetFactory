---
description: Domyślne stacki fallback dla strategii wytwórczych. Jedyne miejsce w zestawie, gdzie technologie są wymienione z nazwy. Strategie odwołują się tutaj zamiast hardcodować listy.
---

# 📦 STACK_DEFAULTS.md

## Metadane

| Pole | Wartość |
|------|---------|
| Data ostatniego przeglądu | 2026-07 |
| Następny przegląd najpóźniej | 2027-07 (12 miesięcy) |
| Używany przez | strategies/_COMMON.md, Punkt 1 (COMMON-02) — wspólny dla wszystkich strategii |

> Reguła świeżości: jeśli data przeglądu jest starsza niż 12 miesięcy
> LUB agent wie, że któraś pozycja przestała spełniać kryteria
> kwalifikacji — agent dobiera stack samodzielnie wg kryteriów
> z Punktu 1 strategii i sugeruje użytkownikowi aktualizację tego pliku.
>
> Każda pozycja poniżej to FALLBACK TRZECIEGO RZUTU — używany
> tylko gdy P6 (preferencje/znajomość zespołu) nie daje jasnej
> odpowiedzi. Reguły 1 i 2 z Punktu 1 strategii (framework zespołu,
> potem najpopularniejszy framework znanego języka) mają pierwszeństwo.
>
> Lista to propozycja, nie nakaz: agent MOŻE zaproponować odstępstwo,
> jeśli kryteria kwalifikacji wskazują lepsze dopasowanie do kontekstu
> projektu — z uzasadnieniem i akceptacją użytkownika.

---

## Stacki domyślne

### MVP

    - Backend: Python (FastAPI) LUB Node.js (Express)
    - Frontend: HTMX + SSR LUB React
    - Baza danych: PostgreSQL
    - Deploy: Docker + VPS LUB PaaS (Railway/Fly.io)

### Produkt

    - Backend: Java (Spring Boot) LUB C# (.NET) LUB Go
    - Frontend: React LUB Angular
    - Baza danych: PostgreSQL
    - Deploy: Zarządzany cloud / PaaS (domyślnie)
      Kubernetes TYLKO gdy: zespół ma kompetencje operacyjne
      ORAZ skala/wymagania deploymentu tego wymagają
      (spójne z PROD-04: domyślnie monolit, prostota ponad przerost)

### Korekta wg zespołu (P4)

    Oś MVP/Produkt nie jest jedynym wymiarem. Ciężar stacku
    dopasuj do zespołu:

    - P4 = 1 osoba / mały zespół → nawet dla "Produkt" preferuj
      stack z sekcji MVP, chyba że P6 wskazuje znajomość
      cięższego stacku. Ciężki stack bez zespołu, który go zna,
      to dług operacyjny od dnia 1.
    - P4 = duży zespół → sekcja "Produkt" bez korekty.

---

## Kryteria kwalifikacji (lustrzane z Punktu 1 strategii)

Technologia może znaleźć się na liście tylko gdy spełnia WSZYSTKIE:

    1. Stabilne wydanie — nie beta/RC (PROD-03), obecne na rynku od lat
    2. Duża społeczność i pula programistów
    3. Przewidywalny cykl wydań / wsparcie LTS
    4. Dojrzały ekosystem dla typowych potrzeb
       (auth, ORM, kolejki, deploy)

Przy przeglądzie: pozycję, która przestała spełniać kryteria,
usuń lub zastąp — nie zostawiaj "z rozpędu".

---

## Changelog przeglądów

| Data | Zmiana |
|------|--------|
| 2026-07 | Ekstrakcja list z PRAGMATIC.md / MODULAR_MONOLITH.md (Punkt 1) do osobnego pliku |
| 2026-07 | Kubernetes zdegradowany z domyślnego do warunkowego; dodana korekta wg P4; doprecyzowana rola listy (fallback trzeciego rzutu, propozycja nie nakaz) |
