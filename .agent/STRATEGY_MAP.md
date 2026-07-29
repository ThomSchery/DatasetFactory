---
description: Mapa strategii wytwórczych. Agent czyta ten plik aby wybrać strategię na podstawie kontekstu projektu.
---

# 🗺️ STRATEGY_MAP.md

## Metadane

| Pole | Wartość |
|------|---------|
| Wersja | v1.6 |
| Liczba strategii | 2 |
| Kompatybilny z PROJECT_GATE | v1.3+ |

> Agent czyta ten plik W CAŁOŚCI w module „Wybór Strategii"
> z PROJECT_GATE.md.
> Plik zawiera metadane strategii oraz reguły dopasowania.

---

## Strategie

### PRAGMATIC

- **file:** `strategies/PRAGMATIC.md`
- **strategy_name:** "Pragmatyczna"
- **when_type:**
  - MVP
  - Produkt
- **when_complexity:**
  - Niska
  - Średnia
- **description:** "Szybkie wytwarzanie oparte na prostych warstwach
  i sprawdzonych technologiach. Boring Technology."
- **best_when:**
  - "Głównie CRUD z kilkoma procesami biznesowymi"
  - "Zespół mały (1-5 osób)"
  - "Ważniejsza szybkość dostarczenia niż elastyczność architektury"
  - "Brak skomplikowanych reguł domenowych"
  - "Nowy projekt lub Istniejący kod (strategia obsługuje oba scenariusze)"
- **not_for:**
  - "Wiele złożonych procesów biznesowych z wyjątkami"
  - "3+ bounded contexty z różnymi modelami danych"
  - "System rozwijany przez wiele zespołów równolegle"
- **warning_when:**
  - "Średnia złożoność (P8) + P9 = Długoterminowo →
     rozważ MODULAR_MONOLITH mimo wyższego kosztu startowego"

---

### MODULAR_MONOLITH

- **file:** `strategies/MODULAR_MONOLITH.md`
- **strategy_name:** "Modularny Monolit"
- **when_type:**
  - MVP
  - Produkt
- **when_complexity:**
  - Średnia
  - Wysoka
- **description:** "Architektura modułowa z wyraźnymi granicami
  kontekstów. DDD + Event Storming."
- **best_when:**
  - "Wiele procesów biznesowych z wyjątkami i regułami"
  - "3+ typy użytkowników z różnymi uprawnieniami"
  - "System planowany na lata rozwoju"
  - "Potrzeba niezależności modułów (różne tempa zmian)"
  - "Nowy projekt lub Istniejący kod (strategia obsługuje oba scenariusze)"
- **not_for:**
  - "Proste CRUD bez logiki domenowej"
  - "Jednorazowy prototyp bez planu rozwoju (P9 = Jednorazowy prototyp)"
  - "Zespół 1 osoba + deadline < 2 tygodnie"

---

## Reguły dopasowania

Agent stosuje reguły w kolejności:

### Krok 0 — Korekta Istniejącego Kodu

Wykonaj PRZED filtrowaniem — ten krok może zmienić P8,
a filtrowanie działa na wartości P8.

Wykonaj tylko jeśli P5 = Istniejący kod.

Agent ocenia czy istniejący kod nosi znamiona
nieustrukturyzowanego lub zaniedbianego projektu.

Jeśli tak — podnosi P8 o jeden poziom i informuje użytkownika:

    "Korekta Istniejącego Kodu: istniejący kod sugeruje
     [krótki opis problemu].
     Podnoszę złożoność z [X] do [Y].
     Powód: dołożenie nowej architektury do takiego kodu
     wiąże się z wyższym ryzykiem i nakładem pracy.
     Akceptujesz korektę?"

Agent CZEKA na akceptację.
Jeśli użytkownik odrzuca — agent zachowuje oryginalne P8
i dodaje notatkę w docs/CONTEXT.md z adnotacją
że decyzja należała do użytkownika.

Po akceptacji (lub odrzuceniu) korekty agent AKTUALIZUJE
wartość P8 w docs/CONTEXT.md i dopiero wtedy filtruje.
Skorygowane P8 obowiązuje we WSZYSTKICH dalszych krokach,
łącznie z Krokiem 2b.

### Krok 0B — Projekt bez backendu

Wykonaj, jeśli tabela funkcjonalności NIE zawiera żadnej
funkcjonalności wymagającej serwera własnego kodu:
aplikacja czysto kliencka, strona treściowa, narzędzie offline,
front na cudzym API (BaaS/SaaS) bez własnej logiki serwerowej.

Nie blokuj i nie idź do CUSTOM_WORKFLOW — obie strategie
są w rdzeniu strategiami DEKOMPOZYCJI, nie strategiami backendu.
Zastosuj PRAGMATIC z adaptacją:

    - Punkty 1, 2, 3, 5, 6 — bez zmian.
    - Punkt 4 (warstwy IDesign) — wg sekcji "Adaptacja:
      projekt bez backendu" w strategies/PRAGMATIC.md.

Wyjątek: jeśli P8 = Wysoka (rozbudowana logika po stronie
klienta, wiele niezależnych obszarów), zastosuj tę samą adaptację
do MODULAR_MONOLITH — moduły, granice i kontrakty działają
tak samo bez serwera; pomiń Punkt 12 (Baza Danych),
zastępując go decyzją o trwałości po stronie klienta.

Agent ogłasza adaptację w komunikacie STRAT-03 i zapisuje ją
w docs/CONTEXT.md, w sekcji "Wybrana Strategia".

### Krok 1 — Filtrowanie

Strategia pasuje gdy P7 i P8 z docs/CONTEXT.md
(P8 po ewentualnej korekcie z Kroku 0)
znajdują się na listach when_type i when_complexity
danej strategii.

### Krok 2 — Weryfikacja not_for

Dla każdej pasującej strategii agent ocenia czy kontekst
projektu z docs/CONTEXT.md koliduje z którymkolwiek
warunkiem z listy not_for.

Jeśli tak — strategia jest odrzucana.
Agent zapisuje powód odrzucenia.

### Krok 2b — Warning przy granicznych przypadkach

Jeśli wybrana strategia to PRAGMATIC i P8 = Średnia
i P9 = Długoterminowo, agent dodaje ostrzeżenie
do komunikatu w module STRAT-03:

    "⚠️ Uwaga: projekt ma złożoność Średnią i horyzont
     rozwoju 6+ miesięcy. PRAGMATIC jest odpowiednia na start,
     ale MODULAR_MONOLITH daje lepszą podstawę długoterminowo
     kosztem wyższego nakładu na początku.

     Czy akceptujesz PRAGMATIC mimo tej informacji?"

### Krok 3 — Ranking best_when

Agent ocenia ile warunków z listy best_when każdej
pasującej strategii jest spełnionych w kontekście projektu.
Strategia z większą liczbą spełnionych warunków wygrywa.

### Krok 4 — Remis

Jeśli po kroku 3 żadna strategia nie wygrywa jednoznacznie,
agent prezentuje wszystkie pasujące strategie użytkownikowi
wraz z uzasadnieniem dla każdej i własną rekomendacją.

Agent CZEKA na decyzję użytkownika.

### Krok 4b — Odrzucenie rekomendowanej strategii

Jeśli użytkownik odrzuca rekomendację agenta —
agent akceptuje wybór bez blokowania i bez ponownego pytania
o uzasadnienie.

Agent zapisuje wybór w docs/CONTEXT.md oznaczając
że była to decyzja użytkownika oraz którą strategię
agent rekomendował.

### Krok 5 — Brak dopasowania

Jeśli żadna strategia nie pasuje — agent nie blokuje procesu.
Samodzielnie projektuje dedykowany workflow na podstawie
P7, P8, tabeli funkcjonalności i odpowiedzi P1-P6.

Prezentuje go użytkownikowi do akceptacji.
Po akceptacji zapisuje workflow w docs/CUSTOM_WORKFLOW.md
i realizuje go punkt po punkcie jak plik strategii.