# TK-006-T3-FIX1 — walidacja, która faktycznie odrzuca niezgodny eksport

Status: WYKONANY

## Powód

Niezależny zimny review potwierdził wszystko poza jedną rzeczą — i to tą, która
jest celem ticketu.

Recenzent zmutował rzeczywiście wyeksportowany `annotations.json` na sześć
sposobów i **każdy przeszedł** przez `COCO(...)` oraz użyte `get*`/`load*`:

| Mutacja | Wynik |
| --- | --- |
| usunięta sekcja `images` | przeszła |
| anotacja z wiszącym `image_id` | przeszła |
| anotacja z `category_id` spoza `categories` | przeszła |
| bbox ujemny | przeszła |
| bbox poza granicami obrazu | przeszła |
| zdublowane `id` anotacji, obrazu i kategorii | przeszła |

`pycocotools.COCO` jest tolerancyjnym readerem i indekserem, nie validatorem.
Test czerwienieje wyłącznie dzięki porównaniu 1:1 z własnym goldenem, które
istniało w projekcie wcześniej. Kontrakt T3 wymaga niezależnej ścisłej
walidacji, więc status `WYKONANY` i opis w logu były przedwczesne.

Review: `artifacts/tk-006-t3-independent-cold-review/index.md`.

## Zakres

### F1 — ścisła walidacja zgodności

Eksport ma być odrzucony, gdy jest niezgodny ze specyfikacją COCO, niezależnie
od tego, czy zgadza się z goldenem.

1. Walidacja obejmuje strukturę dokumentu oraz niezmienniki referencyjne:
   - wymagane sekcje `images`, `annotations`, `categories` i typy pól;
   - unikalność `id` w obrębie każdej kolekcji;
   - każdy `image_id` i `category_id` w anotacji wskazuje istniejący rekord;
   - `bbox` ma cztery liczby, nieujemny początek, dodatnie wymiary i mieści się
     w granicach swojego obrazu;
   - `area` i `iscrowd` mają poprawne typy i wartości.
2. Mechanizm wybierasz sam. Dopuszczalne są: schemat JSON dla dokumentu plus
   jawne sprawdzenie niezmienników, albo gotowy ścisły validator, jeśli
   znajdziesz taki, który nie ciągnie za sobą ciężkiego frameworka datasetowego.
   Jeśli dokładasz zależność, obowiązuje procedura pakietowa projektu.
3. `pycocotools` zostaje jako dowód, że artefakt otwiera się referencyjnym API.
   To ma wartość, ale nie jest walidacją i tak ma być opisane w logu.
4. Walidacja jest **niezależna od goldenu**. Ma działać na dowolnym eksporcie,
   nie tylko na tym jednym oczekiwanym.

### F2 — dowód mutacyjny

Bez tego nie przyjmę F1, bo to jest dokładnie ten rodzaj kodu, który wygląda
poprawnie i nie robi nic.

1. Dla każdej z sześciu mutacji z tabeli powyżej udowodnij, że walidacja ją
   odrzuca — i że odrzuca ją **walidacja**, a nie porównanie z goldenem.
   Najprościej: mutuj dokument i wołaj samą walidację, z pominięciem goldenu.
2. Podaj wynik dla każdej mutacji osobno, z komunikatem błędu.
3. Dodaj co najmniej jedną mutację własną, której recenzent nie wymienił.

### F3 — sprostowanie dokumentacji

1. Popraw opis w `docs/tickets/TK-006/log.md`: `pycocotools` jest readerem,
   walidację zapewnia mechanizm z F1. Nie zostawiaj zdania sugerującego,
   że samo otwarcie pliku referencyjnym API dowodzi zgodności.
2. Status `TK-006-T3.md` wróć na `WYKONANY` dopiero po domknięciu F1 i F2.

## Poza zakresem

- trzy zakazy wycieku — potwierdzone przez review jako egzekwowalne, nie ruszaj;
- test realnego Tesseracta — potwierdzony, łącznie z FAIL przy złym hashu
  i jawnym SKIP przy braku ścieżki;
- zmiana formatu eksportu i kodu produkcyjnego;
- T4.

## Done Criteria

- Walidacja odrzuca wszystkie sześć mutacji recenzenta plus Twoją własną,
  niezależnie od goldenu; każdy przypadek udokumentowany komunikatem.
- Golden i zakazy wycieku nadal działają.
- `scripts/check.ps1` przechodzi w całości jednym przebiegiem.
- Jeśli doszła zależność: dokładny pin, lock z hashami, `uv lock --check`,
  `pip-audit`, licencja i brak wymogu kompilatora na czystym hoście.
- Log opisuje, co jest walidacją, a co odczytem.
- `git status` czysty, bez push i merge.
