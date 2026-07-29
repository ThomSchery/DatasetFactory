---
description: Checklista wymagań niefunkcjonalnych. Playbook stosuje ją ZAWSZE w Fazie 1 (Discovery). Zamyka decyzje, których nie zbiera PROJECT_GATE ani strategie.
version: "1.1"
---

# 🛡️ nfr-checklist.md

> Uzupełnia (nie zastępuje) stress-test z Fazy 3 Playbooka:
> tutaj zapadają DECYZJE, tam weryfikowana jest ich odporność.
>
> Sposób użycia: Playbook, Faza 1, dla każdej pozycji Silnik Pytań
> i Decyzji (jedna decyzja na raz). Pozycje rozstrzygnięte
> w artefaktach — POMIŃ. Decyzje zapisz w docs/CONTEXT.md
> (sekcja "NFR — Decyzje") i propaguj do Tech Planu.

---

**(ID: NFR-01)** Uwierzytelnianie i uprawnienia (model całościowy):

    Jak użytkownik dowodzi tożsamości (sesja / JWT / dostawca
    zewnętrzny)? Jaki model uprawnień (role / per-zasób)?
    Mapa: typ użytkownika (z P2) → co może, czego nie może.
    Uwaga: zakazany kompromis "endpoint bez decyzji o uprawnieniach"
    łapie pojedyncze endpointy — TU zapada model dla całości.

**(ID: NFR-02)** Dane osobowe i retencja:

    Jakie dane osobowe system przechowuje? Podstawa i okres
    retencji? Co się dzieje przy żądaniu usunięcia konta
    (twarde usunięcie / anonimizacja)? Czy dane opuszczają
    EOG (RODO)? Jeśli brak danych osobowych — zapisz to jawnie.

**(ID: NFR-03)** Backup i odzyskiwanie:

    Co jest backupowane, jak często, gdzie? Akceptowalna utrata
    danych (RPO) i czas przywrócenia (RTO) — wystarczą rzędy
    wielkości ("doba", "godzina"). Kto i jak testuje odtworzenie?

**(ID: NFR-04)** Obserwowalność:

    Minimum v1: logi błędów z korelacją żądań + alert o awarii
    (system nie może umierać po cichu). Decyzja: co ponad minimum
    (metryki, tracing) i jakim narzędziem.
    Zakaz logowania sekretów i danych osobowych w plain text.

**(ID: NFR-05)** Wydajność i wolumeny:

    Rzędy wielkości: ilu użytkowników jednocześnie, ile rekordów
    po roku, największy payload (np. upload wideo)?
    Cel: nie optymalizacja na zapas, lecz wiedza gdzie postawić
    markery @SCALE zamiast zgadywać.

**(ID: NFR-06)** Limity i ochrona:

    Rate limiting (globalny / per użytkownik / brak — świadomie)?
    Limity rozmiaru wejścia? Ochrona operacji kosztownych
    (np. wywołania AI — limit per użytkownik, budżet)?
    Brak limitów w v1 = wpis do TECH_DEBT z triggerem.

**(ID: NFR-07)** Zgodność branżowa (jeśli dotyczy):

    Czy domena podlega regulacjom (medyczna, finansowa,
    dzieci jako użytkownicy)? Jeśli tak — jakie wymagania
    wpływają na architekturę? Jeśli nie — zapisz "nie dotyczy".

**(ID: NFR-08)** Środowiska i konfiguracja:

    Ile środowisk w v1 (lokalne / staging / produkcja)?
    Skąd aplikacja bierze konfigurację i sekrety — zmienne
    środowiskowe, plik, menedżer sekretów? (Zakazany kompromis
    "sekrety w kodzie" łapie skutek — TU zapada mechanizm.)
    Co odróżnia środowiska: baza, klucze providerów, limity,
    poziom logowania?
    Minimum v1: lokalne + produkcja, konfiguracja przez zmienne
    środowiskowe, plik przykładowy (.env.example lub odpowiednik)
    w repo. Mniej = wpis do TECH_DEBT.

**(ID: NFR-09)** Migracje i dane startowe:

    Czym zmieniany jest schemat bazy — narzędzie migracji
    ze stacku czy ręczny SQL? Migracja jest częścią ticketu,
    który zmienia model — nie osobnym "sprzątaniem po".
    MUSI być rozstrzygnięte: czy migracje są odwracalne
    (down/rollback), kto je uruchamia przy deployu, co z danymi
    już istniejącymi (przy P5 = Istniejący kod).
    Dane startowe: co MUSI być w bazie, aby aplikacja działała
    (słowniki, role, konto administratora) i skąd się biorą.
    Przy Modularnym Monolicie: migracje per schemat modułu
    (MMOD-35) — nie jeden wspólny zestaw dla całej aplikacji.

**(ID: NFR-10)** Uruchamianie i pipeline:

    Jak uruchomić projekt lokalnie jedną komendą? (Brak
    odpowiedzi = pierwszy ticket coding agenta będzie zgadywał.)
    Co jest bramką jakości przed scaleniem: build, testy, lint,
    gate'y wykonawcze z Fazy 5 — i czy uruchamia je CI, czy
    człowiek lokalnie?
    Świadomy brak CI w v1 jest dopuszczalny — musi trafić
    do TECH_DEBT z triggerem (np. "pierwszy współpracownik").

---

## Wyjście

Agent AKTUALIZUJE docs/CONTEXT.md:

    ## NFR — Decyzje
    | ID | Decyzja | Wybór | Uzasadnienie / trigger |
    |----|---------|-------|------------------------|
    | NFR-01 | Auth | ... | ... |

Świadome pominięcia (np. brak rate limitingu w v1) trafiają
dodatkowo do docs/TECH_DEBT.md.
