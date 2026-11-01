# Videoer til X

Værktøj til at optage appen og lave lodrette videoer (1080×1920) med tekst og slutkort.
Bruges af den ugentlige AI-opgave; færdige videoer lægges i `promo/x/queue/`.

## Sådan
```bash
cd /home/user/Flowers && python3 -m http.server 8765 &      # appen lokalt
cd promo/video
APPLANG=en node rec.js umulig hjul levels menu quiz         # optag scener fra scenes.js → raw_en/
for n in umulig hjul levels menu quiz; do (cd raw_en/$n && ffmpeg -y -f concat -safe 0 -i list.txt \
  -vf "scale=1080:1920,fps=30,format=yuv420p" -c:v libx264 -crf 18 ../$n.mp4); done
python3 compose.py umulig hjul                               # tekst + slutkort → out_en/ (navne fra VIDEOS i compose.py)
```

- `rec.js` kører appen uden login (Firebase blokeres) og optager skærmen i 3× opløsning.
  `window.__q` styrer `Math.random`, så jointen lander, hvor teksten siger.
- `scenes.js` beskriver hver scene. Nye scener tilføjes her; `mark('navn')` gemmer tidspunkter til teksterne.
- `compose.py` lægger tekst på: hver video er en `@video`-funktion med `build(navn, [(fra, til, tekst, stil)], slutkort-tekst)`; quiz-videoer bruger `quiz_video`.
- Rå optagelser (`raw*/`, `out*/`) committes ikke.

## Regler (fra promo/README.md)
- Kortenes beskrivelser og hjælpetekster om sug er skjult (CSS i `rec.js`). Vis kun kort med neutrale navne
  (Tornado, Skildpadde, Skorsten, DIY konge, Lykkehjulet), ikke "Lunge" eller "Pass the spliff".
- Terningespillet og Double Trouble optages ikke (jointen sendes videre = deling).
- Ingen sundhedspåstande, intet om køb/salg, kun 18+.
