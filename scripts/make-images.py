"""
OG-карточка и фавиконы. Рисуются из тех же гарнитур и той же палитры,
что и сайт: стоковых картинок в проекте нет и не будет (SPEC §9).

Запуск: python scripts/make-images.py <путь-к-GolosText-var.ttf> <путь-к-MartianMono-var.ttf>
"""
import sys
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

DIAL = (244, 246, 247)
GRAPHITE = (25, 30, 35)
LOW = (11, 90, 166)
BRASS = (168, 131, 44)
WHITE = (255, 255, 255)

golos_src, martian_src = sys.argv[1], sys.argv[2]
TMP = sys.argv[3]


def static(src, out, **axes):
    f = instancer.instantiateVariableFont(TTFont(src), axes)
    f.save(out)
    return out


golos700 = static(golos_src, f"{TMP}/g700.ttf", wght=700)
golos400 = static(golos_src, f"{TMP}/g400.ttf", wght=400)
martian = static(martian_src, f"{TMP}/m500.ttf", wght=500, wdth=112.5)


def ticks(d, x0, y, x1, minor=16, major=80, h=28):
    """Риски приборного лимба — та же сигнатура, что на сайте."""
    x = x0
    while x < x1:
        d.line([(x, y + h // 2), (x, y + h)], fill=GRAPHITE, width=2)
        x += minor
    x = x0
    while x < x1:
        d.line([(x, y), (x, y + h)], fill=BRASS, width=2)
        x += major


# ── OG 1200×630 ────────────────────────────────────────────────────────
og = Image.new("RGB", (1200, 630), DIAL)
d = ImageDraw.Draw(og)

ticks(d, 0, 0, 1200)

f_h1 = ImageFont.truetype(golos700, 76)
f_sub = ImageFont.truetype(golos400, 34)
f_inst = ImageFont.truetype(martian, 22)
f_phone = ImageFont.truetype(golos700, 48)

d.text((72, 118), "Кондиционеры", font=f_h1, fill=GRAPHITE)
d.text((72, 206), "и котлы в Ташкенте", font=f_h1, fill=GRAPHITE)
d.text((72, 322), "Мастер Ровшан. Работаю сам, круглосуточно.", font=f_sub, fill=(61, 70, 79))

d.line([(72, 404), (75, 404)], fill=BRASS, width=0)
d.rectangle([72, 400, 76, 470], fill=BRASS)
d.text((100, 398), "ЦЕНА ЗА 10 МИНУТ ПО ФОТО В TELEGRAM", font=f_inst, fill=LOW)
d.text((100, 428), "+998 90 904 50 10", font=f_phone, fill=GRAPHITE)

ticks(d, 0, 630 - 28, 1200)
og.save("public/og.png", optimize=True)

# ── Фавиконы: тот же знак, что в favicon.svg ───────────────────────────
def mark(size):
    scale = size / 32
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dd = ImageDraw.Draw(img)
    r = int(6 * scale)
    dd.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=LOW)
    w = max(2, int(2.4 * scale))
    pts = [((16, 6), (16, 26)), ((7.3, 11), (24.7, 21)), ((7.3, 21), (24.7, 11))]
    for (x1, y1), (x2, y2) in pts:
        dd.line([(x1 * scale, y1 * scale), (x2 * scale, y2 * scale)], fill=WHITE, width=w)
    return img


mark(32).save("public/favicon-32.png", optimize=True)
mark(180).convert("RGB").save("public/apple-touch-icon.png", optimize=True)

print("  public/og.png, favicon-32.png, apple-touch-icon.png")
