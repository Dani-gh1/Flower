# Ugens opslag til Flower

Hver søndag laver en planlagt AI-opgave ugens opslag:
- **X/Twitter (automatisk):** 7 videoer med tekst lægges i `promo/x/queue/`. Workflowet
  `.github/workflows/x-post.yml` poster det næste opslag hver dag kl. 18:17 (dansk vintertid).
  Slet en fil fra køen for at droppe den. Sæt variablen `X_PAUSED` til `true` for at holde pause.
- **Reddit/Discord (manuelt):** tekster i `uge-ÅÅÅÅ-UU.md`, som du selv poster.

AI'en poster ikke selv: den lægger kun opslag i køen, og dit workflow poster dem.

## Om appen
- **Flower**: en social app for folk, der ryger cannabis, på dansk og engelsk.
- Link: https://dani-gh1.github.io/Flower/ (download-side: https://dani-gh1.github.io/Flower/download/)
- Det fede ved appen:
  - **Spil**: Game of Joints (brætspil), Spin the Joint 1 (Nem, Svær, Umulig) og 2 (lykkehjul med straffe), Terningespillet, Double Trouble, Weed Quiz, Weed Chess, Blackjack (indsatsen er hits) og Musical Marijuana (tag et sug, hver gang ordet bliver sunget, eller gæt sangen).
  - **Smoke spots** på et kort, med billeder og bedømmelser.
  - **Rate the Roll** og **Munchies**: del billeder, og lad vennerne rate dem.
  - **Ranks** fra Puff Puppy til Ganja God, badges, daglig udfordring og streak.
  - **Log en smoke** med følelser, statistik, T-break med pengesparer og "Smoker nu".
  - **Venner**, chat, sesh-invitationer og "Inviter venner"-link.

## Stil
- Dansk, uformelt, sjovt og selvironisk. Korte sætninger. Emojis med måde (🌿🎡🔥).
- Fokus på **spillene, humoren og fællesskabet**: "Vi spillede Spin the Joint på Umulig".
- Hver video skal have et **hook i de første 2 sekunder**.
- Afslut gerne med en opfordring som "Link i bio" eller "Hent Flower". Skriv ikke "Prøv den gratis".
- På X skrives på **engelsk**, med 1–3 hashtags og **"Link in bio"**. Aldrig selve linket i opslaget: det koster ca. 13 gange mere og vises til færre. Linket står i X-profilens bio.

## Regler (skal altid overholdes)
- Vis eller beskriv **aldrig** køb, salg eller deling af stoffer, og vis ikke selve rygningen i billedet. Brug skærmoptagelser af appen, reaktioner, tekst på skærm og memes.
- Kun for **18+**. Lav intet, der henvender sig til unge.
- Ingen påstande om sundhed eller at cannabis er "sikkert".
- Ingen betalte annoncer: platformene tillader dem ikke for cannabis.
- På Reddit og Discord skrives ærligt som udvikleren ("jeg har lavet en app …"), og gruppens regler følges.
- AI'en poster, kommenterer og sender aldrig beskeder selv; kun workflowet poster køen på X.
- **Ikke TikTok, Instagram eller YouTube:** de forbyder indhold, der fremmer stoffer, og TikTok har allerede fjernet en video.
- Ingen "udfordringer" (fx "tør du?") og intet, der opfordrer til at gøre noget farligt.
- Videoer laves med værktøjet i `promo/video/` (se README dér for, hvilke kort og spil der må vises).

## Hvad der laves hver uge
1. **7 X-opslag** i `promo/x/queue/`: `ÅÅÅÅ-MM-DD-N-navn.mp4` (1080×1920, 10–25 sek., hook i de første 2 sek.)
   og en `.txt` med samme navn (engelsk, højst 280 tegn, 1–3 hashtags, "18+" og "Link in bio", intet link).
2. **`uge-ÅÅÅÅ-UU.md`** med ugens nyheder (kort), en liste over ugens X-opslag og 2 opslag til Reddit/Discord.
