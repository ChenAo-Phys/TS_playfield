"""Hand-measured (from 1:1 crops with a 50 px grid) positions of non-country features on
game_resources/TS_map.jpg, 2448x1584. Boxes are [left, top, right, bottom]; accuracy about +-5 px."""
import json, sys
B = {
 "image": {"file": "game_resources/TS_map.jpg", "width": 2448, "height": 1584},
 "country_box_size": {"w": 95, "h": 63, "name_strip_h": 15, "note": "all 84 boxes measured 94-95 x 62-63 px"},
 "scoring_boxes": {
   "Europe":          [1050, 60, 1180, 150],
   "Middle East":     [1529, 788, 1659, 878],
   "Asia":            [1769, 617, 1899, 705],
   "Southeast Asia":  [1796, 924, 1929, 1012],
   "Africa":          [902, 980, 1032, 1070],
   "Central America": [500, 645, 630, 735],
   "South America":   [505, 1028, 635, 1112],
 },
 "subregion_labels": {
   "Western Europe": [731, 372, 855, 397],
   "Eastern Europe": [1176, 230, 1305, 252],
   "Southeast Asia": [1796, 1014, 1929, 1030],
 },
 "superpowers": {
   "USA":  {"label_box": [138, 480, 370, 570], "node_xy": [255, 530], "flag_area": [25, 330, 560, 600]},
   "USSR": {"label_box": [1264, 285, 1619, 358], "node_xy": [1440, 320]},
   "to_japan_arrow": [35, 555, 110, 580],
   "to_usa_arrow": [2304, 695, 2414, 745],
 },
 "action_round_track": {"title": [442, 78, 642, 98],
   "boxes": {str(i + 1): [cx - 23, 100, cx + 23, 148] for i, cx in enumerate([465, 522, 579, 636, 693, 750, 805, 861])}},
 "turn_record_track": {"title": [1662, 40, 1915, 68],
   "boxes": {str(t): [round(1665 + 73.7 * (t - 1)), 70, round(1665 + 73.7 * t) - 3, 148] for t in range(1, 11)},
   "era_bands": {"early": [1665, 155, 1885, 188], "mid": [1890, 155, 2180, 188], "late": [2188, 155, 2402, 188]}},
 "space_race_track": {"title": [1662, 218, 1868, 245],
   "boxes": {str(i): [cx - 36, 248, cx + 36, 320] for i, cx in enumerate([1702, 1782, 1864, 1944, 2026, 2106, 2188, 2270, 2352])},
   "labels_y": [320, 345], "ops_roll_y": [350, 366], "privileges_y": [372, 415]},
 "defcon_track": {"title": [728, 1212, 925, 1240],
   "boxes": {str(d): [cx - 36, 1240, cx + 36, 1308] for d, cx in zip([5, 4, 3, 2, 1], [764, 839, 914, 989, 1064])},
   "legend_y": [1313, 1338]},
 "military_ops_track": {"title": [728, 1382, 1095, 1408],
   "boxes": {str(i): [cx - 34, 1410, cx + 34, 1505] for i, cx in enumerate([762, 837, 912, 987, 1062, 1137])}},
 "vp_track": {"title": [1458, 1157, 1616, 1175],
   "col_centers_x": [1484, 1549, 1613, 1677, 1742, 1806, 1870, 1934, 1998],
   "row_centers_y": [1210, 1278, 1345, 1413, 1480], "cell": [60, 60],
   "layout": [
     ["USSR20(2 cols)", "", "USSR19", "USSR18", "USSR17", "USSR16", "USSR15", "USSR14", "USSR13"],
     ["USSR12", "USSR11", "USSR10", "USSR9", "USSR8", "USSR7", "USSR6", "USSR5", "USSR4"],
     ["USSR3", "USSR2", "USSR1", "0(3 cols)", "", "", "US1", "US2", "US3"],
     ["US4", "US5", "US6", "US7", "US8", "US9", "US10", "US11", "US12"],
     ["US13", "US14", "US15", "US16", "US17", "US18", "US19", "US20(2 cols)", ""]]},
 "chinese_civil_war_box": [1957, 543, 2082, 640],
 "sequence_of_play": [70, 1228, 322, 1485],
 "map_key": [2104, 1350, 2364, 1510],
 "title_logo": [50, 70, 400, 250],
}
json.dump(B, open(sys.argv[1], "w"), indent=1)
if len(sys.argv) > 2:
    from PIL import Image, ImageDraw
    im = Image.open('game_resources/TS_map.jpg').convert('RGB'); d = ImageDraw.Draw(im)
    def rect(r, c): d.rectangle(r, outline=c, width=3)
    for r in B["scoring_boxes"].values(): rect(r, (0, 255, 0))
    for r in B["subregion_labels"].values(): rect(r, (0, 255, 255))
    for k in ("action_round_track", "turn_record_track", "space_race_track", "defcon_track", "military_ops_track"):
        for r in B[k]["boxes"].values(): rect(r, (255, 0, 255))
    for y in B["vp_track"]["row_centers_y"]:
        for x in B["vp_track"]["col_centers_x"]: rect([x - 30, y - 30, x + 30, y + 30], (0, 255, 0))
    for k in ("USA", "USSR"):
        x, y = B["superpowers"][k]["node_xy"]; d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=(0, 255, 0))
    im.resize((1224, 792)).save(sys.argv[2])
