# The crops field on the Pico-LCD-1.3. Five plants grow from dirt to full over the contract's cooldown.
# The device only draws what the server tells it (last harvest, next harvest, server time); the contract is
# the clock. Harvest itself is signed here from fields shown on screen (see agent.harvest).
import time

from lcd import color, BLACK, WHITE, GREY, DARK, YELLOW, GREEN, RED

SKY = color(10, 18, 40)
DIRT = color(96, 56, 16)
DIRT2 = color(120, 76, 24)
LEAF = color(40, 170, 60)
LEAF2 = color(70, 210, 90)
CROP = color(255, 160, 20)
CROP2 = color(255, 210, 60)
STEM = color(50, 130, 40)

GROUND_Y = 168
PLANT_X = [28, 74, 120, 166, 212]


def stage(now, last, next_, n=5):
    """0 = just harvested dirt, n = full. A chip that never harvested starts full."""
    if not last:
        return n
    span = max(1, next_ - last)
    return min(n, max(0, (now - last) * n // span))


def _plant(d, x, st):
    d.fill_rect(x - 12, GROUND_Y - 4, 24, 6, DIRT2)              # mound
    if st == 0:
        return
    h = 14 + st * 14                                             # stem height
    d.fill_rect(x - 1, GROUND_Y - h, 3, h, STEM)
    for i in range(min(st, 3)):                                  # leaves, alternating sides
        ly = GROUND_Y - 12 - i * 16
        side = -1 if i % 2 else 1
        d.ellipse(x + side * 9, ly, 9, 4, LEAF if i % 2 else LEAF2, True)
    if st >= 4:                                                  # bud
        d.ellipse(x, GROUND_Y - h, 6, 6, CROP, True)
    if st >= 5:                                                  # full crop
        d.ellipse(x, GROUND_Y - h - 4, 11, 11, CROP, True)
        d.ellipse(x - 3, GROUND_Y - h - 7, 4, 4, CROP2, True)


def _countdown(secs):
    if secs <= 0:
        return "ready"
    h, m = secs // 3600, (secs % 3600) // 60
    return "%dh %02dm" % (h, m) if h else "%dm %02ds" % (m, secs % 60)


def draw(d, st, now, next_, harvests, note="", note_c=GREY):
    """The idle screen: field, growth, countdown or the harvest prompt."""
    d.fill(SKY)
    d.fill_rect(0, 0, 240, 22, DARK)
    d.text("CROPS FIELD", 6, 7, WHITE)
    s = "%d harvests" % harvests
    d.text(s, 240 - 6 - 8 * len(s), 7, GREY)
    d.fill_rect(0, GROUND_Y, 240, 240 - GROUND_Y, DIRT)
    for x in PLANT_X:
        _plant(d, x, st)
    left = next_ - now
    if st >= 5 and left <= 0:
        d.fill_rect(0, 200, 240, 40, GREEN)
        d.text("A  HARVEST 5 CROPS", 240 // 2 - 8 * 18 // 2, 216, BLACK)
    else:
        d.center_text("next harvest in " + _countdown(left), 210, WHITE)
        d.center_text("growing...", 226, GREY)
    if note:
        d.fill_rect(0, 24, 240, 12, SKY)
        d.text(note[:29], 6, 26, note_c)
    d.show()


def harvested(d, tx):
    d.fill(SKY)
    d.fill_rect(0, 0, 240, 22, DARK)
    d.text("CROPS FIELD", 6, 7, WHITE)
    d.center_text("HARVESTED", 60, GREEN, 3)
    d.center_text("+5 CROPS", 100, CROP2, 3)
    d.center_text("minted on mainnet", 150, WHITE)
    if tx:
        d.center_text(tx[:14] + ".." + tx[-6:], 170, GREY)
    d.center_text("seeds planted", 200, GREY)
    d.show()
    time.sleep(6)


def failed(d, why):
    d.fill(SKY)
    d.fill_rect(0, 0, 240, 22, DARK)
    d.text("CROPS FIELD", 6, 7, WHITE)
    d.center_text("NOT HARVESTED", 80, RED, 2)
    d.center_text((why or "")[:29], 120, WHITE)
    d.center_text("crops are still there", 150, GREY)
    d.show()
    time.sleep(5)
