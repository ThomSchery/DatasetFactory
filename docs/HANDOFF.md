# Handoff — DatasetFactory MVP

## Artefakty

| Plik | Rola |
|------|------|
| `docs/CONTEXT.md` | wiążący zakres, stack, NFR i frontend decisions |
| `docs/MODULES.md` | 9 modułów IDesign, zależności, PERT i kolejność |
| `docs/TECH_DEBT.md` | TD-001…013, ledger świadomych uproszczeń |
| `docs/EPIC_BRIEF.md` | wynik, sukces MVP i out-of-scope |
| `docs/CORE_FLOWS.md` | CF-01…07, happy/error/recovery flows |
| `docs/TECH_PLAN.md` | dane, API, worker, filesystem, testy i walidacja 3.1–3.4 |
| `docs/SCALE.md` | ograniczenia i triggery migracji |
| `docs/tickets/INDEX.md` | jedyne źródło statusu i kolejności ticketów |
| `designs/baseline-impeccable/` | wiążący baseline wizualny v1 |

## Strategia i implikacje

Strategia Pragmatyczna: nie rozszerzaj zakresu poza F01/F03–08/F11–16. Utrzymuj
zależności Client → Manager → Engine/Access; engine'y nie znają HTTP/DB/filesystem.
Jeden `DatasetWorkflow` nie może stać się God Objectem: use cases mogą być
oddzielnymi klasami/funkcjami wewnątrz modułu z jednym publicznym kontraktem.

## Kolejność

1. Równolegle: TK-001 i FE-SETUP.
2. Sekwencyjnie: TK-002 → TK-003 → TK-004 → TK-005 → TK-007.
3. FE-001 po stabilizacji wymaganych kontraktów TK-002/004/005/007.
4. TK-006 zamyka całość.

## Verification Gates

- Gate 1: TK-001 + FE-SETUP — build, migracja, health, composition root, token chain.
- Gate 2: TK-003 — techniczny kontrakt/bbox/provenance musi przejść. Negatywny
  wynik jakości Tesseract jest zaakceptowany jako TD-014: adapter działa wyłącznie
  `experimental`, a workflow zapisuje i pokazuje `quality_gate=failed`.
- Gate 3: TK-005 + TK-007 + FE-001 — pełny workflow API/UI, ręczna korekta
  boksów oraz poprawny COCO.
- Gate 4: TK-006 — wszystkie testy, restart/resume, screenshot QA i clean repo.

## Dług techniczny

Coding agent aktualizuje kolumnę „Gdzie (plik:linia)” w `TECH_DEBT.md` w każdym
ticketcie. Najwyższy priorytet obserwacji: TD-004 trafność OCR, TD-001 mismatch
rozdzielczości i TD-011 brak backupu. TD-005 został zamknięty 2026-08-04 wraz
z wciągnięciem F09 do v1.

## Markery @SCALE

Pełna tabela jest w `SCALE.md`; marker ma format:
`obecne ograniczenie → mierzalny trigger → docelowe rozwiązanie`. Marker nie
upoważnia do implementowania rozwiązania docelowego w MVP.

## Agent Philosophy

- **Contract First:** zmiana endpointu/statusu/modelu najpierw aktualizuje
  `TECH_PLAN` i test kontraktu.
- **Scope Lock:** ticket nie realizuje F02/F10 ani infrastruktury „na później”.
  F09 należy do v1 od 2026-08-04 i jest realizowane przez TK-007 oraz FE-001.
- **Explicit Over Silent:** stabilne error codes, jawne timeouty/retry/statusy;
  żadnych zachowań zależnych od nieudokumentowanego defaultu frameworka.
- **Tech Debt Ledger:** każde nowe świadome uproszczenie przed zamknięciem trafia
  do `TECH_DEBT.md`, nie tylko do komentarza w kodzie.
- **Local First:** loopback, workspace/cache/models na D, zero uploadu/chmury.

## Gate'y wykonawcze coding agenta

- Pierwszy moduł musi mieć smoke test pełnego composition root FastAPI z temp DB
  i atrapami zasobów, bez startu serwera.
- Każda zmiana klas/modułu przechodzi gate odpowiedzialności z
  `.agent/guidelines/class-responsibility-review.md`; ekstrakcja nie może tylko
  przenieść hotspotu do nowego koordynatora/fasady.
- Granica OCR/AI: przygotowanie wejścia, subprocess/provider, parser, walidacja,
  reguły i persistence są rozdzielone; timeout/retry/provenance oraz brak efektu
  ubocznego po błędzie są testowane.
- Produkcyjny wybór `OcrEngine` nie może być domyślnie utożsamiony z Tesseract.
  `/` należy do bazowego alfabetu; provenance zawiera runtime/model hashes.
- Tesseract z `D:\tools\tesseract-5.5.3` to wyłącznie zewnętrzny build Windows
  UB Mannheim do dev/spike (TD-015), nie oficjalna binarka upstream. Adapter
  wymaga pełnego buildu oraz zgodnych pinów SHA-256 runtime/modelu przed OCR.
- `ocr-evaluator-v2` utrwala quality FAIL (aktualnie 93,22%, 7/11 exact,
  minimum IoU 0); zielony test oczekuje klasyfikacji `failed`, nie jakości PASS.
- Alignment v2 wybiera minimalny koszt edycji, a przy remisie maksymalny łączny
  IoU. Raport pinuje GT i wszystkie cropy. Model v1 musi mieć dokładną nazwę
  `{language}.traineddata`; wielomodelowe `eng+...` wymaga przyszłej mapy hashy.
- Każda nowa zależność: stabilność, utrzymanie, licencja i podatności sprawdzone
  przed dodaniem; lockfile obowiązkowy.

## Start wykonania

Coding agent zaczyna od `docs/tickets/TK-001.md`; osobny wykonawca może równolegle
zacząć `docs/tickets/FE-SETUP.md`. Po każdym gate zatrzymuje dalsze tickety, jeśli
Done Criteria nie są spełnione.
