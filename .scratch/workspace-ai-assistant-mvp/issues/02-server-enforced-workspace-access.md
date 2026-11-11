# 02: Serwerowo chroniony dostęp do workspace’ów

**What to build:** Wejście do workspace’u tylko dla jego członka, z przekierowaniem anonimowej osoby do logowania i odmową dostępu do cudzego workspace’u. Obejmuje warstwę autoryzacji, z której później skorzysta API czatu.

**Blocked by:** 01 — Fundament aplikacji i logowanie.

**Status:** ready-for-agent

- [ ] Anonimowy użytkownik otwierający workspace jest kierowany do logowania.
- [ ] Zalogowany użytkownik nie może otworzyć workspace’u, do którego nie należy. Tożsamość pochodzi z sesji, nigdy z przesłanego `userId`.
- [ ] Autoryzacja członkostwa jest osobną funkcją serwerową, z której później korzysta też endpoint czatu.
- [ ] Testy sprawdzają izolację dostępu na serwerze (w tym przeciwko izolowanej bazie testowej, gdzie to praktyczne), a nie wyłącznie filtrowanie po stronie przeglądarki. Testy nie resetują bazy deweloperskiej ani produkcyjnej.
