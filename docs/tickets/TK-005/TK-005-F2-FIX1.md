# TK-005-F2-FIX1 — rekoncyliacja osieroconych eksportów przy starcie

Status: WYKONANY

## Powód

Cold review TK-005-F2 (werdykt `REVISE`, finding High). Twarde przerwanie
procesu po commicie `create_snapshot()` zostawia rekord `exports.status='running'`
bez żadnego mechanizmu, który by go domknął. Startup nie ma rekoncyliatora
eksportów ani wznowienia zadania.

Skutek jest trwały: partial unique index `uq_exports_active_run` działa
poprawnie i bezterminowo blokuje każdy kolejny `POST /exports` dla tego runu
jako `409 export_running`. Użytkownik nie odzyska możliwości eksportu bez
ręcznej ingerencji w bazę.

Dodatkowo po awarii mogą zostać artefakty na dysku: katalog temp przy śmierci
przed rename, albo kompletny katalog finalny przy śmierci po rename a przed
commitem.

## Zakres

Rekoncyliacja eksportów przy starcie, wzorowana wprost na istniejącej
rekoncyliacji reference assets z `TECH_PLAN §7`: startup usuwa stare temp oraz
osierocone artefakty finalne, zachowuje ukończone i poprawne, a rekordy bez
pliku oznacza jako niepoprawne. Operacja musi być idempotentna.

1. Przy starcie każdy eksport w stanie `queued` lub `running` zostaje domknięty
   jako `failed` ze stabilnym `error_code` oznaczającym przerwanie procesu.
   Zwalnia to partial unique index i przywraca możliwość eksportu.
2. Artefakty takiego eksportu są usuwane — temp oraz katalog finalny. Katalog
   finalny jest bezpieczny do usunięcia wyłącznie dlatego, że jego nazwa jest
   unikalna dla tego konkretnego, nieukończonego rekordu eksportu. Eksport ze
   statusem `completed` nie może zostać dotknięty w żadnym przypadku.
3. Rekoncyliacja jest idempotentna: powtórzony start bez zmian w środowisku
   daje identyczny wynik i nie zgłasza nowych zmian.
4. Rekoncyliacja nie dotyka stanu review: `review_revision`, `review_status`
   ani anotacje nie mogą zostać zmienione.

## Poza zakresem

Automatyczne wznowienie przerwanego eksportu — użytkownik ponawia go świadomie,
tak jak przy `export_revision_conflict`. Zmiany w zachowaniu TK-005-F1.

## Done Criteria

- Test crash pointu przed rename: rekord wraca jako `failed` ze stabilnym
  `error_code`, temp zniknął, kolejny `POST /exports` przechodzi.
- Test crash pointu po rename a przed commitem: rekord `failed`, osierocony
  katalog finalny usunięty, kolejny `POST /exports` przechodzi.
- Test, że eksport `completed` przetrwa restart nienaruszony — rekord i katalog
  na dysku pozostają bez zmian.
- Powtórzony start bez zmian daje identyczny wynik rekoncyliacji.
- `review_revision` i stan review nietknięte przez rekoncyliację.
- Pełne bramki backendu zielone: ruff, mypy strict, cały pytest.
