---
version: "1.0"
---

# Ocena odpowiedzialności klas

> Status: active
> Scope: tworzenie nowych klas oraz audyt istniejącego kodu i knowledge graph
>
> WYKONAWCY — plik obsługuje dwie role:
> - AGENT ARCHITEKTURY (Punkt 2 strategii): używa sekcji
>   "Checklista audytu", "Interpretacja knowledge graph",
>   "Klasyfikacja wyniku", "Archetypy" — do OCENY istniejącego kodu
>   i zbudowania planu naprawy. Nie pisze kodu, nie uruchamia testów.
> - CODING AGENT (tickety): wykonuje "Audyt modułowy przed naprawą",
>   "Gate zakończenia naprawy modułu", "Regułę refaktoru"
>   i "Zakaz przenoszenia hotspotu" — to warunki zamknięcia ticketu,
>   nie rekomendacje.

## Zasada główna

Duża liczba metod albo linii jest sygnałem do audytu, ale nie jest
automatycznym błędem. Knowledge graph pomaga znaleźć klasy wymagające
uwagi, lecz sam nie wydaje werdyktu architektonicznego.

Klasa wymaga planu podziału, gdy łączy metody zmieniające się z różnych
powodów, miesza warstwy techniczne albo przekracza granice modułów.
Nie wprowadzamy sztywnego limitu metod ani linii.

## Checklista audytu

Przy ocenie klasy sprawdź:

- Czy można opisać odpowiedzialność klasy jednym precyzyjnym zdaniem?
- Czy metody należą do jednego procesu albo jednego spójnego algorytmu?
- Czy metody zmieniają się z jednego powodu, czy z kilku niezależnych powodów?
- Czy klasa miesza orkiestrację, persistence, reguły domenowe i mapowanie API?
- Czy klasa bezpośrednio importuje prywatne serwisy, encje albo persistence innych modułów?
- Czy integracje między modułami przechodzą przez publiczne kontrakty lub porty?
- Czy publiczne API jest wąskie, a szczegóły algorytmu pozostają prywatne?
- Czy przed refaktorem istnieją testy zachowania chroniące aktualny flow?
- Czy klasa korzystająca z AI nie łączy komunikacji z providerem, parsowania,
  walidacji, reguł domenowych i efektów ubocznych? Jeżeli dotyka AI, zastosuj
  również checklistę z `llm-boundary-review.md`.

## Interpretacja knowledge graph

Węzeł klasy z wieloma metodami oznacza kandydata do sprawdzenia, nie
automatyczne naruszenie SRP. Podczas przeglądu oceń razem:

- liczbę metod i rozmiar pliku,
- liczbę oraz kierunek zależności,
- liczbę warstw i modułów dotykanych przez klasę,
- spójność nazw metod,
- rozmiar publicznego API,
- zakres testów zachowania.

Zdrowa klasa algorytmiczna może mieć wiele prywatnych metod, jeżeli są
krokami jednego procesu. Podejrzana klasa zwykle pełni kilka ról:
orkiestruje flow, czyta bazę, interpretuje reguły domenowe, wywołuje
integracje i mapuje odpowiedź API.

## Klasyfikacja wyniku

- `Healthy`: jedna odpowiedzialność, wąskie API, spójne zależności.
- `Review`: klasa jest większa lub złożona, ale może reprezentować jeden algorytm; potrzebna analiza przed decyzją.
- `Split required`: wiele powodów do zmiany, mieszanie warstw albo przekroczenie granic modułów; przygotuj etapowy plan naprawy.

## Audyt modułowy przed naprawą

Nie odkładaj oceny klas na serię późniejszych audytów wykonywanych plik
po pliku. Przed rozpoczęciem naprawy modułu:

1. Wygeneruj albo odśwież knowledge graph.
2. Zbierz wszystkie klasy i serwisy należące do naprawianego modułu.
3. Wybierz hotspoty na podstawie liczby metod, rozmiaru pliku,
   zależności, dotykanych warstw i rozmiaru publicznego API.
4. Sklasyfikuj każdy hotspot jako `Healthy`, `Review` albo `Split required`.
5. Uwzględnij wszystkie pozycje `Split required` w jednym planie naprawy
   modułu, z kolejnością ekstrakcji i testami charakterystyki.
6. Rozstrzygnij pozycje `Review` przed zamknięciem modułu: zmień je na
   `Healthy` z krótkim uzasadnieniem albo na `Split required` i napraw.

## Gate zakończenia naprawy modułu

Naprawa modułu jest zakończona dopiero wtedy, gdy:

- każda klasa i każdy serwis modułu zostały objęte zbiorczą oceną,
- nie pozostała żadna nierozstrzygnięta pozycja `Review`,
- nie pozostała żadna nienaprawiona pozycja `Split required`,
- klasy pozostawione jako większe mają jednoznaczne uzasadnienie
  algorytmiczne i wąskie publiczne API,
- testy zachowania oraz testy granic modułów przechodzą po zmianach,
- odświeżony knowledge graph nie ujawnia nowych niesklasyfikowanych hotspotów,
- knowledge graph przed i po refaktorze został porównany,
- każda nowa i istotnie powiększona klasa została ponownie oceniona,
- odpowiedzialności usunięte z dużej klasy nie zostały jedynie przeniesione
  do jednego nowego use case'u, koordynatora, handlera albo fasady,
- logika AI usunięta z dużej klasy nie została skumulowana w jednym nowym
  use case'ie albo koordynatorze,
- cienka fasada nie deleguje do nowego God Objectu.

Nie twórz po zakończeniu naprawy osobnego backlogu „przejrzeć klasy
później”. Jeśli hotspot należy do naprawianego modułu, rozstrzygnij go
w ramach naprawy tego modułu.

## Archetypy (przykłady klasyfikacji)

- Policy service z jedną decyzją domenową (np. wyliczenie okna czasowego,
  progu, limitu): zwykle `Healthy` — jedna nazwana odpowiedzialność.
- Klasa algorytmiczna z wieloma prywatnymi metodami będącymi krokami
  jednego procesu (np. resolver, normalizator): `Review` — wiele metod
  nie oznacza automatycznie potrzeby podziału.
- Serwis domenowy łączący orkiestrację flow, dostęp do danych, reguły
  selekcji, budowanie wyniku, zapis i mapowanie odpowiedzi API:
  typowy `Split required` — kilka niezależnych powodów do zmiany.

## Reguła refaktoru

Nie rozbijaj klasy mechanicznie na podstawie liczby metod. Najpierw dodaj
lub potwierdź testy zachowania, nazwij osobne odpowiedzialności, znajdź
seam i wyciągaj komponenty etapami metodą Strangler Fig.

## Zakaz przenoszenia hotspotu

Zmniejszenie klasy źródłowej nie jest dowodem poprawnej architektury.
Jeżeli usuwasz znaczną część logiki z klasy A, sprawdź, do których klas
trafiły jej metody i odpowiedzialności. Refaktor jest niepełny, gdy nowy
use case, koordynator, handler albo fasada przejmuje wiele niezależnych
powodów do zmiany.

Po każdej większej ekstrakcji:

1. Porównaj knowledge graph przed i po refaktorze.
2. Zidentyfikuj wszystkie nowe oraz istotnie powiększone klasy.
3. Sklasyfikuj je jako Healthy, Review albo Split required.
4. Sprawdź, czy cienka fasada nie deleguje do jednego nowego God Objectu.
5. Nie zamykaj modułu, dopóki hotspot powstały wskutek ekstrakcji nie
   zostanie naprawiony albo świadomie uzasadniony jako spójny algorytm.

Typowy scenariusz: pierwszy refaktor zmniejsza klasę źródłową, ale gate
końcowy wykrywa nagromadzenie odpowiedzialności w nowo utworzonym
use case'ie/koordynatorze. Dopiero kolejna ekstrakcja koordynatorów,
policy i adapterów domyka naprawę modułu.
