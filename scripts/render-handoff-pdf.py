"""Render the release handoff Markdown as a readable, reproducible Chinese PDF."""
from pathlib import Path
import argparse
import re
from xml.sax.saxutils import escape, quoteattr
from urllib.parse import urljoin

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", default="docs/HAO_TO_JERRY_HANDOFF_2026-10-13.md")
parser.add_argument("--output", default="output/pdf/lionclub_handoff_for_jerry_2026-10-13.pdf")
parser.add_argument("--date", default="2026-10-13")
parser.add_argument("--ref", default="main")
parser.add_argument("--footer", default="main 進版交接 / App Store 準備階段")
parser.add_argument("--font-size", type=float, default=9.3)
args = parser.parse_args()
SOURCE = ROOT / args.source
OUTPUT = ROOT / args.output

font_candidates = [Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"), Path("/Library/Fonts/Arial Unicode.ttf")]
font_file = next((font for font in font_candidates if font.is_file()), None)
if font_file is None:
    raise SystemExit("Install an appropriate Chinese TrueType font and update font_candidates.")
pdfmetrics.registerFont(TTFont("LionBody", str(font_file)))
navy = colors.HexColor("#142037")
gold = colors.HexColor("#8B6715")
muted = colors.HexColor("#5B677E")
body = ParagraphStyle("Body", fontName="LionBody", fontSize=args.font_size, leading=args.font_size * 1.53, textColor=navy, wordWrap="CJK", spaceAfter=7)
title = ParagraphStyle("Title", parent=body, fontSize=19, leading=25, spaceAfter=15)
section = ParagraphStyle("Section", parent=body, fontSize=12.2, leading=18, textColor=gold, spaceBefore=12, spaceAfter=7, keepWithNext=True)
subsection = ParagraphStyle("Subsection", parent=body, fontSize=10.3, leading=16, spaceBefore=6, spaceAfter=5, keepWithNext=True)
cell = ParagraphStyle("Cell", parent=body, fontSize=args.font_size - .5, leading=(args.font_size - .5) * 1.51, spaceAfter=0)
code = ParagraphStyle("Code", parent=body, fontSize=args.font_size - 1.2, leading=(args.font_size - 1.2) * 1.55, leftIndent=7, backColor=colors.HexColor("#F3F5F8"), spaceAfter=2)

def inline(text):
    text = text.replace("–", "-").replace("—", "-").replace("‑", "-")
    text = text.replace("`", "").replace("**", "")
    result, previous = [], 0
    for match in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", text):
        result.append(escape(text[previous:match.start()]))
        target = urljoin(f"https://github.com/aa29zzjj/lionclub/blob/{args.ref}/docs/", match.group(2))
        result.append(f'<link href={quoteattr(target)} color="#315C91">{escape(match.group(1))}</link>')
        previous = match.end()
    result.append(escape(text[previous:]))
    return "".join(result)

def page_footer(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#C8A951"))
    canvas.setLineWidth(2)
    canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
    canvas.setFont("LionBody", 8)
    canvas.setFillColor(muted)
    canvas.drawString(18 * mm, height - 11 * mm, f"LIONCLUB | HAO TO JERRY | {args.date}")
    canvas.setStrokeColor(colors.HexColor("#DCE1E8"))
    canvas.setLineWidth(.5)
    canvas.line(18 * mm, 16 * mm, width - 18 * mm, 16 * mm)
    canvas.drawString(18 * mm, 11 * mm, args.footer)
    canvas.drawRightString(width - 18 * mm, 11 * mm, f"{doc.page}")
    canvas.restoreState()

story = []
lines = SOURCE.read_text(encoding="utf-8").splitlines()
index = 0
in_code = False
while index < len(lines):
    line = lines[index].strip()
    if not line:
        index += 1
        continue
    if line.startswith("```"):
        in_code = not in_code
        index += 1
        continue
    if in_code:
        story.append(Paragraph(inline(line), code))
    elif line == "<!-- pagebreak -->":
        story.append(PageBreak())
    elif line.startswith("| "):
        rows = []
        while index < len(lines) and lines[index].strip().startswith("|"):
            entries = [part.strip() for part in lines[index].strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", entry) for entry in entries):
                rows.append([Paragraph(inline(entry), cell) for entry in entries])
            index += 1
        count = len(rows[0])
        widths = [51 * mm, 123 * mm] if count == 2 else [30 * mm, 80 * mm, 64 * mm]
        table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEF1F5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#DCE1E8")),
        ]))
        story.extend([table, Spacer(1, 8)])
        continue
    elif line.startswith("# "):
        story.append(Paragraph(inline(line[2:]), title))
    elif line.startswith("## "):
        if line.startswith("## Hao／"):
            story.append(PageBreak())
        story.append(Paragraph(inline(line[3:]), section))
    elif line.startswith("### "):
        story.append(Paragraph(inline(line[4:]), subsection))
    elif line.startswith("- "):
        story.append(Paragraph("• " + inline(line[2:]), body))
    else:
        story.append(Paragraph(inline(line), body))
    index += 1

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=22 * mm, bottomMargin=22 * mm, title=f"獅子會 App - Hao 給 Jerry 進版交接 {args.date}", author="Hao / Lionclub", allowSplitting=True)
doc.build(story, onFirstPage=page_footer, onLaterPages=page_footer)
print(OUTPUT)
