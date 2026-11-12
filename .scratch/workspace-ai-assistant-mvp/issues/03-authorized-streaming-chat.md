# 03: Autoryzowany czat ze strumieniowaniem i instrukcjami workspace’u

**What to build:** W autoryzowanym workspace’ie użytkownik wysyła poprawną wiadomość i obserwuje stopniowe pojawianie się odpowiedzi. Endpoint sprawdza sesję i członkostwo przed wywołaniem providera, pobiera instrukcje wyłącznie z workspace’u, waliduje ograniczone żądanie oraz przekazuje historię rozmowy z pamięci przeglądarki.

**Blocked by:** 02 — Serwerowo chroniony dostęp do workspace’ów.

**Status:** ready-for-agent

- [ ] Poprawna wiadomość wyświetla się w rozmowie, a odpowiedź asystenta przyrasta podczas strumieniowania.
- [ ] Nieautoryzowane, puste, niepoprawne lub zbyt duże żądania są odrzucane przed wywołaniem providera. Limit rozmiaru wiadomości i rozmowy jest ustawiony i udokumentowany.
- [ ] Odpowiedź otrzymuje instrukcje należące do autoryzowanego workspace’u, nie dane przesłane przez klienta. Autoryzacja działa niezależnie od zachowania modelu.
- [ ] Odpowiedzialności są rozdzielone: komponenty czatu (interakcja i prezentacja), route handler (walidacja i streaming), adapter providera (konfiguracja AI).
- [ ] UI pokazuje nazwę bieżącego workspace’u, odróżnia wiadomości użytkownika i asystenta, ma opisane pole wiadomości oraz Send, obsługuje nawigację klawiaturą i widoczny focus, a długie wiadomości są czytelne na telefonie i pulpicie. Wyjście modelu jest zwykłym tekstem, bez renderowania surowego HTML.
- [ ] Testy używają kontrolowanego, celowo opóźnionego fake streamu i nie wymagają klucza AI ani płatnych wywołań.
