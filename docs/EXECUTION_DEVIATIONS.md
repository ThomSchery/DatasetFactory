# Execution Deviations

## ED-001 — FE-SETUP screenshot QA odroczony

- **Kategoria:** Technical Drift — środowiskowy, zaakceptowany przez użytkownika.
- **Decyzja:** 2026-07-30 użytkownik wybrał kontynuację do TK-002 mimo braku
  fizycznego screenshotu design harness 1440 px.
- **Powód:** Browser runtime zwraca pustą listę backendów; testy, build, kontrast,
  CSS vars i statyczne porównanie baseline'u są zielone.
- **Zabezpieczenie:** osobny ticket `FE-SETUP-QA`; screenshot pozostaje
  obowiązkowym warunkiem przed rozpoczęciem/zamknięciem FE-001 i Gate 3.
- **Wpływ produktowy:** brak — nie zmienia baseline'u ani zachowania UI.

