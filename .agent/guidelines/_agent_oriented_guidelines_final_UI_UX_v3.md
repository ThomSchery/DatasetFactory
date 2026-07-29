# Wytyczne UI/UX dla Agenta AI (Wersja zorientowana na Agenta)

Niniejszy dokument został zrestrukturyzowany w celu ułatwienia automatycznego przetwarzania przez Agenta AI. Każda kategoria wytycznych jest zamknięta w samowystarczalny moduł, oznaczony za pomocą komentarzy `` i ``. Każda indywidualna zasada posiada unikalny identyfikator (np. `(ID: GRID-01)`), który pozwala na precyzyjne odwoływanie się do niej.

## Spis Treści (Menu)

* [Moduł: Siatka i Odstępy (Grid & Spacing)](#moduł-siatka-i-odstępy-grid--spacing)
    * [A. Globalny System Rozmiarów (Siatka 8-punktowa)](#a-globalny-system-rozmiarów-siatka-8-punktowa)
    * [B. Zasady Odstępów](#b-zasady-odstępów)
* [Moduł: Stylizacja Elementów (UI & Visuals)](#moduł-stylizacja-elementów-ui--visuals)
    * [A. Kolor](#a-kolor)
    * [B. Obramowanie (Border)](#b-obramowanie-border)
    * [C. Szerokość Obramowania (Border Width)](#c-szerokość-obramowania-border-width)
    * [D. Promień Obramowania (Border Radius)](#d-promień-obramowania-border-radius)
    * [E. Nakładki i Elementy Przestrzenne](#e-nakładki-i-elementy-przestrzenne)
    * [F. Cienie (Shadows) / Cień Pudełkowy](#f-cienie-shadows--cień-pudełkowy)
* [Moduł: Typografia (Typography)](#moduł-typografia-typography)
    * [A. Rodzina Czcionek i Grubości (Font Family & Weights)](#a-rodzina-czcionek-i-grubości-font-family--weights)
    * [B. Grubość Czcionki (Font Weight)](#b-grubość-czcionki-font-weight)
    * [C. Rozmiar Czcionki (Font Size)](#c-rozmiar-czcionki-font-size)
    * [D. Wysokość Linii (Line Height)](#d-wysokość-linii-line-height)
    * [E. Odstępy Między Literami (Letter Spacing)](#e-odstępy-między-literami-letter-spacing)
    * [F. Odstępy Między Akapitami (Paragraph Spacing)](#f-odstępy-między-akapitami-paragraph-spacing)
    * [G. Dekoracja Tekstu (Text Decoration)](#g-dekoracja-tekstu-text-decoration)
    * [H. Przezroczystość (Opacity)](#h-przezroczystość-opacity)
    * [I. Wielkość Liter (Casing)](#i-wielkość-liter-casing)

---

## Moduł: Siatka i Odstępy (Grid & Spacing)

**(ID: GRID-00)** Agent AI, jako ekspert inżynier UI/UX, musi ściśle przestrzegać zasad rozmiarowania, odstępów i wyrównania optycznego. Nie wolno używać arbitralnych wartości pikseli. Wszystkie wartości muszą być oparte na predefiniowanej skali.

### A. Globalny System Rozmiarów (Siatka 8-punktowa)

**(ID: GRID-01)** Zawsze należy stosować predefiniowaną skalę opartą na systemie **8-punktowej siatki (8-Point Grid)**. Wszystkie wartości wymiarów, marginesów i paddingu muszą być wielokrotnością 8 (np. 8px, 16px, 24px). Nie należy używać arbitralnych wartości (np. 15px, 123px). Dla większych wartości, skok między krokami musi wynosić co najmniej 25%, aby różnica była wizualnie wyraźna. Należy używać predefiniowanej, nieliniowej skali: `8, 16, 24, 32, 40, 48, 64, 80...`.

**(ID: GRID-02)** Do określania paddingu, marginesów i odstępów należy używać następujących tokenów rozmiarów:

| Token      | Wartość | Przykład zastosowania                                   |
| :--------- | :------ | :------------------------------------------------------ |
| `size-xs`  | 8px     | Odstęp między ikoną a etykietą w przycisku              |
| `size-sm`  | 16px    | Domyślny padding komponentu, bazowy rozmiar czcionki    |
| `size-md`  | 24px    | Odstęp między powiązanymi polami formularza             |
| `size-lg`  | 32px    | Odstęp między różnymi sekcjami w karcie                 |
| `size-xl`  | 48px    | Boczne marginesy mobilne, duże odstępy sekcji           |
| `size-xxl` | 64px    | Główne odstępy między dużymi blokami na desktopie       |

#### Elementy Interaktywne i Obszary Dotykowe

**(ID: GRID-03)** Należy ściśle przestrzegać zasad dostępności dla obszarów klikalnych (Hit/Tap Areas):

* **(ID: GRID-04)** **Mobilne (Dotyk):** Minimalny obszar klikalny dla każdego elementu interaktywnego musi wynosić `48x48px`.
* **(ID: GRID-05)** **Desktop (Mysz):** Minimalny obszar klikalny to `32x32px`.
* **(ID: GRID-06)** **Przyciski z Ikonami:** Jeśli ikona jest wizualnie mała (np. 24x24px), należy ją otoczyć przezroczystym paddingiem/buforem, aby osiągnąć minimalny obszar dotykowy `48x48px` na urządzeniach mobilnych.
* **(ID: GRID-07)** **Stosunek Ikony do Przycisku:** Ikona w przycisku powinna zajmować około 1/4 całkowitego obszaru dotykowego (np. ikona 24x24px w przycisku o wysokości 48px).

#### Ograniczenia Układu i Treści

**(ID: GRID-08)** Nie należy rozciągać elementów, aby ślepo wypełniały ekran. Należy stosować następujące ograniczenia, aby zapewnić czytelność i ergonomię:

* **(ID: GRID-09)** **Szerokość Bloku Tekstu:** Ograniczyć akapity do 50-70 znaków na linię (`max-width: 65ch` jest zalecane). W 12-kolumnowej siatce desktopowej zazwyczaj obejmuje to 6 do 9 kolumn.
* **(ID: GRID-10)** **Pola Formularzy:** Szerokość pola wejściowego powinna wizualnie odpowiadać oczekiwanej długości wprowadzanych danych (np. pole kodu pocztowego musi być wizualnie krótsze niż pole e-mail).
* **(ID: GRID-11)** **Wysokości Wierszy Tabeli:**
    * Kompaktowe: `40px`
    * Standardowe: `48px`
    * Luźne: `56px` (z nieco zwiększonym rozmiarem czcionki)

#### Responsywne Zachowanie Projektu (Bez „Głupiego Zoomowania”)

**(ID: GRID-12)** Nie należy skalować wszystkiego proporcjonalnie w różnych widokach. Duże elementy na desktopie (np. nagłówki H1, masywne marginesy) muszą kurczyć się szybciej na urządzeniach mobilnych niż mniejsze elementy (np. tekst podstawowy). Padding dla małych i dużych przycisków należy definiować niezależnie; mały przycisk nie jest po prostu zmniejszoną wersją dużego przycisku.

#### Wyrównanie Optyczne i Renderowanie

* **(ID: GRID-13)** **Waga Wizualna:** Równość matematyczna nie jest równa równości optycznej. Umieszczając koło obok kwadratu, koło musi być fizycznie nieco większe (np. 104x104px), aby wizualnie pasowało do kwadratu (100x100px).
* **(ID: GRID-14)** **Ikony:** Ikony należy renderować i eksportować w ich dokładnym, zamierzonym rozmiarze (np. 16x16, 24x24). NIGDY nie należy rozciągać ani skalować ikon wektorowych za pomocą CSS/kodu arbitralnie, ponieważ stracą one pikselową ostrość.

### B. Zasady Odstępów

**(ID: SPACING-01)** **Zasada Bliskości:** Elementy powiązane muszą być bliżej siebie niż elementy niepowiązane. Odstępy wewnątrz komponentu (padding) muszą być zawsze mniejsze niż odstępy na zewnątrz (margin). Zewnętrzna przerwa musi wyraźnie oddzielać grupę od innej zawartości.

**(ID: SPACING-02)** **Grupowanie:** Preferowane jest grupowanie elementów za pomocą białych przestrzeni, a nie widocznych obramowań, aby uniknąć wizualnego bałaganu.

**(ID: SPACING-03)** **Formularze - Etykiety:** Margines między etykietą a jej polem wejściowym MUSI być mniejszy niż margines pod polem wejściowym. Etykieta musi wizualnie „przylegać” do swojego pola.

**(ID: SPACING-04)** **Formularze - Błędy:** Należy uwzględnić miejsce na komunikaty o błędach. Podwoić standardowy dolny margines grupy wejściowej, jeśli aktywny jest stan błędu, zapobiegając zlewaniu się pól.

**(ID: SPACING-05)** **Marginesy Mobilne:** Globalne marginesy lewe i prawe w widokach mobilnych muszą być symetryczne. Używać `24px` dla ekranów gęstych informacyjnie, oraz `32px` dla lżejszych układów.

**(ID: SPACING-06)** **Wybór Odstępu:** W przypadku wątpliwości między dwoma rozmiarami odstępów na poziomie makro-układu, należy wybrać większy.

**(ID: SPACING-07)** Agent AI musi ściśle zarządzać białymi przestrzeniami i odstępami, używając systemu **8-punktowej miękkiej siatki (8-Point Soft Grid)**. Nigdy nie należy używać arbitralnych wartości pikseli dla marginesów lub paddingu (np. 15px, 20px, 125px). Należy używać predefiniowanej, nieliniowej skali: `8, 16, 24, 32, 40, 48, 64, 80...`. Duże wartości odstępów muszą znacząco się różnić (o co najmniej 25%), aby stworzyć wyraźne rozróżnienie wizualne.

#### Odstępy w Formularzach i Polach Wejściowych

**(ID: SPACING-08)** Formularze wymagają ścisłych, hierarchicznych odstępów, aby pozostać czytelnymi, zwłaszcza gdy pojawiają się błędy.

#### Odstępy w typografii i Treści strony

* **(ID: SPACING-09)** **Akapity:** Margines dolny dla standardowych akapitów tekstowych powinien generalnie równać się rozmiarowi czcionki samego tekstu.
* **(ID: SPACING-10)** **Nagłówki:** Małe nagłówki wewnętrzne powinny znajdować się blisko akapitów, które opisują (np. `8px` lub `12px` marginesu dolnego). Jednak przy przechodzeniu do zupełnie nowej sekcji, odstęp nad nagłówkiem musi być znacznie większy (np. podwójna standardowa przerwa), aby ułatwić skanowanie wizualne.
* **(ID: SPACING-11)** **Obrazy:** Obrazy mają dużą wagę wizualną. Zawsze należy zapewnić wokół nich dużo białej przestrzeni.
* **(ID: SPACING-12)** **Tabele:** Używać minimum `16px` poziomego paddingu wewnątrz komórek tabeli. To naturalnie generuje bezpieczny odstęp `32px` między kolumnami.
* **(ID: SPACING-13)** **Przyciski:** Poziomy padding wewnątrz przycisku powinien wizualnie pomieścić szerokość co najmniej jednej lub dwóch liter „W” wybranej czcionki, zapewniając, że etykieta nie będzie wyglądać na ściśniętą.

## Moduł: Stylizacja Elementów (UI & Visuals)

### A. Kolor

**(ID: COLOR-01)** Agent AI musi wykonywać wszystkie zadania związane z kolorem, używając ścisłych formuł matematycznych opartych na modelach kolorów HSL (Hue, Saturation, Lightness) lub HSBA/RGBA. Wyniki muszą być niezależne od technologii, a wartości kolorów nigdy nie mogą być zgadywane ani losowane.

**(ID: COLOR-02)** **Stosunek 60/30/10:** Rozkład przestrzenny kolorów w generowanym UI musi być ściśle następujący: `60%` kolor bazowy/tła, `30%` kolory wtórne/powierzchniowe, i `10%` na elementy akcentujące/interaktywne.

**(ID: COLOR-03)** **Algorytmiczne Generowanie Odcieni:** Ograniczyć palety do koloru bazowego, 2 jaśniejszych odcieni i 2 ciemniejszych odcieni.
* *Kolor Bazowy:* Musi mieć nasycenie (S) `< 90%`, aby zapobiec zmęczeniu wzroku.
* *Ciemniejsze Odcienie:* Dla każdego kroku w dół (np. generowanie stanu najechania lub ciemniejszego obramowania), zmniejszyć jasność (L) o dokładnie `10-15%` ORAZ zwiększyć nasycenie (S) o `5%`.
* *Jaśniejsze Odcienie:* Dla każdego kroku w górę, zwiększyć jasność (L) o dokładnie `15-20%` ORAZ zmniejszyć nasycenie (S) o `5-10%`.

**(ID: COLOR-04)** **Matematyka Gradientów:** Zawsze obliczać i wyprowadzać gradienty ściśle od góry do dołu (odpowiednik 180deg). Obliczyć kolor górny, biorąc kolor dolny i stosując: `L - 10%` i `S + 5%`.

**(ID: COLOR-05)** **Brak Czystej Czerni:** NIGDY nie wyprowadzać `#000000` dla tła ani cieni. Dla ciemnych motywów, ściśle używać wartości jasności (L) między `8%` a `12%` z nasyceniem (S) `< 10%` (np. `hsl(0, 0%, 10%)`).

**(ID: COLOR-06)** **Tekst na Ciemnym Tle (Formuła Przesunięcia Odcienia):** Umieszczając kolorowy tekst na ciemnym tle (gdzie L tła `< 20%`), zastosować następującą formułę do koloru tekstu:
* Zwiększyć jasność (L) do `>= 80%`.
* Zmniejszyć nasycenie (S) o `10-15%`.
* Przesunąć odcień (H) o `+10` lub `-10` stopni w kierunku najbliższej osi koloru podstawowego (0, 120 lub 240), aby zapobiec „wyblakłemu” wyglądowi.

**(ID: COLOR-07)** **Stany Interakcji Kanału Alpha:** Nie obliczać nowych absolutnych wartości HEX dla stanów interakcji, jeśli można użyć kanałów alpha. Ściśle stosować mnożniki alpha:
* Stan `hover` / `pressed` = `alpha: 0.8`.
* Stan `disabled` = `alpha: 0.2`.

**(ID: COLOR-08)** **Ścisłe Parsowanie WCAG AA:** Przed wyprowadzeniem dowolnej pary kolorów tekst/tło, matematycznie zweryfikować współczynnik kontrastu:
* Mały tekst (< 18px) MUSI mieć `>= 4.5:1`.
* Duży tekst (>= 18px pogrubiony / 24px zwykły) i obramowania UI MUSZĄ mieć `>= 3.0:1`.

**(ID: COLOR-09)** **Ograniczenia Kolorów Statusu:** Ściśle wiązać tokeny statusu z określonymi zakresami odcieni (H):
* `Error`: H = `0-10` lub `350-360`.
* `Warning`: H = `35-45`.
* `Success`: H = `140-160`.
* Nigdy nie używać tych zakresów H dla głównych przycisków lub standardowych linków semantycznych.

**(ID: COLOR-10)** **Konwencja Nazewnictwa Tokenów:** Generować tokeny projektowe ściśle na podstawie ich funkcji semantycznej: `color-[domena]-[rola]-[stan]` (np. `color-background-primary-default`, `color-text-error-hover`).


### B. Obramowanie (Border)

**(ID: BORDER-01)** Agent AI musi generować obramowania, używając ścisłej tokenizacji funkcjonalnej i matematycznych ograniczeń rozmiarowania. Cała logika musi być niezależna od technologii.

**(ID: BORDER-02)** **Minimalizacja Obramowań:** Aby oddzielić odrębne grupy treści lub sekcje, zawsze najpierw używać `Spacing` (marginesów/przerw) lub `Box Shadow`. Domyślne obramowania strukturalne dla kart, sekcji i kontenerów ustawić na `width = 0` i `opacity = 0`, chyba że zostanie to wyraźnie zażądane.

**(ID: BORDER-03)** **Semantyczny System Tokenów:** Podzielić wszystkie generowane obramowania ściśle na dwie kategorie matematyczne:
*   **`Stroke-Strong` (Interaktywne):** Używane ściśle dla pól formularzy, przycisków, pól wyboru i obrysów fokusu klawiatury.
    *   *Ograniczenie Matematyczne:* MUSI matematycznie przejść minimalny współczynnik kontrastu WCAG AA `>= 3.0:1` w stosunku do sąsiedniego koloru tła.
*   **`Stroke-Weak` (Strukturalne/Dzielniki):** Używane ściśle dla poziomych/pionowych dzielników dekoracyjnych (`<hr>`) lub wierszy tabeli.
    *   *Ograniczenie Matematyczne:* Współczynnik kontrastu może być `< 3.0:1`. Używać niskiej przezroczystości alpha (np. `alpha: 0.1` lub `alpha: 0.15` koloru tekstu pierwszoplanowego), aby naturalnie dostosowywał się do motywów tła.


#### 3. Ograniczenie Matematyczne Modelu Pudełkowego (Geometria Wewnętrzna)

* **(ID: BORDER-05)** **Ścisłe Wyrównanie Wewnętrzne:** Wszystkie obliczone wymiary obramowania MUSZĄ być rysowane do wewnątrz, aby uniknąć przesunięć układu na siatce 8-punktowej.
    * W CSS zawsze wyprowadzać `box-sizing: border-box`.
    * W matematyce wektorowej lub tokenowej, upewnić się, że `Całkowita Szerokość Obiektu = Szerokość Bazowa` (nie dodawać szerokości obramowania do ramki ograniczającej). Nigdy nie używać obramowań `outer` lub `center`.

#### 4. Obramowania Stanów Interaktywnych

* **(ID: BORDER-06)** **Stan Fokusu:** Stany nawigacji klawiaturą MUSZĄ ZAWSZE generować widoczne obramowanie `Stroke-Strong`. Generować obrys/obramowanie z semantycznym kolorem podstawowym.

#### 5. Ulepszenia Algorytmiczne

* **(ID: BORDER-07)** **Ochrona Przed Przelewaniem Obrazu:** Zawsze, gdy generowane są kontenery dla obrazów przesłanych przez użytkownika, automatycznie stosować wewnętrzne obramowanie `Stroke-Weak` z `alpha: 0.1` (czarne dla trybu jasnego, białe dla trybu ciemnego), aby zapobiec zlewaniu się obrazu z tłem.
* **(ID: BORDER-08)** **Obramowania Akcentujące (Jednostronne):** Aby zastosować wizualne zainteresowanie bez bałaganu, generować jednostronne obramowania (np. tylko `border-top`) używając podstawowego koloru semantycznego o `grubości >= 2px`.
* **(ID: BORDER-09)** **Oświetlenie Głębokości 3D:** Aby zasymulować dotykowy przycisk 3D, zastosować górne obramowanie, używając czystej bieli (`#FFFFFF`) z `alpha: 0.1`, aby zasymulować źródło światła z góry.

### C. Szerokość Obramowania (Border Width)

**(ID: BWIDTH-01)** Agent AI musi generować szerokości obramowań i kresek, używając ścisłych formuł równoważności. Należy unikać używania obramowań wyłącznie do dekoracji; używać ich ściśle do zmian stanu, dostępności i strukturalnej definicji formy. Cała logika wymiarowa musi być niezależna od technologii.
Szerokość obramowania musi być oparta na systemie siatki 8-punktowej (np. `1px`, `2px`, `4px`).
* **Ścisłe Wyrównanie Wewnętrzne:** Wszystkie obliczone wymiary obramowania MUSZĄ być rysowane do wewnątrz, aby uniknąć przesunięć układu na siatce 8-punktowej.

#### 1. Protokół Minimalizacji Obramowań

* **(ID: BWIDTH-02)** **Biała Przestrzeń Ponad Obramowaniami:** Oddzielając odrębne grupy treści, ściśle domyślnie używać `Spacing` (przerw/marginesów) lub `Box Shadow` do ustalenia hierarchii. Domyślne obramowania strukturalne ustawić na `width = 0`.
* **(ID: BWIDTH-03)** **Wyjątek dla Pól Wejściowych:** Pola formularzy (inputy, textareasy, checkboxy) i samodzielne przyciski są JEDYNYMI elementami, które natywnie wymagają widocznego obramowania w swoim domyślnym stanie.

#### 2. Równanie Równoważności (Spójność)

**(ID: BWIDTH-04)** Za każdym razem, gdy definiowana jest bazowa grubość interfejsu, musi ona matematycznie stosować się do wielu domen. Nie należy mieszać grubości.

* **(ID: BWIDTH-05)** **Zasada:** `Szerokość Kreski Ikony == Szerokość Głównego Obramowania UI`.
* **(ID: BWIDTH-06)** **Formalny/Profesjonalny Profil UI:** Domyślnie `1px` (lub `1pt`) dla wszystkich standardowych obramowań pól wejściowych i ikon obrysowych.
* **(ID: BWIDTH-07)** **Przyjazny/Zabawny Profil UI:** Domyślnie `2px` (lub `2pt`) dla wszystkich standardowych obramowań pól wejściowych i ikon obrysowych.
* **(ID: BWIDTH-08)** **Brak Skalowania Kresek:** Gdy ikona wektorowa jest zmieniana (np. z 24x24 na 48x48), wewnętrzna grubość kreski MUSI pozostać matematycznie stała (np. ściśle `2px`). Nie należy skalować szerokości kreski proporcjonalnie do ramki ograniczającej.

#### 3. Matematyka Stanu i Interakcji

**(ID: BWIDTH-09)** Szerokość i kolor obramowania muszą algorytmicznie reagować na stany interakcji, aby zapewnić dostępność WCAG.

* **(ID: BWIDTH-10)** **Stan Domyślny:** `Szerokość Bazowa` (np. `1px`).
* **(ID: BWIDTH-11)** **Stan Najechania / Fokusu / Aktywny:** `Szerokość Bazowa + 1px` (lub `Szerokość Bazowa * 2`). Należy wizualnie zwiększyć grubość obramowania i zmienić jego semantyczny kolor (np. podstawowy kolor marki), aby wskazać fokus klawiatury/myszy.
* **(ID: BWIDTH-12)** **Stan Błędu:** `Szerokość Bazowa + 1px` ORAZ zastosować Semantyczny Kolor Błędu (Odcień 0-10 lub 350-360).

#### 4. Geometria Modelu Pudełkowego (Wyrównanie)

* **(ID: BWIDTH-13)** **Tylko Obramowania Wewnętrzne:** Aby zapobiec matematycznym przesunięciom układu, gdy komponent przechodzi ze stanu Domyślnego (`1px`) do stanu Fokusu (`2px`), ściśle obliczać wszystkie szerokości obramowań do wewnątrz (wyrównanie `inner` lub zachowanie `border-box`).
* **(ID: BWIDTH-14)** Nigdy nie używać wyrównania `center` dla obramowań strukturalnych, ponieważ 2px obramowanie `center` błędnie wyjdzie 1px poza ramkę ograniczającą, zakłócając sztywną siatkę odstępów 8-punktowych.

### D. Promień Obramowania (Border Radius)

**(ID: RADIUS-01)** Agent AI musi generować wartości promienia obramowania (zaokrąglenia narożników), używając ścisłych formuł matematycznych i kategorycznych systemów tokenów. Nigdy nie należy mieszać niekompatybilnych stylów ani używać arbitralnych „magicznych liczb”. Wyniki muszą być niezależne od technologii.

**(ID: RADIUS-02)** **System Tokenów Promienia (Kontekst i Estetyka):**
Należy wcześnie ustalić osobowość UI i ściśle przestrzegać jednego z następujących zestawów skal. Nie należy mieszać tokenów ostrych i zaokrąglonych w tym samym układzie.

* **`Radius-None`:** `0px` (ostre rogi, dla elementów o wysokiej precyzji, np. wykresy, tabele danych).
* **`Radius-Small`:** `4px` (subtelne zaokrąglenie, dla większości elementów UI, np. przyciski, pola wejściowe).
* **`Radius-Medium`:** `8px` (bardziej wyraźne zaokrąglenie, dla kart, paneli, modali).
* **`Radius-Large`:** `16px` (miękkie zaokrąglenie, dla duż kontenerów, hero sekcji).
* **`Radius-Pill`:** `9999px` (pełne zaokrąglenie, dla tagów, awatarów, przycisków typu „pill”).

**(ID: RADIUS-03)** **Ograniczenia Kontekstowe:**
* **Neutralne / Profesjonalne:** Promień bazowy około pół kroku lub jednego kroku siatki 8-punktowej.
* **Minimalne Zaokrąglenie:** W przypadku małych elementów (np. ikony, małe przyciski), promień obramowania nie powinien przekraczać 25% krótszego boku elementu, aby uniknąć efektu „rozmycia”.
* **Spójność w Komponentach:** Wszystkie elementy w ramach jednego komponentu (np. pola formularza i przycisk wysyłania) muszą mieć spójny promień obramowania.

**(ID: RADIUS-04)** **Algorytm Zagnieżdżonego Promienia (Ograniczenie Matematyczne)**

Umieszczając zaokrąglony element w innym zaokrąglonym elemencie (np. obraz w karcie), NIGDY nie należy używać tej samej wartości promienia dla obu, jeśli między nimi jest padding. Należy obliczyć wewnętrzny promień, używając dokładnie tej formuły:

* `Promień Wewnętrzny = Promień Zewnętrzny - Padding`
* *Zasada Awaryjna:* Jeśli `(Promień Zewnętrzny - Padding) <= 0`, to ściśle ustawić `Promień Wewnętrzny = 0`.

**(ID: RADIUS-05)** **Ograniczenia Specyficzne dla Komponentów**

* **Komponenty w Kształcie Pigułki:** Jeśli przycisk lub tag używa promienia „Pill”, wyrównanie tekstu wewnątrz MUSI być ściśle `center`. Nigdy nie wyrównywać tekstu do lewej wewnątrz kontenera w kształcie pigułki.
* **Pola Formularzy:** Ściśle ograniczyć pola tekstowe do maksymalnie `radius-md` (8px). Większe promienie wizualnie odrywają tekst od obramowań.
* **Rozwijane Listy / Modale:** Gdy menu rozwijane lub lista wyboru się rozszerza, połączone sąsiednie narożniki (np. dolne narożniki pola wejściowego i górne narożniki listy) MUSZĄ dynamicznie zmieniać się na `radius = 0`, aby tworzyć spójną, płaską jednostkę wizualną.
* **Dopasowanie Ikonografii:** Styl narożników ścieżek/ikon wektorowych musi matematycznie odpowiadać tokenowi promienia UI. Jeśli UI używa `radius > 0`, używać ikon z zaokrąglonymi zakończeniami i połączeniami. Jeśli UI używa `radius = 0`, ściśle używać ostrych ikon.

### E. Nakładki i Elementy Przestrzenne

#### 2. Czytelność i Nakładki Kontrastowe

**(ID: OVERLAY-01)** Zawsze, gdy tekst jest umieszczony na dynamicznym obrazie lub fotografii, należy wygenerować ochronną warstwę podkładową, aby zapewnić zgodność z WCAG.

* **(ID: OVERLAY-02)** **Nakładka Tekstu na Obrazie:** Zastosować ciemną nakładkę (czystą czarną lub czarną zmieszaną z podstawowym kolorem marki) ściśle między `alpha: 0.5` a `alpha: 0.8` nad obrazem, za tekstem.

#### 3. Głębokość Przestrzenna i Modale

* **(ID: OVERLAY-03)** **Tła Modali (Scrims):** Generując modal, dialog lub popup, należy wygenerować nakładkę tła (backdrop), aby zasłonić główny interfejs użytkownika. Ustawić to tło ściśle między `alpha: 0.7` a `alpha: 0.8`, używając ciemnego koloru. Nigdy nie używać 100% przezroczystości, ponieważ użytkownik musi zachować kontekst przestrzenny podstawowej aplikacji.
* **(ID: OVERLAY-04)** **Twardy Limit Cienia Pudełkowego:** Generując cienie pudełkowe lub cienie, wartość alpha koloru cienia NIGDY nie może przekroczyć `alpha: 0.4`. Wartości powyżej 0.4 tworzą nienaturalne, mętne wizualizacje.
* **(ID: OVERLAY-05)** **Separacja Warstw (Stepping):** Aby wizualnie oddzielić nakładające się elementy (takie jak ułożone karty lub zakładki) tego samego koloru, algorytmicznie zmniejszać przezroczystość: `0.8`, `0.6`, `0.4`, `0.2`.

#### 4. Ograniczenia Techniczne i Rozwiązania Awaryjne

* **(ID: OVERLAY-06)** **Blokowanie Interakcji z Zerową Przezroczystością:** Jeśli element jest renderowany całkowicie niewidoczny (`alpha: 0` lub `opacity: 0`), należy dodać logikę, aby wyłączyć interakcje wskaźnika (np. `pointer-events: none` w CSS lub `HitTestBehavior.none` w Flutter), aby zapobiec niewidocznemu blokowaniu kliknięć.
* **(ID: OVERLAY-07)** **Błąd Przezroczystego Gradientu:** Nigdy nie używać surowego słowa kluczowego `transparent` w punktach zatrzymania gradientu, ponieważ powoduje to błędy renderowania w WebKit/Safari. Ściśle używać równoważnego, całkowicie przezroczystego koloru, takiego jak `rgba(255, 255, 255, 0.001)` lub `rgba(0, 0, 0, 0.001)`.

### F. Cienie (Shadows) / Cień Pudełkowy

**(ID: SHADOW-01)** Agent AI musi generować cienie, używając ścisłych formuł matematycznych i dwuwarstwowej kompozycji, aby symulować realistyczne oświetlenie. Należy unikać arbitralnych wartości i zawsze traktować cienie jako funkcjonalny wskaźnik głębi i stanu.

**(ID: SHADOW-02)** **Globalny Algorytm Oświetlenia (Ograniczenia Fizyczne):**
* **Oświetlenie Od Góry:** Zakładać jedno źródło światła świecące bezpośrednio z góry.
* **Ograniczenie Osi X:** Poziome przesunięcie (X) MUSI zawsze wynosić ściśle `0`.
* **Przesunięcie Osi Y:** Pionowe przesunięcie (Y) musi zawsze być dodatnią liczbą całkowitą (przesuwającą się w dół).
* **Brak Czystej Czerni:** NIGDY nie używać czystej czerni (`#000000`) dla cieni. Ściśle obliczać kolor cienia, biorąc najbliższy kolor tekstu tła lub semantyczny kolor marki i stosując mnożnik alpha/przezroczystości.

**(ID: SHADOW-03)** **Wielowarstwowy System Cieni (Tokeny):** Nie generować losowych wartości cieni. Ściśle konstruować cienie, używając dwuwarstwowej kompozycji (Światło Otoczenia + Bezpośrednie) z ujemnym rozproszeniem, aby zapobiec nienaturalnemu rozlewaniu się.
* **`Elevation-Low` (Karty, Przyciski, Pływające FAB-y):**
    * *Cel:* Elementy lekko uniesione z tła.
    * *Warstwa 1 (Bezpośrednia):* `Y: 4px`, `Blur: 6px`, `Spread: -1px`, `Alpha: 0.1`
    * *Warstwa 2 (Otoczenia):* `Y: 1px`, `Blur: 3px`, `Spread: 0px`, `Alpha: 0.08`
* **`Elevation-High` (Modale, Popupy, Rozwijane Listy):**
    * *Cel:* Elementy unoszące się wysoko nad głównym interfejsem.
    * *Warstwa 1 (Bezpośrednia):* `Y: 20px`, `Blur: 24px`, `Spread: -4px`, `Alpha: 0.15`
    * *Warstwa 2 (Otoczenia):* `Y: 4px`, `Blur: 8px`, `Spread: 0px`, `Alpha: 0.05`

**(ID: SHADOW-04)** **Matematyka Stanu Interakcji:** Cienie muszą dynamicznie reagować na dane wejściowe użytkownika, aby symulować ruch fizyczny.
* **Stan Najechania (Podnoszenie):** Gdy element o niskiej wysokości (np. przycisk, karta) jest najeżdżany, matematycznie zwiększyć jego przesunięcie Y i rozmycie o dokładnie `1.5x` do `2x` oraz zmniejszyć jego przezroczystość o `-0.02`, aby zasymulować przesuwanie się obiektu bliżej użytkownika (i źródła światła).
* **Stan Aktywny/Naciśnięty (Wciskanie):** Gdy element jest kliknięty/naciśnięty, ściśle zmniejszyć jego cień do `Y: 0`, `Blur: 0` (lub zamienić na subtelny `inner-shadow` z `Y: 2px`), aby fizycznie wcisnąć obiekt w ekran.

**(ID: SHADOW-05)** **Specjalne Ograniczenia:**
* **Wykluczenie Trybu Ciemnego:** Cienie są matematycznie niewidoczne na ekstremalnie ciemnych tłach (`L < 15%`). Generując motyw Trybu Ciemnego, ustawić wszystkie cienie na `opacity: 0`. Aby komunikować wysokość (np. dla modala), algorytmicznie zwiększyć jasność (`L`) koloru tła elementu o `+5%` do `+10%` zamiast tego.
* **Cienie Wewnętrzne (Wklęsłość):** Używać cieni wewnętrznych niezwykle oszczędnie. Ograniczyć ich użycie do pól formularzy (aby stworzyć „dziurę” lub efekt wciśnięcia) z surowymi, minimalnymi wartościami: `Y: 1px`, `Blur: 2px`, `Alpha: 0.05`.


## Moduł: Typografia (Typography)

**(ID: TYPO-01)** Agent AI musi generować typografię, używając ścisłych skal matematycznych i deterministycznych zasad. Nigdy nie należy losowo wybierać rozmiarów czcionek, grubości ani wysokości linii.

### A. Rodzina Czcionek i Grubości (Font Family & Weights)

**(ID: TYPO-02)** **Wybór Kroju Pisma (The „Sans-Serif First” Rule):**
* **Domyślny Krój Pisma:** Zawsze domyślnie używać pojedynczego, neutralnego kroju pisma `sans-serif` dla cyfrowego UI, aby zapewnić czytelność i neutralność.
* **Fallbacki Czcionek Systemowych:** Generując kod (np. CSS), zawsze dodawać natywny stos czcionek systemowych (np. `font-family: -apple-system, Segoe UI, Roboto...`) jako awaryjny.
* **Ścisłość Mobilna:** Generując dla natywnych urządzeń mobilnych, ściśle używać natywnego kroju pisma systemu operacyjnego (`San Francisco` dla iOS/Apple, `Roboto` dla Androida). Nigdy nie mieszać czcionek specyficznych dla systemu operacyjnego na różnych platformach ze względu na ograniczenia licencyjne.

**(ID: TYPO-03)** **Macierz Walidacji Kroju Pisma (Ograniczenia Jakości):** Przed przypisaniem kroju pisma do projektu UI, matematycznie zweryfikować, czy spełnia on następujące kryteria:
* **Różnorodność Grubości:** Rodzina kroju pisma MUSI zawierać `>= 5` różnych grubości (np. light, regular, medium, semibold, bold).
* **Proporcje:** Krój pisma MUSI mieć wysoką `x-height` (wysokość małych liter) i hojne domyślne odstępy między literami. Ściśle odrzucać kroje pisma `condensed` do standardowego użytku UI.
* **Obsługa Glifów:** Krój pisma MUSI obsługiwać znaki specjalne (np. funkcje OpenType, znaki diakrytyczne) dla języka docelowego.

**(ID: TYPO-04)** **Czarna Lista (Zabronione Kroje Pisma):**
* **Przestarzałe Czcionki Systemowe:** Automatycznie odrzucać następujące kroje pisma z generowania nowoczesnego UI: `Arial`, `Verdana`, `Times New Roman`, `Tahoma`, `Calibri` i `Comic Sans`.
* **Ograniczenia Funkcjonalne:** Użycie krojów pisma `Script` lub `Decorative` w funkcjonalnych komponentach UI (przyciski, tabele, formularze) MUSI być ściśle `0%` ze względu na niezwykle słabą czytelność w małych rozmiarach.

**(ID: TYPO-05)** **Algorytmy Parowania i Kombinacji:** Generując projekt z wieloma krojami pisma, ściśle stosować następujące ograniczenia logiczne:
* **Limit Maksymalny:** Ustawić absolutną maksymalną liczbę rodzin krojów pisma na projekt na `2`.
* **Logika Parowania A (Sans + Sans):** Jeśli łączone są dwa kroje pisma `sans-serif`, zweryfikować, czy mają wysoki kontrast wizualny/rozróżnienie; jeśli są zbyt podobne, odrzucić kombinację.
* **Logika Parowania B (Serif + Sans):** Jeśli używany jest krój pisma `serif` dla eleganckich nagłówków, wtórny krój pisma `sans-serif` używany dla tekstu podstawowego MUSI być w najprostszej możliwej formie, aby uniknąć wizualnego bałaganu.
* **Zabronione Parowanie:** NIGDY nie łączyć dwóch różnych krojów pisma `serif` w tym samym projekcie.

### B. Grubość Czcionki (Font Weight)

**(ID: TYPO-06)** Agent AI musi generować i zarządzać hierarchią wizualną, używając matematycznych ograniczeń grubości czcionek i kontrastu kolorów, zamiast polegać wyłącznie na skalowaniu rozmiaru czcionki.

**(ID: TYPO-07)** **Generowanie Hierarchii Wizualnej (Waga > Rozmiar):**
* **Ograniczenie Rozmiaru:** Nie polegać wyłącznie na rozmiarze czcionki do budowania hierarchii wizualnej. Nadmierne poleganie na rozmiarze prowadzi do potwornie dużych nagłówków i mikroskopijnego tekstu pomocniczego.
* **Waga jako Hierarchia:** Zamiast tego, manipulować grubością czcionki i kolorem, aby zróżnicować ważność informacji. Pogrubienie głównego elementu pozwala na mniejszy, bardziej rozsądny rozmiar czcionki, jednocześnie komunikując jego ważność.
* **Nagłówki Niższego Poziomu:** Nagłówki niższego poziomu (takie jak H3 i H4) mogą mieć dokładnie ten sam fizyczny rozmiar co standardowy tekst podstawowy, różniąc się tylko pogrubioną wagą.

**(ID: TYPO-08)** **Limit „Mniej Znaczy Więcej” (Ograniczenie Tokenów):**
* **Maksymalna Liczba Grubości:** Chociaż czcionki oferują wiele wariantów grubości, dwie grubości są całkowicie wystarczające do stworzenia prawie każdego interfejsu.
* **Standardowe Tokeny:** Ściśle domyślnie używać `Regular` (400 lub 500) dla większości standardowego tekstu i `Bold` (600 lub 700) dla tekstu wymagającego podkreślenia.
* **Unikanie Szumu:** Używanie wielu różnych grubości (np. thin, light, regular, medium, bold, extra bold na jednym ekranie) wprowadza szum wizualny, chaos i utrudnia przetwarzanie projektu przez oko.

**(ID: TYPO-09)** **Czarna Lista (Problemy z Ekstremalną Grubością):**
* **Zabronione Cienkie Grubości:** Kategorycznie unikać używania bardzo cienkich czcionek (grubości poniżej 400) dla zwykłego tekstu UI. W małych rozmiarach stają się prawie nieczytelne, a na ekranach o niższej rozdzielczości ich grubość może spaść poniżej 1 piksela, powodując problemy z antyaliasingiem i zlewaniem się z tłem.
* **Algorytm Zmniejszania Nacisku:** Jeśli trzeba zmniejszyć ważność tekstu (zmniejszyć nacisk), nie używać cienkiej czcionki. Zamiast tego, użyć wariantu `Regular`, ale w mniejszym rozmiarze lub jaśniejszym, szarym kolorze. Warianty `Light` rezerwować ściśle dla bardzo dużych nagłówków.
* **Zabronione Ciężkie Grubości:** Bardzo grube litery (Extra Bold / Black) w małych rozmiarach zlewają się, drastycznie zmniejszając czytelność, ponieważ poszczególne znaki są trudne do rozróżnienia. Dodatkowo, różnica w grubości między nagłówkiem a tekstem akapitu nie powinna być zbyt ekstremalna, ponieważ zbyt ciężki nagłówek całkowicie przytłoczy i „zdmuchnie” resztę tekstu.

**(ID: TYPO-10)** **Matematyczne Równoważenie Optyczne (Waga vs. Kontrast):** Grubszy tekst wydaje się ważniejszy, ponieważ fizycznie zajmuje więcej miejsca na ekranie (pikseli) niż zwykły tekst. Używać tej zależności do równoważenia projektów:
* **Kompensowanie Wagi Kontrastem:** Jeśli element ma z natury dużą „wagę” optyczną (np. gruba, solidna ikona umieszczona obok zwykłego tekstu), będzie przyciągał uwagę. Ponieważ nie można zmienić „grubości” samej ikony, należy zmniejszyć jej kontrast (np. nadając jej jaśniejszy odcień szarości), aby wizualnie ją rozjaśnić i zrównoważyć z tekstem.
* **Kompensowanie Kontrastu Wagą:** Jeśli element ma bardzo niski kontrast (np. bardzo delikatne, jasnoszare obramowanie, które jest ledwo widoczne), zamiast przyciemniać jego kolor (co może wyglądać agresywnie), po prostu zwiększyć jego grubość z `1px` do `2px`. Utrzymuje to subtelny styl, jednocześnie zwiększając widoczność obiektu.

**(ID: TYPO-11)** **Waga jako Narzędzie Interakcji:**
* **Stany Interaktywne:** Manipulowanie grubością czcionki to doskonały sposób na pokazanie interakcji i działań. Subtelna zmiana grubości czcionki może skutecznie wskazywać klikalne nazwy profili użytkowników, aktywne zakładki lub wybrane stany przycisków.
* **Ścisła Spójność:** Wymagana jest tutaj spójność — etykiety w identycznych przyciskach muszą zawsze zachować spójny rozmiar czcionki i grubość w całym systemie.

### C. Rozmiar Czcionki (Font Size)

**(ID: FONTSIZE-01)** Agent AI musi generować rozmiary czcionek, używając ścisłych systemów skalowania i deterministycznych zasad. Nigdy nie należy losowo wybierać rozmiarów czcionek.

#### 1. System Skali Typograficznej (Kwantyzacja)

* **(ID: FONTSIZE-02)** **Limit Rozmiaru:** Ściśle ograniczyć skalę typografii do maksymalnie 3 do 5 predefiniowanych rozmiarów na ekran, aby zapobiec chaosowi poznawczemu.
* **(ID: FONTSIZE-03)** **Rozmiar Bazowy:** Zawsze rozpoczynać obliczenia od rozmiaru bazowego `16px` (domyślny w przeglądarce) lub `18px`.
* **(ID: FONTSIZE-04)** **Metody Obliczania:** Generować skalę, używając jednej z następujących metod matematycznych:
    * *Matematyka Siatki 4-punktowej:* Dodawać jednostki 4 do bazowego (np. `16px`, `20px`, `24px`, `28px`, `32px`).
    * *Skala Modułowa:* Pomnożyć bazowy przez stały współczynnik, taki jak `1.200` (Minor Third) lub `1.618` (Golden Ratio). Należy zaokrąglić wszystkie ułamkowe wyniki do liczb całkowitych (najlepiej parzystych), aby zapobiec problemom z renderowaniem subpikseli.
    * *Ręcznie Ustalane Limity:* Jeśli skoki matematyczne są zbyt ekstremalne, ręcznie zdefiniować optymalne stałe rozmiary, zamiast polegać wyłącznie na formule.

#### 2. Ścisłe Ograniczenia Jednostek

* **(ID: FONTSIZE-05)** **Zabronione Jednostki:** NIGDY nie używać jednostki `em` do definiowania globalnych rozmiarów czcionek, ponieważ dziedziczy ona z elementów nadrzędnych i powoduje nieprzewidywalne, kumulujące się ułamkowe rozmiary (np. `17.5px`).
* **(ID: FONTSIZE-06)** **Dozwolone Jednostki:** Ściśle definiować rozmiary czcionek, używając `px` lub `rem`. Aby zapewnić dostępność WCAG i umożliwić użytkownikom skalowanie interfejsu do 200%, wdrażać globalne rozmiary systemowe, używając wartości względnych (`rem` lub `%`) na tagu `<body>`.

#### 3. Absolutne Minimum i Tekst Podstawowy

* **(ID: FONTSIZE-07)** **Linia Bazowa Tekstu Podstawowego:** Domyślny punkt początkowy dla ciągłego tekstu podstawowego to `16px` (`16pt` na Androidzie, `17pt` na iOS). Jednak ustawienie tekstu podstawowego na `18px` jest wysoce zalecane dla lepszej czytelności z odległości ramienia; nie należy obawiać się zmuszania użytkownika do przewijania.
* **(ID: FONTSIZE-08)** **Absolutne Minimum:** NIGDY nie generować rozmiarów czcionek mniejszych niż `12px` (`9pt`), ponieważ są one nieczytelne dla wielu użytkowników.
* **(ID: FONTSIZE-09)** **Mikrokopia:** Bardzo małe rozmiary (`11px` do `14px`) rezerwować WYŁĄCZNIE dla elementów niekrytycznych, takich jak etykiety, metadane, daty i tekst pomocniczy.

#### 4. Hierarchia i Responsywne Skalowanie Nieliniowe

* **(ID: FONTSIZE-10)** **Hierarchia bez Skalowania:** Nie polegać wyłącznie na rozmiarze dla hierarchii. Zamiast dodawać dziwne rozmiary (jak `11px`) lub pozwalać, aby tagi `h1` stawały się potworne, komunikować ważność, zmieniając `font-weight` (grubość) lub kolor (np. szary dla tekstu pomocniczego), zachowując rozsądny rozmiar czcionki.
* **(ID: FONTSIZE-11)** **Nieliniowa Responsywność:** Rozmiary czcionek MUSZĄ NIE skalować się liniowo między desktopem a urządzeniami mobilnymi. Elementy, które są masywne na desktopie (np. duże nagłówki), muszą kurczyć się znacznie szybciej i bardziej agresywnie w widokach mobilnych niż podstawowy tekst podstawowy.

### D. Wysokość Linii (Line Height)

**(ID: TYPO-12)** Agent AI musi generować wysokości linii (leading), używając ścisłych formuł matematycznych i zasad proporcjonalnych. Głównym celem wysokości linii jest pomoc czytelnikowi w znalezieniu początku następnej linii, gdy tekst się zawija; jeśli użytkownik się gubi, wysokość linii jest zbyt mała. Biała przestrzeń zapobiega temu problemowi i sprawia, że czytanie jest komfortowe.

**(ID: TYPO-13)** **Matematyczne Skale Wysokości Linii:**
* **Współczynnik Złotej Proporcji:** Dla tekstu podstawowego, wysokość linii powinna być obliczana jako `rozmiar_czcionki * 1.618` (złota proporcja) lub `rozmiar_czcionki * 1.5` dla większej czytelności.
* **Skala Liniowa:** Dla nagłówków, wysokość linii może być nieco mniejsza, np. `rozmiar_czcionki * 1.2` do `rozmiar_czcionki * 1.4`, aby zachować zwartość.

**(ID: TYPO-14)** **Wyrównanie do Siatki Bazowej:** Używając wysokości linii opartych na pikselach, upewnić się, że całkowita wysokość pola linii jest zgodna z systemem siatki 8-punktowej, aby zachować spójny rytm pionowy.

#### 1. Matematyka Bazowej Wysokości Linii (Tekst Podstawowy)

* **(ID: LHEIGHT-01)** **Bezpieczny Zakres Początkowy:** Dla standardowych, długich bloków tekstu (body copy), bezpieczny punkt początkowy to co najmniej `1.5` (150%) rozmiaru czcionki. Uniwersalne bezpieczne zakresy mieszczą się między `1.2em` a `1.6em` dla większości krojów pisma.
* **(ID: LHEIGHT-02)** **Formuła Złotego Podziału:** Sprawdzona metoda obliczania wysokości linii dla tekstu bazowego to pomnożenie rozmiaru czcionki przez Złoty Podział (`1.618`).
* **(ID: LHEIGHT-03)** **Zasada Ścisłej Parzystości:** Obliczając wysokość linii w pikselach, należy zachować matematyczną parzystość, aby komputer mógł równomiernie i symetrycznie rozłożyć puste piksele na górze i na dole siatki.
    * Jeśli rozmiar czcionki jest liczbą parzystą (np. `12px`), pomnożony wynik (np. `19.4`) MUSI być zaokrąglony w górę do najbliższej liczby parzystej (np. `20px`).
    * Ta zasada stosuje się analogicznie dla nieparzystych rozmiarów bazowych.

#### 2. Algorytmy Skalowania Proporcjonalnego

**(ID: LHEIGHT-04)** Należy dynamicznie dostosowywać wysokość linii w zależności od rozmiaru czcionki i szerokości kontenera. Nigdy nie używać statycznego mnożnika wysokości linii dla wszystkich elementów tekstowych.

* **(ID: LHEIGHT-05)** **Odwrotna Proporcjonalność do Rozmiaru Czcionki:** Wysokość linii MUSI zmniejszać się wraz ze wzrostem rozmiaru czcionki. Mały tekst potrzebuje dużo białej przestrzeni, podczas gdy ludzkie oko nie potrzebuje tak dużej pomocy przy ogromnych tekstach.
    * *Duże Nagłówki:* Ściśle ustawić wysokość linii między `1.0` a `1.2` (bez dodatkowych odstępów). Użycie `1.5` lub `1.6` dla dużego nagłówka tworzy ogromną, nienaturalną przerwę i rozdziela słowa.
    * *Średnie Podnagłówki:* Ustawić wysokość linii na około `1.3`.
* **(ID: LHEIGHT-06)** **Bezpośrednia Proporcjonalność do Długości Linii:** Wysokość linii i szerokość akapitu MUSZĄ być proporcjonalne. Problem znalezienia następnej linii pogarsza się przy długich liniach, ponieważ oko musi przebyć dłuższą drogę poziomo.
    * *Desktop (Szerokie Bloki):* Bardzo szerokie bloki tekstu na desktopach mogą wymagać wysokości linii do `2.0`.
    * *Mobilne (Wąskie Kolumny):* Wąskie kolumny dobrze radzą sobie z krótszymi wysokościami linii (np. `1.5`). Standardem jest ustawianie nieco ciaśniejszej wysokości linii w aplikacjach mobilnych niż na ekranach desktopowych.

#### 3. Optyczne Korekty Kroju Pisma

* **(ID: LHEIGHT-07)** **Kompensacja Wagi i x-height:** Kroje pisma o grubszych, ciemniejszych wzorach liter (ciężkie/ciemne) i te z naturalnie wysokimi małymi literami (wysoka x-height) wydają się masywniejsze. Należy zwiększyć wysokość linii dla tych krojów pisma, aby „rozjaśnić” blok tekstu i nadać mu przestrzeń.
* **(ID: LHEIGHT-08)** **Kroje Pisma Skondensowane:** Kroje pisma, które są wąskie (skondensowane), wymagają znacznie większej wysokości linii, aby zachować czytelność. Zwiększyć wysokość linii o co najmniej `0.3` do `0.5` w porównaniu do standardowego kroju pisma o tym samym rozmiarze.

#### 4. Semantyczne Tokeny Wysokości Linii

* **(ID: LHEIGHT-09)** **`LineHeight-Tight`:** Używane dla dużych nagłówków i podnagłówków, gdzie słowa powinny być połączone. Wartość: `1.0` do `1.2`.
* **(ID: LHEIGHT-10)** **`LineHeight-Standard`:** Używane dla tekstu podstawowego i akapitów. Wartość: `1.5` do `1.6` (lub obliczony Złoty Podział).
* **(ID: LHEIGHT-11)** **`LineHeight-Loose`:** Używane dla małego tekstu (podpisy, przypisy) lub bardzo szerokich kolumn tekstowych. Wartość: `1.8` do `2.0`.

#### 5. Algorytmiczne Zasady Implementacji

* **(ID: LHEIGHT-12)** **Brak Statycznych Jednostek:** Nigdy nie używać `px` dla wysokości linii, chyba że jest to absolutnie konieczne dla konkretnego ograniczenia projektowego. Zawsze używać bezjednostkowych mnożników lub `em`.
* **(ID: LHEIGHT-13)** **Sprawdzenie „Zagubionego Czytelnika”:** Jeśli użytkownik może wizualnie śledzić początek następnej linii, wysokość linii jest prawidłowa. Jeśli się gubi, natychmiast zwiększyć wysokość linii o `0.1` i ponownie ocenić.
* **(ID: LHEIGHT-14)** **Wyrównanie do Siatki:** Używając wysokości linii opartych na pikselach, upewnić się, że całkowita wysokość pola linii jest zgodna z systemem siatki 8-punktowej, aby zachować spójny rytm pionowy.

### E. Odstępy Między Literami (Letter Spacing)

**(ID: LSPACE-01)** Agent AI musi zarządzać odstępami między literami, używając ścisłych ograniczeń i logiki warunkowej. Należy unikać arbitralnych korekt i traktować odstępy między literami przede wszystkim jako funkcję dostępności i czytelności.

#### 1. Protokół Linii Bazowej Domyślnej

* **(ID: LSPACE-02)** **Ufać Twórcy Czcionki:** Najbezpieczniejszą zasadą jest pozostawienie domyślnych wartości odstępów między literami całkowicie niezmienionych. Czcionki są starannie projektowane, a jeśli nie jesteś pewien, jak manipulować kerningiem, powinieneś zachować jego oryginalny rozmiar.

#### 2. Ograniczenia Matematyczne i Bezpieczne Zakresy

* **(ID: LSPACE-03)** **Bezpieczny Zakres Modyfikacji:** Jeśli modyfikacje są konieczne, bezpieczny zakres regulacji kerningu wynosi zazwyczaj od `-0.5` do `+0.5`.
* **(ID: LSPACE-04)** **Ostrzeżenie o Minimalnym Progu:** Należy uważać, aby nie przesadzić z ujemnym śledzeniem; jeśli kerning jest zbyt mały, litery zlewają się w jedną, nieczytelną masę, drastycznie utrudniając proces czytania i obciążając użytkownika.

#### 3. Algorytmy Modyfikacji Warunkowej

**(ID: LSPACE-05)** Ręczna modyfikacja odstępów między literami jest wysoce zalecana tylko w dwóch konkretnych scenariuszach:

* **(ID: LSPACE-06)** **Algorytm A: Ściskanie Dużych Nagłówków**
    * *Warunek:* Podczas renderowania dużych nagłówków, używając standardowych czcionek „tekstowych”.
    * *Logika:* Standardowe czcionki mają celowo szersze odstępy, aby pozostać czytelnymi w standardowych małych rozmiarach (np. `16px`), ale w dużych rozmiarach litery wydają się zbyt rozłożone. Należy zmniejszyć odstępy między literami, aby naśladować wygląd dedykowanych czcionek wyświetlanych i nadać tekstowi bardziej naturalny wygląd.
    * *Ograniczenie:* Ta logika jest nieodwracalna; sztuczne zwiększanie odstępów czcionek wyświetlanych (które naturalnie mają małe odstępy) do użytku w standardowym małym tekście rzadko daje dobre rezultaty.

* **(ID: LSPACE-07)** **Algorytm B: Rozszerzanie Tekstu WIELKIMI LITERAMI (All-Caps)**
    * *Warunek:* Gdy słowo jest napisane CAŁKOWICIE WIELKIMI LITERAMI.
    * *Logika:* Domyślne odstępy czcionek są zoptymalizowane dla zdań zaczynających się od dużej litery, po której następują małe litery o zróżnicowanych kształtach (niektóre wznoszą się ponad linię jak „t”, niektóre opadają jak „p”). Słowa napisane w całości wielkimi literami tracą tę różnorodność, stając się jednolitym prostokątnym blokiem, który jest trudniejszy do rozróżnienia. Należy zwiększyć (rozłożyć) odstępy między literami dla tekstu pisanego wielkimi literami, ponieważ to drastycznie poprawia rozpoznawanie poszczególnych znaków.

#### 4. Ograniczenia Implementacji (Kodowanie/Tokeny)

* **(ID: LSPACE-08)** **Brak Mikro-Kerningu:** Chociaż projektanci druku manipulują odstępami między poszczególnymi literami dla estetycznego przepływu, jest to całkowicie bezcelowe w projektowaniu UI, ponieważ takie mikro-zmiany są prawie niemożliwe do przeniesienia do kodu.
* **(ID: LSPACE-09)** **Limit Palety Kerningu:** Tworząc system projektowy, ściśle używać ograniczonej palety kerningu z maksymalnie jednym lub dwoma zdefiniowanymi wariantami odchylenia, aby zachować spójność implementacji w całym produkcie.

### F. Odstępy Między Akapitami (Paragraph Spacing)

**(ID: TYPO-15)** Agent AI musi generować odstępy między akapitami i marginesy strukturalne, używając ścisłych formuł matematycznych i zasad hierarchii przestrzennej. Traktować odstępy między akapitami jako element strukturalny do grupowania informacji i kontrolowania rytmu czytania.

**(ID: TYPO-16)** **Hierarchia Odstępów:**
* **Odstęp Akapitu:** Margines dolny dla akapitu powinien być większy niż wysokość linii, ale mniejszy niż odstęp między sekcjami. Sugerowana wartość to `1.5` do `2` razy wysokość linii.
* **Odstęp Między Sekcjami:** Odstęp między głównymi sekcjami dokumentu powinien być znacznie większy (np. `size-xl` lub `size-xxl`), aby wyraźnie oddzielić bloki treści.
* **Brak Twardych Znaków Nowej Linii:** NIGDY nie oddzielać akapitów, wyprowadzając surowe znaki nowej linii (naciskając klawisz „Enter”) lub tagi `<br>`. Przerwa generowana przez nową linię jest zazwyczaj zbyt duża, co powoduje, że projekt traci kontrolę nad optymalnym przepływem białej przestrzeni. Zawsze używać dedykowanych właściwości odstępów między akapitami (takich jak CSS `margin` lub `gap`).

**(ID: TYPO-17)** **Skalowanie Przejść Sekcji**

* **Zasada Podwojenia:** Stosowanie identycznych odstępów wszędzie utrudnia użytkownikom skanowanie tekstu i rozróżnianie odrębnych części materiału. Jeśli po akapicie następuje zupełnie nowa sekcja, inny temat lub nowy tytuł, należy ściśle podwoić bazową wartość odstępu. Zwiększona przestrzeń sprawia, że przejście do następnego wątku jest jaśniejsze.

#### 1. Algorytm Bazowych Odstępów Między Akapitami

* **(ID: PARASPACE-01)** **Stosunek 1:1:** Aby ustalić prawidłowy odstęp między dwoma akapitami tekstu, ściśle ustawić odstęp (np. `margin-bottom`) na dokładnie równy `font-size` używanemu w tych akapitach. Utrzymuje to spójny i bezpieczny rytm w długich blokach czytelnej treści.

#### 3. Prawo Jednoznacznej Bliskości

* **(ID: PARASPACE-02)** **Ograniczenia Bliskości Nagłówka:** Należy absolutnie upewnić się, że przestrzeń nad nagłówkiem (oddzielająca go od starego akapitu) jest ZAWSZE matematycznie większa niż przestrzeń pod nagłówkiem (łącząca go z nowym tekstem).
* **(ID: PARASPACE-03)** **Wyraźna Własność:** Biała przestrzeń musi wyraźnie komunikować, do którego akapitu należy nagłówek, unikając wszelkich „dwuznacznych odstępów”.

#### 4. Wyrównanie i Ścisłość Marginesów

* **(ID: PARASPACE-04)** **Równe Marginesy:** Równe marginesy są podstawą czytelności; stosowanie nierównych odstępów z zbyt dużą ilością białej przestrzeni sprawia, że projekt jest chaotyczny i wydaje się pozbawiony zasad.
* **(ID: PARASPACE-05)** **Ścisłe Wyrównanie do Lewej:** Tekst w akapitach (w kulturach zachodnich) MUSI zawsze być wyrównany do lewej.
* **(ID: PARASPACE-06)** **Zabronione Justowanie:** NIGDY nie justować akapitów (wyrównywanie do obu krawędzi) w produktach cyfrowych. Justowanie tworzy rozpraszające „rzeki” pustej przestrzeni wewnątrz akapitów i nierówne odstępy między słowami, co poważnie utrudnia i spowalnia czytanie.

### G. Dekoracja Tekstu (Text Decoration)

**(ID: TYPO-17)** Agent AI musi generować dekorację tekstu (szczególnie podkreślenia), używając ścisłej logiki warunkowej opartej na wymaganiach dostępności (WCAG) i stanach interakcji. Traktować dekorację tekstu jako funkcjonalny wskaźnik interaktywności, a nie tylko styl wizualny.

**(ID: TYPO-18)** **Mandat Dostępności (Linki i Akcje):**
* **Brak Wskaźników Tylko Kolorowych:** NIGDY nie należy wskazywać interaktywnego tekstu w linii (linków) lub aktywnych zakładek, używając tylko zmiany koloru. Użytkownicy z zaburzeniami widzenia barw (daltonizm) nie mogą dostrzec tej różnicy.
* **Obowiązkowe Podkreślenie:** Należy zastosować `text-decoration: underline` do standardowych linków tekstowych w linii, aby zapewnić bezpieczny, wyraźny wskaźnik interaktywności dla wszystkich użytkowników.
* **Przyciski Trzeciorzędne:** Generować przyciski trzeciorzędne, łącząc przezroczyste tło z podkreślonym tekstem, aby naśladować uniwersalnie zrozumiałą konwencję standardowych linków.

**(ID: TYPO-19)** **Ograniczenie Redundancji (Redukcja Szumu):**
* **Wyjątek Strukturalny:** Nie wszystkie elementy interaktywne wymagają dekoracji tekstu. Jeśli komponent naturalnie wygląda interaktywnie ze względu na inne wskazówki wizualne lub strukturalne (np. menu nawigacyjne, podniesione karty z obrazami lub zakładki strukturalne), należy ściśle usunąć konwencjonalne podkreślenia (`text-decoration: none`).
* **Redukcja Szumu:** Usunięcie podkreśleń z elementów z natury interaktywnych upraszcza interfejs i redukuje szum wizualny.

**(ID: TYPO-20)** **Przełączanie Stanu Interakcji (Hover & Active):** Należy algorytmicznie przełączać dekorację tekstu, aby skutecznie komunikować stany interakcji:
* **Logika A (Domyślne Podkreślenie):** Dla linków tekstowych, które są domyślnie podkreślone, należy USUNĄĆ podkreślenie w stanie `hover`.
* **Logika B (Domyślnie Czyste):** Dla tekstów interaktywnych, które domyślnie nie mają dekoracji (np. elementy menu nawigacyjnego), należy DODAĆ podkreślenie w stanie `hover`.
* **Stan Aktywny/Wybrany:** Aby oznaczyć aktywną/wybraną zakładkę na ekranie, zastosować trwałe podkreślenie lub algorytmicznie zwiększyć `font-weight`.

**(ID: TYPO-21)** **Hierarchia Bez Zmiany Rozmiaru:** Jeśli trzeba wyróżnić ważne działania bez naruszania ścisłej skali typograficznej (zasada 3-5 rozmiarów), należy zachować standardowy rozmiar czcionki i dodać dekorację tekstu (podkreślenie lub kolorowe podświetlenie tła).

### H. Przezroczystość (Opacity)

**(ID: OPACITY-01)** Agent AI musi generować wartości przezroczystości i kanału alpha, używając ścisłych formuł matematycznych. Należy unikać arbitralnych korekt przezroczystości. Traktować przezroczystość jako funkcjonalne narzędzie do wskazywania stanu, głębi i zapewnienia kontrastu. Cała logika musi być niezależna od technologii.

**(ID: OPACITY-02)** **Matematyka Kanału Alpha:** Nie obliczać nowych absolutnych wartości HEX dla stanów interakcji, jeśli można użyć kanałów alpha. Ściśle stosować mnożniki alpha:
* Stan `hover` / `pressed` = `alpha: 0.8`.
* Stan `disabled` = `alpha: 0.2`.

* **Stan Wyłączony:** Ustawić ogólną przezroczystość elementu ściśle na `alpha: 0.2` (20%).
* **Stan Najechania / Naciśnięcia (Metoda A - Redukcja Przezroczystości):** Ustawić ogólną przezroczystość elementu na `alpha: 0.8` (80%).
* **Stan Najechania / Naciśnięcia (Metoda B - Nakładki Systemowe):** Nałożyć czystą białą (`#FFFFFF`) lub czystą czarną (`#000000`) warstwę z `alpha: 0.06` do `alpha: 0.12` na wierzch komponentu bazowego.

### I. Wielkość Liter (Casing)

**(ID: CASING-01)** Agent AI musi generować wielkość liter, używając ścisłych, funkcjonalnych ograniczeń, aby zapewnić czytelność i spójność. Wielkość liter jest narzędziem do komunikowania hierarchii i stanu, a nie tylko stylem wizualnym.

**(ID: CASING-02)** **Ograniczenia Funkcjonalne:**
* **`UPPERCASE` (Wielkie Litery):**
* **Poważne Ograniczenie:** Należy drastycznie ograniczyć użycie wszystkich wielkich liter. Wielkie litery „krzyczą” na użytkownika i są bardzo trudne do czytania w dłuższych formach.
* **Degradacja Kształtu:** Ludzkie oko analizuje ogólny kształt słowa (zbudowany przez ascendery jak „t” i descendery jak „p”); słowa w `UPPERCASE` stają się identycznymi, monotonnymi prostokątami, zmuszając mózg do analizowania litera po literze.
* **Ścisłe Zasady Użycia:** Ograniczyć `UPPERCASE` wyłącznie do bardzo krótkich, 1-2 słownych etykiet na przyciskach (np. „POBIERZ”, „ZAPISZ”) lub małych, pomocniczych tytułów/tagów nad głównym nagłówkiem.
* **Obowiązkowy Algorytm Kerningu:** Jeśli generowany jest tekst w `UPPERCASE`, NALEŻY algorytmicznie zwiększyć odstępy między literami (kerning). Domyślne odstępy czcionek są zoptymalizowane dla małych liter, więc rozłożenie wszystkich wielkich liter jest absolutnie konieczne, aby przywrócić czytelność i nadać mu „zaprojektowany” wygląd.
* **Parowanie Stylów:** Zawsze, gdy używane jest `UPPERCASE`, MUSI być sparowane z małym rozmiarem czcionki i mocną grubością czcionki (bold).

* **`Title Case` (Pierwsza Litera Wielka):**
* **Dozwolone Cele:** Używać `Title Case` (pisanie wielką literą wszystkich głównych słów) ściśle dla głównych tytułów, nagłówków i etykiet przycisków.
* **Szybkość Przetwarzania:** Etykiety w formularzach i na przyciskach napisane w `Title Case` są przetwarzane przez mózg szybciej i są bardziej czytelne niż te napisane w całości wielkimi literami.
* **Ostrzeżenie o Skanowaniu:** Nie nadużywać tego formatu. Wielkie litery w środku zdania mogą dezorientować oko podczas szybkiego skanowania tekstu, a zasady `Title Case` nie są uniwersalnie ustandaryzowane.

* **`Sentence Case` (Standardowe Zdanie):**
* **Globalny Domyślny:** Ustanowić `Sentence case` (gdzie tylko pierwsza litera zdania i nazwy własne są pisane wielką literą) jako podstawowy standard w całym systemie projektowym.
* **Ograniczenie Tekstu Podstawowego:** Zdecydowana większość tekstów interfejsu, zwłaszcza dłuższe opisy, MUSI być napisana w `Sentence case`.
* **Optymalizacja Poznawcza:** Ten format musi być domyślny, ponieważ jest najprostszy do czytania, najbardziej naturalny dla oka, poprawny gramatycznie i nakłada najmniejsze obciążenie poznawcze na użytkownika.

**(ID: CASING-03)** **Czarna Lista: `lowercase`:** Kategorycznie odrzucać użycie wyłącznie małych liter (`lowercase`) dla jakichkolwiek elementów UI, w tym etykiet przycisków. Wyjątek stanowi tylko rzadki przypadek, gdy jest to ściśle wymagane przez tożsamość wizualną i branding konkretnej marki. We wszystkich innych sytuacjach wygląda to na błąd i obniża profesjonalizm produktu.

#### 1. Protokół Domyślny: `Sentence case`

#### 2. Protokół Warunkowy: `Title Case`

## Podsumowanie i Zasady Ogólne

Niniejsze wytyczne stanowią kompleksowy zbiór zasad, które Agent AI musi stosować podczas projektowania i implementacji interfejsów użytkownika. Kluczowe jest konsekwentne przestrzeganie matematycznych i algorytmicznych reguł, aby zapewnić spójność, dostępność i optymalne doświadczenie użytkownika. Unikanie arbitralnych decyzji i poleganie na predefiniowanych systemach jest fundamentem dla tworzenia wysokiej jakości, przewidywalnych i skalowalnych rozwiązań UI/UX.


!!!!!!!!!!

---

## Errata redakcyjna (dopisek opiekuna zestawu — NIE jest wytyczną)

> Ta sekcja nie zawiera reguł projektowych. Agent jej NIE stosuje
> przy projektowaniu UI — służy wyłącznie temu, żeby czytelnik
> nie szukał treści, której w dokumencie nie ma.
>
> Audyt zestawu, 2026-07. Reguły powyżej pozostały nietknięte.

**Brakujące ID: BORDER-04.** W sekcji „B. Obramowanie (Border)"
numeracja przeskakuje z BORDER-03 na BORDER-05. Żaden plik zestawu
nie odwołuje się do BORDER-04, a reguły BORDER-01..03 i BORDER-05..09
są kompletne i wzajemnie spójne. Nie uzupełniamy luki zmyśloną regułą
ani nie przenumerowujemy pozostałych — przenumerowanie zerwałoby
odwołania w `frontend-design-workflow.md` i w projektowych
`new-component.md`. Jeśli powstanie wersja v4 wytycznych, to ona
zamknie lukę; do tego czasu BORDER-04 traktuj jako identyfikator
nieużywany, nie jako regułę do odszukania.

**Nagłówki podsekcji zgubione przy konwersji materiału źródłowego.**
Numeracja `#### N.` w kilku miejscach zaczyna się od innej liczby
niż 1 albo pomija pozycję — treść reguł jest jednak kompletna:

    - „B. Obramowanie (Border)" — zaczyna się od `#### 3.`
      (BORDER-01..03 stoją bez nagłówka podsekcji; tam też
      najprawdopodobniej mieściło się BORDER-04)
    - „Nakładki (Overlay)" — zaczyna się od `#### 2.`
    - „Odstępy Między Akapitami" — przeskok `#### 1.` → `#### 3.`
    - Koniec sekcji „Wielkość Liter (Casing)" — dwa nagłówki
      (`#### 1. Protokół Domyślny`, `#### 2. Protokół Warunkowy`)
      są puste; ich treść zawierają reguły CASING-01..03 powyżej.

Brak nagłówka nie oznacza braku reguły — czytaj moduł w całości,
zgodnie z procedurą Design Planu w `new-component.md`.

**Znacznik końca pliku.** Ciąg `!!!!!!!!!!` bezpośrednio przed tą
erratą pochodzi z materiału źródłowego i nie ma znaczenia
semantycznego. Nie jest regułą ani separatorem modułu.
