---
version: "1.0"
---

# Audyt granic przepływów LLM

> Status: active
> Scope: nowe przepływy AI, refaktory oraz audyt istniejących etapów korzystających z modeli lub providerów AI
>
> WYKONAWCY: agent architektury stosuje "Zalecany podział etapów",
> "Checklistę audytu", "Provenance", "Izolację wykonawczą"
> i "Klasyfikację wyniku" — projektując granice przepływu.
> Sekcja "Testy wymagane przed zamknięciem audytu" należy
> do CODING AGENTA i trafia do Done Criteria ticketu.

## Zasada główna

Odpowiedź LLM jest niezaufanym wejściem aż do zakończenia walidacji.
Etap AI ma ograniczony blast radius: błąd modelu, providera albo parsera nie
może bez kontroli zatruwać dalszego pipeline'u ani uruchamiać efektów ubocznych.

Modularny monolit pozostaje domyślną architekturą. Samo użycie modelu nie
uzasadnia mikroserwisu, kontenera ani osobnego runtime.

## Zalecany podział etapów

Przepływ AI rozdzielaj wzdłuż granic walidacji:

`przygotowanie wejścia -> provider adapter -> parsowanie -> walidacja schematu -> reguły domenowe -> zapis lub efekt uboczny`

Każdy etap powinien mieć jedną nazwaną odpowiedzialność i testowalny kontrakt.
Provider adapter odpowiada za komunikację z zewnętrznym modelem oraz techniczne
mapowanie odpowiedzi. Nie może zawierać reguł domenowych.

## Checklista audytu

Przy ocenie przepływu AI sprawdź:

- Czy odpowiedź modelu jest traktowana jak niezaufane wejście?
- Czy parser i walidacja schematu działają przed regułami domenowymi?
- Czy reguły domenowe są poza provider adapterem?
- Czy zapis, publikacja eventu i inne efekty uboczne następują dopiero po walidacji?
- Czy błędna odpowiedź, timeout albo awaria providera mają kontrolowany wynik?
- Czy retry, timeout i fallback są jawne, ograniczone oraz testowalne?
- Czy downstream otrzymuje wyłącznie dane zwalidowane albo jawnie oznaczony fallback?
- Czy dane pochodzące od użytkownika i zewnętrznych źródeł nie mogą przez prompt injection uruchomić niedozwolonych działań?
- Czy przechowywane metadata pozwalają odtworzyć pochodzenie decyzji AI?
- Czy klasa nie łączy wywołania modelu, parsowania, walidacji, reguł domenowych i zapisu?
- Czy po ekstrakcji odpowiedzialności hotspot nie został przeniesiony do jednego use case'u albo koordynatora?

## Provenance i audytowalność

Dla wyniku AI zapisuj metadata adekwatne do procesu:

- provider i model,
- wersję promptu oraz wersję schematu odpowiedzi,
- wynik walidacji,
- confidence, jeżeli proces go używa,
- informację o użytym fallbacku,
- dane diagnostyczne potrzebne do odtworzenia decyzji bez zapisywania sekretów.

Zakres metadata może być mniejszy dla prostych, efemerycznych operacji bez
wpływu na zapis i decyzje domenowe. Redukcja zakresu wymaga jawnego uzasadnienia.

## Izolacja wykonawcza

Sandbox albo osobny izolowany runtime jest wymagany, gdy wynik modelu może
uruchomić operację wysokiego ryzyka:

- wykonanie generowanego kodu,
- wykonanie komendy shell,
- zapis, usunięcie albo odczyt plików poza ściśle ograniczonym zakresem,
- swobodny dostęp sieciowy,
- inne efekty uboczne, których nie da się bezpiecznie ograniczyć kontraktem aplikacji.

Zwykła inferencja, parsowanie i walidacja pozostają w modularnym monolicie,
jeżeli nie wykonują takich działań.

## Klasyfikacja wyniku

- `Healthy`: etapy mają wąskie odpowiedzialności, dane są walidowane przed użyciem, a efekty uboczne są kontrolowane.
- `Review`: przepływ jest złożony albo algorytmiczny, ale granice odpowiedzialności i walidacji wymagają potwierdzenia.
- `Split required`: jedna klasa łączy komunikację z modelem, parsowanie, walidację, reguły domenowe i zapis albo wywołanie akcji; provider adapter zawiera politykę domenową; niezwalidowany wynik może uruchomić efekt uboczny; albo brak granicy awarii uniemożliwia kontrolowaną degradację.

## Testy wymagane przed zamknięciem audytu

Sprawdź co najmniej:

- poprawną odpowiedź modelu,
- odpowiedź uszkodzoną albo niezgodną ze schematem,
- odpowiedź poprawną składniowo, ale odrzuconą przez reguły domenowe,
- timeout i awarię providera,
- kontrolowany fallback,
- brak efektów ubocznych dla niezwalidowanej odpowiedzi,
- zachowanie sandboxa albo izolowanego runtime dla operacji wysokiego ryzyka, jeżeli występują.

## Archetypy (przykłady klasyfikacji)

- Pipeline ekstrakcji: zdrowy kierunek podziału to
  `Extractor -> ChangeDetector/Interpreter -> DomainEvidenceResolver` —
  każdy etap ma jedną odpowiedzialność i testowalny kontrakt.
- Provider adapter: wymaga oceny, jeżeli oprócz komunikacji z modelem
  zawiera parsowanie odpowiedzi i reguły domenowe.
- Use case orkiestrujący etap AI: wymaga ponownego audytu, jeżeli
  zaczyna kumulować wywołania AI, konfigurację, normalizację,
  persistence i finalizację procesu.

