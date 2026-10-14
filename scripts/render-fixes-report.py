"""Render the matching fixes Markdown; no application or network access."""
from pathlib import Path
import re
from xml.sax.saxutils import escape, quoteattr
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/FIXES_AND_SIMULATED_ACCEPTANCE_2026-10-14.md"
OUTPUT = ROOT / "output/pdf/lionclub_fixes_simulated_acceptance_2026-10-14.pdf"
PROOF = ROOT / "output/acceptance/2026-10-14-fixed"
pdfmetrics.registerFont(TTFont("LionReport", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"))
pdfmetrics.registerFontFamily("LionReport", normal="LionReport", bold="LionReport", italic="LionReport", boldItalic="LionReport")
navy, muted, gold = [colors.HexColor(value) for value in ("#142037", "#5B677E", "#8B6715")]
body = ParagraphStyle("Body", fontName="LionReport", fontSize=10.4, leading=16, textColor=navy, wordWrap="CJK", spaceAfter=7)
title = ParagraphStyle("Title", parent=body, fontSize=21, leading=30, spaceAfter=15)
h2 = ParagraphStyle("H2", parent=body, fontSize=14, leading=22, textColor=gold, spaceBefore=12, spaceAfter=9, keepWithNext=True)
cell = ParagraphStyle("Cell", parent=body, fontSize=9.8, leading=14.7, spaceAfter=0)
code = ParagraphStyle("Code", parent=body, fontSize=9.2, leading=14, backColor=colors.HexColor("#F1F4F7"), leftIndent=7)
caption = ParagraphStyle("Caption", parent=body, fontSize=9.6, leading=15, textColor=muted)

def inline(value):
    value = value.replace("`", "").replace("**", "")
    for dash in ("–", "—", "‑", "−"):
        value = value.replace(dash, "-")
    result, end = [], 0
    for match in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", value):
        result.append(escape(value[end:match.start()]))
        result.append(f'<link href={quoteattr(match.group(2))} color="#315C91">{escape(match.group(1))}</link>')
        end = match.end()
    result.append(escape(value[end:]))
    return "".join(result)

def furniture(canvas, doc):
    w, h = A4
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#C8A951")); canvas.setLineWidth(2)
    canvas.line(16*mm, h-14*mm, w-16*mm, h-14*mm)
    canvas.setFont("LionReport", 8); canvas.setFillColor(muted)
    canvas.drawString(16*mm, h-11*mm, "LIONCLUB | FIXES + SIMULATED ACCEPTANCE | 2026-10-14")
    canvas.setLineWidth(.4); canvas.setStrokeColor(colors.HexColor("#DCE1E8"))
    canvas.line(16*mm, 16*mm, w-16*mm, 16*mm)
    canvas.drawString(16*mm, 11*mm, "本機修正 / 基準 main 8962dd4 / 未推送、未部署")
    canvas.drawRightString(w-16*mm, 11*mm, str(doc.page)); canvas.restoreState()

story, index, in_code = [], 0, False
lines = SOURCE.read_text(encoding="utf-8").splitlines()
while index < len(lines):
    text = lines[index].strip()
    if not text:
        index += 1; continue
    if text.startswith("```"):
        in_code = not in_code; index += 1; continue
    if in_code:
        story.append(Paragraph(inline(text), code))
    elif text.startswith("|"):
        raw = []
        while index < len(lines) and lines[index].strip().startswith("|"):
            row = [value.strip() for value in lines[index].strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", value) for value in row): raw.append(row)
            index += 1
        widths = [34, 69, 75] if len(raw[0]) == 3 else [42, 136]
        rows = [[Paragraph(inline(value), cell) for value in row] for row in raw]
        table = Table(rows, colWidths=[value*mm for value in widths], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#EEF1F5")), ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("LEFTPADDING", (0,0), (-1,-1), 7), ("RIGHTPADDING", (0,0), (-1,-1), 7),
            ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LINEBELOW", (0,0), (-1,-1), .4, colors.HexColor("#DCE1E8")),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#FAFBFC")]),
        ]))
        story.extend([table, Spacer(1,8)]); continue
    elif text.startswith("# "):
        story.append(Paragraph(inline(text[2:]), title))
    elif text.startswith("## "):
        story.append(Paragraph(inline(text[3:]), h2))
    elif text.startswith("- "):
        story.append(Paragraph("• "+inline(text[2:]), body))
    else:
        story.append(Paragraph(inline(text), body))
    index += 1

def fitted(name, max_width=78, max_height=172):
    picture = Image(str(PROOF/name))
    factor = min(max_width*mm/picture.imageWidth, max_height*mm/picture.imageHeight)
    picture.drawWidth = factor*picture.imageWidth; picture.drawHeight = factor*picture.imageHeight
    picture.hAlign = "CENTER"
    return picture

for heading, description, names, labels in [
    ("畫面存證 A｜活動月曆日夜模式", "390 × 844 CSS px，合成帳號與合成活動。可辨識日期、活動場次及月份切換；320px 另外驗證僅月曆內橫滑，整頁不溢位。", ["calendar-light-390.jpg", "calendar-dark-390.jpg"], ["淺色模式", "深色模式"]),
    ("畫面存證 B｜會籍年度與人工報到", "左：2026 年 6 月正確顯示 25-26 會籍；幹部任期依 7/1 至隔年 6/30。右：人工核對補登後顯示成功，已到／應到由 0/1 更新為 1/1。", ["experience-dark-390.jpg", "manual-checkin-dark-390.jpg"], ["資歷頁（合成資料）", "人工補登成功（合成資料）"]),
]:
    if all((PROOF/name).exists() for name in names):
        story.extend([PageBreak(), Paragraph(heading, h2), Paragraph(description, body), Spacer(1,8)])
        pair = Table([[fitted(name) for name in names], [Paragraph(label, caption) for label in labels]], colWidths=[89*mm,89*mm])
        pair.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"), ("ALIGN",(0,0),(-1,-1),"CENTER"), ("TOPPADDING",(0,0),(-1,-1),5)]))
        story.append(pair)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=23*mm, bottomMargin=22*mm,
    title="獅子會 App 缺陷修復與模擬複驗報告 2026-10-14", author="Lionclub", allowSplitting=True).build(story, onFirstPage=furniture, onLaterPages=furniture)
print(OUTPUT)
