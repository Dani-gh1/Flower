import json, subprocess, os, sys
from PIL import Image, ImageDraw, ImageFont
W, H = 1080, 1920
F = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
FB = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"
GREEN = (46, 160, 90)

def wrap(draw, text, font, maxw):
    out = []
    for para in text.split("\n"):
        line = ""
        for w in para.split(" "):
            t = (line + " " + w).strip()
            if draw.textlength(t, font=font) <= maxw: line = t
            else: out.append(line); line = w
        out.append(line)
    return out

def textbox(path, text, size=74, y=300, style="dark"):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    font = ImageFont.truetype(F, size)
    lines = wrap(d, text, font, 860)
    lh = int(size * 1.22); pad = 34
    tw = max(d.textlength(l, font=font) for l in lines)
    bw, bh = int(tw + pad * 2), lh * len(lines) + pad * 2 - int(size * 0.18)
    x0 = (W - bw) // 2
    bg = (0, 0, 0, 215) if style == "dark" else (*GREEN, 240)
    d.rounded_rectangle([x0, y, x0 + bw, y + bh], radius=30, fill=bg)
    for i, l in enumerate(lines):
        lw = d.textlength(l, font=font)
        d.text(((W - lw) / 2, y + pad + i * lh - int(size * 0.08)), l, font=font, fill="white")
    im.save(path)

def endcard(path, line1, line2="Get Flower · link in bio"):
    im = Image.new("RGB", (W, H), (8, 14, 10)); d = ImageDraw.Draw(im)
    for yy in range(H):  # svag grøn glød
        a = max(0, 1 - abs(yy - 760) / 900)
        d.line([(0, yy), (W, yy)], fill=(int(8 + 20 * a), int(14 + 55 * a), int(10 + 30 * a)))
    icon = Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../icon-512.png")).convert("RGBA").resize((300, 300))
    m = Image.new("L", (300, 300), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, 299, 299], 66, fill=255)
    im.paste(icon, ((W - 300) // 2, 520), m)
    def c(t, f, y, fill="white"):
        d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=fill)
    c("Flower", ImageFont.truetype(F, 120), 880)
    for i, l in enumerate(wrap(d, line1, ImageFont.truetype(FB, 62), 900)):
        c(l, ImageFont.truetype(FB, 62), 1060 + i * 78, (200, 235, 210))
    f2 = ImageFont.truetype(F, 58); tw = d.textlength(line2, font=f2)
    d.rounded_rectangle([(W - tw) / 2 - 44, 1300, (W + tw) / 2 + 44, 1420], 60, fill=GREEN)
    c(line2, f2, 1327)
    c("18+ only", ImageFont.truetype(FB, 46), 1490, (150, 170, 155))
    im.save(path)

def build(name, overlays, end_text, trim_end=None, endsec=2.6):
    os.makedirs("out_en/tmp", exist_ok=True)
    src = f"raw_en/{name}.mp4"
    marks = json.load(open(f"raw_en/{name}.json"))
    dur = trim_end if trim_end else marks["end"]
    inputs = ["-i", src]; chain = "[0:v]trim=0:%.3f,setpts=PTS-STARTPTS[v0];" % dur; last = "v0"
    for i, (t0, t1, text, kw) in enumerate(overlays):
        p = f"out_en/tmp/{name}_{i}.png"; textbox(p, text, **kw)
        inputs += ["-i", p]
        chain += f"[{last}][{i+1}:v]overlay=0:0:enable='between(t,{t0:.2f},{t1:.2f})'[v{i+1}];"; last = f"v{i+1}"
    ec = f"out_en/tmp/{name}_end.png"; endcard(ec, end_text)
    n = len(overlays) + 1
    inputs += ["-loop", "1", "-t", str(endsec), "-i", ec]
    chain += f"[{n}:v]fps=30,format=yuv420p,fade=in:st=0:d=0.25[e];[{last}]fps=30,format=yuv420p[m];[m][e]concat=n=2:v=1:a=0[outv]"
    total = dur + endsec
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=44100:cl=stereo",
           "-filter_complex", chain, "-map", "[outv]", "-map", f"{n+1}:a", "-c:v", "libx264", "-crf", "19", "-preset", "medium",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", f"out_en/{name}.mp4"]
    subprocess.run(cmd, check=True)
    print(name, round(total, 1), "s")

# Hver video er en funktion, der får sine tidsmærker (fra rec.js) som mk.
VIDEOS = {}

def video(fn):
    VIDEOS[fn.__name__] = fn
    return fn


@video
def umulig(mk):
    u = mk
    build("umulig", [
        (0, u["spin"], "We picked Impossible.\nBig mistake.", dict(size=82, y=600)),
        (u["spin"], u["card"] - 0.1, "The joint decides who's up next…", dict(y=1380)),
        (u["card"], u["pass"], "Tornado. On Impossible.", dict(size=80, y=230)),
        (u["pass"], u["end"], "Thank god for Pass", dict(size=80, y=230, style="green")),
    ], "Spin the Joint · Easy, Hard or Impossible")

@video
def hjul(mk):
    h = mk
    build("hjul", [
        (0, h["land1"], "POV: the wheel has a personal problem with you", dict(size=76, y=210)),
        (h["land1"], h["spin2"], "Round 1: Tornado", dict(size=80, y=210)),
        (h["land2"], h["spin3"], "Round 2: …Tornado again", dict(size=80, y=210)),
        (h["land3"], h["end"], "Round 3: the wheel is rigged.\nI just can't prove it.", dict(size=72, y=210, style="green")),
    ], "Spin the Joint 2 · a wheel full of challenges")

@video
def levels(mk):
    l = mk
    build("levels", [
        (0, l["easy"], "Easy, Hard or Impossible?\nWhat would your crew pick?", dict(size=70, y=1180)),
        (l["easy"], l["hard"], "EASY", dict(size=110, y=1350, style="green")),
        (l["hard"], l["impossible"], "HARD", dict(size=110, y=1350, style="green")),
        (l["impossible"], l["end"], "IMPOSSIBLE", dict(size=110, y=1350, style="green")),
    ], "Tell us in the comments what you'd pick")

@video
def menu(mk):
    n = mk
    build("menu", [
        (0, n["games"], "For your next game night", dict(size=80, y=1150)),
        (n["games"], n["spin2"], "6 games in one app", dict(size=90, y=1450, style="green")),
        (n["spin2"], n["end"], "We're starting with the wheel", dict(size=78, y=1450)),
    ], "Game of Joints, Spin the Joint, Weed Quiz and more")

@video
def quiz(mk):
    q = mk; qa = q["a1"]
    build("quiz", [
        (0, q["q1"], "Weed Quiz: can you answer this one?", dict(size=80, y=700)),
        (q["q1"], qa - 3, "You've got 3 seconds", dict(size=80, y=1150, style="green")),
        (qa - 3, qa - 2, "3", dict(size=180, y=1150)),
        (qa - 2, qa - 1, "2", dict(size=180, y=1150)),
        (qa - 1, qa, "1", dict(size=180, y=1150)),
        (qa, q["end"], "Hops! Did you get it?", dict(size=84, y=1150, style="green")),
    ], "130 questions in Weed Quiz. Test your friends")
def quiz_video(name, mk, hook, answer, end_text):
    qa = mk["a1"]
    build(name, [
        (0, mk["q1"], hook, dict(size=80, y=700)),
        (mk["q1"], qa - 3, "You've got 3 seconds", dict(size=80, y=1150, style="green")),
        (qa - 3, qa - 2, "3", dict(size=180, y=1150)),
        (qa - 2, qa - 1, "2", dict(size=180, y=1150)),
        (qa - 1, qa, "1", dict(size=180, y=1150)),
        (qa, mk["end"], answer, dict(size=84, y=1150, style="green")),
    ], end_text)

# ---------- Uge 45 (2026) ----------
@video
def quizmalana(mk):
    quiz_video("quizmalana", mk, "Geography test: where is this strain from?", "India! Did you get it?", "130 questions in Weed Quiz. Test your crew")

@video
def quizbanner(mk):
    quiz_video("quizbanner", mk, "Only real comic fans get this one", "Bruce Banner! Did you get it?", "Weed Quiz · strains, terpenes and trivia")

@video
def quizlemon(mk):
    quiz_video("quizlemon", mk, "Smell quiz: which one smells like lemon?", "Limonene! Did you know?", "Weed Quiz · no repeats until you've seen them all")

@video
def poll(mk):
    build("poll", [
        (0, mk["land1"], "Three friends. Three spins.\nWho got the worst one?", dict(size=72, y=210)),
        (mk["land1"], mk["spin2"], "Jake: Turtle", dict(size=80, y=210)),
        (mk["land2"], mk["spin3"], "Mia: DIY king", dict(size=80, y=210)),
        (mk["land3"], mk["end"], "Liam: Tornado.\nWho had it worst?", dict(size=76, y=210, style="green")),
    ], "Vote in the comments: Jake, Mia or Liam?")

@video
def easy(mk):
    build("easy", [
        (0, mk["easy"], "Every crew has that one friend…", dict(size=78, y=1180)),
        (mk["easy"], mk["spin"], "…who always picks Easy", dict(size=84, y=1350, style="green")),
        (mk["spin"], mk["card"], "Fine. Easy it is.", dict(size=80, y=1380)),
        (mk["card"], mk["end"], "Of course it lands on Mia", dict(size=80, y=230, style="green")),
    ], "Tag the friend who always picks Easy")

@video
def tour(mk):
    build("tour", [
        (0, mk["games"], "What's inside Flower?", dict(size=86, y=1250)),
        (mk["games"], mk["hub"], "Games for your sesh", dict(size=84, y=1500, style="green")),
        (mk["hub"], mk["hub2"], "Smoke Hub: a map and one feed for your crew", dict(size=76, y=700)),
        (mk["hub2"], mk["end"], "Share posts, rate rolls\nand show your munchies", dict(size=74, y=300, style="green")),
    ], "Made by one dev · 18+")

@video
def devstory(mk):
    build("devstory", [
        (0, mk["spin2"], "I built a social app for my friend group", dict(size=76, y=1300)),
        (mk["spin2"], mk["quiz"], "50+ updates in the first 3 days", dict(size=80, y=230, style="green")),
        (mk["quiz"], mk["end"], "Now I need people to break it.\nTell me what to add next.", dict(size=70, y=1350)),
    ], "Feedback welcome · made by one dev")

if __name__ == "__main__":
    names = sys.argv[1:] or list(VIDEOS)
    for name in names:
        VIDEOS[name](json.load(open(f"raw_en/{name}.json")))
