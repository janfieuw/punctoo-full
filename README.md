# MyPunctoo Full (from scratch)

Dit is een volledig nieuw project (vanaf nul) voor MyPunctoo + Adminzone.

## Wat zit erin
- Account aanmaken met bedrijfsgegevens (incl. BTW) + leveringsadres
- MyPunctoo zone na login:
  - Werknemersbeheer (naam aanpassen)
  - Per werknemer blijft de koppelcode zichtbaar
  - ScanTags altijd downloadbaar (PDF met QR's)
  - Startdatum abonnement + klantnummer zichtbaar
  - Extra ScanTag bestellen (leveringsadres opnieuw invullen)
- Adminzone:
  - Dashboard met nieuwe inschrijvingen + nieuwe bestellingen
  - Klantenlijst gesorteerd op start abonnement
  - Klantfiche met bedrijfsgegevens, leveringsadres, tags, startdatum, klantnummer

## Installeren (zonder Git)
1) Pak de ZIP uit naar een map, bv. `C:\MIJN-FILES\MYPUNCTOO`
2) Open een terminal in die map
3) Installeer deps:
   - `npm install`
4) Maak een `.env` (kopieer `.env.example` naar `.env`) en vul minstens `DATABASE_URL` + `SESSION_SECRET` + admin credentials
5) Start:
   - `npm run dev`
6) Open:
   - Klant: `http://localhost:3000/signup`
   - Admin: `http://localhost:3000/admin/login`

## Belangrijk
- Dit project maakt tabellen aan met `CREATE TABLE IF NOT EXISTS`.
- Het wist niets.
