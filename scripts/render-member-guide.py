"""Render the central-onboarding leader/member guide as a chapter-based Chinese PDF."""
from pathlib import Path
import re
from urllib.parse import urljoin
from xml.sax.saxutils import escape, quoteattr

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/CLUB_LEADER_AND_MEMBER_GUIDE_2026-10-13.md"
OUTPUT = ROOT / "output/pdf/lionclub_leader_member_guide_2026-10-13.pdf"
font = next((p for p in [Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"), Path("/Library/Fonts/Arial Unicode.ttf")] if p.is_file()), None)
if font is None:
    raise SystemExit("A Chinese TrueType font is required; configure font path before rendering.")
pdfmetrics.registerFont(TTFont("LionGuide", str(font)))
navy, gold, muted = colors.HexColor("#142037"), colors.HexColor("#856017"), colors.HexColor("#526176")
body = ParagraphStyle("Body", fontName="LionGuide", fontSize=11, leading=17.4, wordWrap="CJK", textColor=navy, spaceAfter=9)
title = ParagraphStyle("Title", parent=body, fontSize=22, leading=29, spaceAfter=14)
chapter = ParagraphStyle("Chapter", parent=body, fontSize=16, leading=23, textColor=gold, spaceBefore=9, spaceAfter=12, keepWithNext=True)
cell = ParagraphStyle("Cell", parent=body, fontSize=10.2, leading=15.8, spaceAfter=0)
quote = ParagraphStyle("Quote", parent=body, fontSize=10.5, leading=17.4, leftIndent=10, rightIndent=10, borderPadding=8, backColor=colors.HexColor("#F7F3E8"), spaceBefore=7, spaceAfter=13)

def inline(value):
    value = value.replace("–", "-").replace("—", "-").replace("‑", "-").replace("`", "")
    result, end = [], 0
    for match in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", value):
        result.append(escape(value[end:match.start()]))
        link = urljoin("https://github.com/aa29zzjj/lionclub/blob/main/docs/", match.group(2))
        result.append(f'<link href={quoteattr(link)} color="#315C91">{escape(match.group(1))}</link>')
        end = match.end()
    result.append(escape(value[end:]))
    return "".join(result)

def page_frame(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#C8A951"))
    canvas.setLineWidth(2)
    canvas.line(18*mm, height-16*mm, width-18*mm, height-16*mm)
    canvas.setFont("LionGuide", 8.5)
    canvas.setFillColor(muted)
    canvas.drawString(18*mm, height-12*mm, "LIONCLUB | 會長・幹部・會員操作教學")
    canvas.setLineWidth(.4)
    canvas.setStrokeColor(colors.HexColor("#DCE1E8"))
    canvas.line(18*mm, 16*mm, width-18*mm, 16*mm)
    canvas.drawString(18*mm, 11*mm, "中央註冊版 · 正式部署完成後適用 · 2026-10-13")
    canvas.drawRightString(width-18*mm, 11*mm, f"{doc.page}")
    canvas.restoreState()

lines = SOURCE.read_text(encoding="utf-8").splitlines()
story, index, chapters = [], 0, 0
while index < len(lines):
    line = lines[index].strip()
    if not line:
        index += 1
        continue
    if line.startswith("| "):
        rows = []
        while index < len(lines) and lines[index].strip().startswith("|"):
            entries = [part.strip() for part in lines[index].strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", entry) for entry in entries):
                rows.append([Paragraph(inline(entry), cell) for entry in entries])
            index += 1
        widths = [50*mm, 124*mm] if len(rows[0]) == 2 else [41*mm, 45*mm, 88*mm]
        table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#EEF1F5")),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
            ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LINEBELOW", (0,0), (-1,-1), .4, colors.HexColor("#DCE1E8")),
        ]))
        story.extend([table, Spacer(1, 11)])
        continue
    if line.startswith("# "):
        story.append(Paragraph(inline(line[2:]), title))
    elif line.startswith("## "):
        if chapters: story.append(PageBreak())
        story.append(Paragraph(inline(line[3:]), chapter))
        chapters += 1
    elif line.startswith("> "):
        story.append(Paragraph(inline(line[2:]), quote))
    elif line.startswith("- "):
        story.append(Paragraph("• " + inline(line[2:]), body))
    else:
        story.append(Paragraph(inline(line), body))
    index += 1

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=24*mm, bottomMargin=22*mm,
    title="獅子會 App - 分會長與會員操作手冊（中央註冊版）", author="Lionclub", allowSplitting=True)
document.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
print(OUTPUT)
