# FE-026 — log wykonania

## Diagnoza (2026-11-23)

Prawdziwa baza (`D:\DatasetFactory\workspace\project.db`, alembic 0008), profil „Quake Champions”:

- regiony: `health & armour`, `score_left`, `score_right`, `kill` (wszystkie 2026-08-28);
- klasy: alfabet OCR `0`–`9`, `A`–`Z`, `-`, `/` oraz Custom `health & armour` (2026-09-14, dodana w Review) i `timer` (2026-09-16).

Picker w Review czyta `profile.categories`, więc `kill`, `score_left`, `score_right` nie miały skąd się pojawić. Klasę Custom dawał tylko `withAcceptedSketch` (FE-022) przy nowym regionie; starsze regiony i zmiany nazw zostawały bez klasy.

## Decyzje

- Reguła w repozytorium, nie w kliencie: każda ścieżka zapisu regionów (UI, `add_region`, Save as, przyszłe API) ją dziedziczy, a migracja 0009 stosuje tę samą regułę do danych sprzed niej.
- Przemianowanie regionu przenosi klasę (ten sam `id`) zamiast tworzyć nową — boksy narysowane pod starą nazwą idą za regionem. Gdy to byłoby zgadywanie (zamiana nazw, nowa nazwa już jest klasą, klasa OCR), klasa zostaje na miejscu, a region dostaje/adoptuje swoją.
- Klasa pominięta w szkicu, a nadal nazwana przez region, zostaje (ten sam wiersz). Odtworzenie jej po usunięciu dałoby nowy ordinal, czyli inny identyfikator eksportu.
- Kolejność nowych klas = kolejność regionów w żądaniu. Pierwsza wersja brała `created_at, id`; regiony z jednego flusha mają ten sam znacznik czasu na Windows, a losowe `id` mieszało ordinale (wyłapane przez test).
- Front: osierocone niezapisane klasy Custom nie są wysyłane, bo backend i tak doda klasę dla nowej nazwy regionu — bez filtra zapis zostawiałby dwie klasy („ammo” i „ammo box”).

## Design Plan (2026-11-23, przed zmianą `frontend/src/`)

Przeczytane: `AGENTS.md`, `frontend/src/AGENTS.md`, `.agent/guidelines/new-component.md` (sekcje 2, 4, 5 — Button). Zmiana nie dodaje elementu ani stylu: używa istniejącego `Button` (`muted`, ikona `trash`) w stanie `disabled`.

### Elementy interfejsu

1. **Custom → wiersz klasy regionu**: kosz `Button muted` z `disabled`, `aria-label` „Class of region X: remove the region to remove the class”, `title` z tym samym wyjaśnieniem. Rename bez zmian wizualnych.
2. **Custom → wiersz zwykłej klasy**: bez zmian.
3. **Picker klasy w Review**: bez zmian w kodzie; klasy regionów w grupie Custom.

### Checklista

- [x] Layout/Siatka: bez zmian (GRID-01/02 nietknięte).
- [x] Typografia: bez zmian.
- [x] Kolory: bez nowych; stan nieaktywny przez istniejący wariant `muted` (COLOR-07).
- [x] Obramowania: bez zmian (BORDER-\*, RADIUS-\*).
- [x] Cienie: brak.
- [x] Interakcje: disabled = `--opacity-disabled` na całym komponencie (OPACITY-\*), zgodnie z definicją `Button`.
- [x] Komponenty: `Button`, `Icon` z `common/`; nowych nie ma.

## Bramka i cold review (2026-11-23)

- `ab5deb6`: `scripts/check.ps1` 9/9 PASS (pytest 483, Vitest, build, E2E 373 s, root safety), porty E2E 5197 / 8038 / 8039.
- Migracja 0009 na kopii prawdziwej bazy (backup API SQLite do `D:\tmp\fe026-dbcopy`): profil „Quake Champions” dostał `kill`, `score_left`, `score_right` jako `game`, wersja 1 → 2, liczba anotacji bez zmian.
- Cold review (agent claude/opus high; codex wyczerpał limit): **GOTOWE DO MERGE**, bez P1/P2, trzy P3.

## FIX1 — ustalenia P3 z review

1. **P3-1** `save_definition` mógł dać klasie regionu ordinal klasy usuniętej w tym samym zapisie (`_ensure_region_categories` czytał maksimum po usunięciu). `_save_categories` zwraca teraz następny wolny ordinal liczony sprzed usunięcia, a `_ensure_region_categories` bierze `max(floor, max + 1)`. Test: `test_a_region_class_never_takes_the_ordinal_of_a_class_dropped_in_the_same_save`.
2. **P3-2** Remis `created_at` (regiony z jednego flusha, jak na prawdziwym profilu) rozstrzygał losowy UUID. Migracja i repozytorium sortują teraz po `created_at, rowid`, czyli w kolejności wstawienia. Na prawdziwej bazie: `score_left`, `score_right`, `kill`. Test: `test_region_class_migration_keeps_definition_order_when_timestamps_tie`.
3. **P3-3** Front porównywał nazwy przez `toLowerCase()`, backend przez `casefold()` (np. `Straße` / `STRASSE`). Wspólny `foldName` (`trim().toUpperCase().toLowerCase()`) w `profileDraft.ts`, używany też przez `ClassGroupsPanel`. Test: „folds names the way the backend does”.
