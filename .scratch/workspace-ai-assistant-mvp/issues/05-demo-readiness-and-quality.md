# 05: Gotowość demonstracyjna i kontrola jakości

**What to build:** Gotową do przekazania wersję z instrukcjami uruchomienia, migracji, seedowania i testów, diagramem przepływu autoryzacji i streamingu, skryptem demo oraz jasno opisanymi ograniczeniami. Zapewnia CI z izolowaną bazą i fake providerem oraz krytyczną ścieżkę Playwright.

**Blocked by:** 01 — Fundament aplikacji i logowanie; 02 — Serwerowo chroniony dostęp do workspace’ów; 03 — Autoryzowany czat ze strumieniowaniem i instrukcjami workspace’u; 04 — Odporne sterowanie rozmową.

**Status:** ready-for-agent

- [ ] README pozwala uruchomić aplikację, bazę, migracje, seed oraz wszystkie kontrole jakości bez ukrytych kroków. Zawiera też krótki opis izolacji tenantów i jej testów, listę zaimplementowanych funkcji kontra znanych ograniczeń oraz rzeczową notatkę o pracy z agentami i faktycznie użytych skillach.
- [ ] CI uruchamia typy, lint, testy i build dla pull requestów oraz zmian w `main`, z izolowaną bazą i fake providerem, bez produkcyjnych danych lub klucza AI.
- [ ] Playwright pokrywa logowanie, wejście do dozwolonego workspace’u, wysłanie wiadomości i obserwację strumieniowanej odpowiedzi.
- [ ] Dokumentacja zawiera diagram (przeglądarka → uwierzytelniona trasa → sprawdzenie członkostwa → provider AI → strumieniowana odpowiedź), dwuminutowy skrypt demo oraz zrzut lub nagranie.
- [ ] Ręczne smoke test ze prawdziwym providerem zostaw właścicielowi na rano. Agent nie musi go wykonywać i nie commituje kluczy.
