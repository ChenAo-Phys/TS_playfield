"""Refine hand-read country box corners on game_resources/TS_map.jpg (2448x1584) by snapping to the
boxes' dark 1-px outlines. Input: rough (left, top) per engine country id, read off 1:1 crops.
Output: ref_boxes.json {id: {left, top, right, bottom, cx, cy, ...}}"""
import json, sys
from PIL import Image
ROUGH = {  # engine id: (left, top) rough, full-res pixels
 0:(402,344), 1:(810,259), 2:(927,117), 3:(1070,180), 4:(950,190), 5:(1210,122), 6:(891,334),
 7:(996,334), 8:(873,419), 9:(796,520), 10:(1014,481), 11:(1147,559), 12:(1338,490), 13:(1041,407),
 14:(1034,262), 15:(1144,262), 16:(1124,334), 17:(1148,407), 18:(1123,482), 19:(1253,407), 20:(1232,482),
 21:(1278,561), 22:(1378,561), 23:(1257,635), 24:(1379,635), 25:(1481,635), 26:(1326,708), 27:(1446,706),
 28:(1415,776), 29:(1208,708), 30:(1100,698),
 31:(1605,587), 32:(1608,679), 33:(1723,729), 34:(1853,744), 35:(1955,755), 36:(1912,829), 37:(2018,829),
 38:(1961,940), 39:(2135,1028), 40:(2174,826), 41:(2137,1155), 42:(2130,716), 43:(2153,488), 44:(2173,561),
 45:(2258,630),
 46:(824,655), 47:(930,622), 48:(1038,614), 49:(814,750), 50:(973,776), 51:(1226,795), 52:(882,889),
 53:(1013,877), 54:(1302,870), 55:(1417,902), 56:(1061,961), 57:(1187,996), 58:(1313,966), 59:(1095,1083),
 60:(1223,1120), 61:(1327,1064), 62:(1189,1195), 63:(1139,1275),
 64:(84,641), 65:(176,716), 66:(141,795), 67:(249,789), 68:(237,863), 69:(355,789), 70:(355,860),
 71:(361,695), 72:(461,760), 73:(567,760),
 74:(424,949), 75:(313,982), 76:(373,1061), 77:(482,871), 78:(483,1129), 79:(666,1055), 80:(544,1208),
 81:(425,1215), 82:(461,1356), 83:(578,1299),
}
im = Image.open('game_resources/TS_map.jpg').convert('RGB')
W, H = im.size
L = im.convert('L').load()
def row_dark(y, x0, x1):
    xs = range(max(0,x0), min(W,x1)); return sum(1 for x in xs if L[x,y] < 80) / max(1,len(xs))
def col_mean(x, y0, y1):
    ys = range(max(0,y0), min(H,y1)); return sum(L[x,y] for y in ys) / max(1,len(ys))
def row_mean(y, x0, x1):
    xs = range(max(0,x0), min(W,x1)); return sum(L[x,y] for x in xs) / max(1,len(xs))
out = {}
def perim(l, t, w, h):
    # mean darkness along the rectangle's four sides (outline is ~1px, near-black)
    tot = n = 0
    for x in range(l, l+w+1, 2):
        tot += 255 - L[x, t]; n += 1
    for y in range(t, t+h+1, 2):
        tot += (255 - L[l, y]) + (255 - L[l+w, y]); n += 2
    return tot / n
for cid, (l, t) in ROUGH.items():
    best = None
    for w in (94, 95):
        for h in (62, 63):
            for dt in range(-7, 8):
                for dl in range(-7, 8):
                    sc = perim(l+dl, t+dt, w, h) - 1.0*(abs(dl)+abs(dt))
                    if best is None or sc > best[0]: best = (sc, l+dl, t+dt, w, h)
    sc, left, top, w, h = best
    out[cid] = dict(left=left, top=top, right=left+w, bottom=top+h, w=w, h=h,
                    cx=round(left+w/2), cy=round(top+h/2), score=round(sc,1), moved=(left-l, top-t))
json.dump(out, open(sys.argv[1] if len(sys.argv)>1 else 'ref_boxes.json','w'), indent=1)
for cid, b in out.items():
    flag = '' if (b['score']>120 and max(map(abs,b['moved']))<=8) else '  <-- CHECK'
    print(cid, b['left'], b['top'], b['right'], b['bottom'], 'c', (b['cx'], b['cy']), 'score', b['score'], 'mv', b['moved'], flag)
