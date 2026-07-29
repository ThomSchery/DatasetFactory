---
version: "1.0"
description: Domyślne standardy React dla nowych projektów z tej paczki. Jeśli FE-01 wskazał inny framework — agent tworzy odpowiednik tych reguł dla wybranego stacku.
---

# react-coding-standards.md

## 1. Architektura komponentów

- Małe, czytelne komponenty; named exports.
- Unikaj nadmiaru opcjonalnych propsów w jednym komponencie —
  to sygnał, że komponent pełni kilka ról.
- Współdzielone UI w `common/` zgodnie z new-component.md.

## 2. Stan i przepływy asynchroniczne

- Stan współdzielony wg decyzji FE-02; nie duplikuj stanu
  globalnego w lokalnym "żeby łatwiej renderować".
- Asynchroniczne akcje UI mają jawne stany:
  idle | loading | success | error (konwencja FE-06).

## 3. Integracja z API

- Frontend odzwierciedla realne kontrakty backendu (Tech Plan),
  nie mocki. Rozjazd kontraktu = STOP i aktualizacja artefaktów,
  nie ciche dopasowanie.
- Autoryzacja, błędy i odświeżanie danych wg decyzji FE-03/FE-04.

## 4. Wydajność i UX

- Zero useMemo/useCallback "na zapas" — tylko przy realnej
  potrzebie lub istniejącym wzorcu.
- Czytelne stany pustki, błędu i ładowania w każdym widoku.
- Długie operacje (upload, przetwarzanie) nie blokują głównego
  wątku ani interakcji użytkownika.
