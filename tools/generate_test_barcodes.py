"""
Test barcode sheet generator for Picker Vision System.

Requirements (all MIT/BSD/Apache 2.0 — no LGPL/GPL):
    pip install python-barcode qrcode[pil] reportlab svglib

Usage:
    python generate_test_barcodes.py
    Output: test_barcodes.pdf  (product / staging / BTT label sheets)
            nav_card.pdf       (physical picker confirmation card — A4 landscape)
"""

import io
import os

# ── Third-party imports ────────────────────────────────────────────────────────
import barcode
from barcode.writer import SVGWriter
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.graphics.shapes import Drawing, String, Rect

try:
    from svglib.svglib import svg2rlg
    HAS_SVGLIB = True
except ImportError:
    HAS_SVGLIB = False

# ── Seed data — must exactly match seed_data.py ───────────────────────────────

PRODUCTS = [
    {"barcode": "WH-00001", "description": "Widget A - Small Blue"},
    {"barcode": "WH-00002", "description": "Widget B - Medium Red"},
    {"barcode": "WH-00003", "description": "Gadget C - Large Green"},
    {"barcode": "WH-00004", "description": "Component D - Pack of 10"},
    {"barcode": "WH-00005", "description": "Assembly E - Heavy Duty"},
    {"barcode": "WH-00006", "description": "Part F - Precision"},
    {"barcode": "WH-00007", "description": "Module G - Standard"},
    {"barcode": "WH-00008", "description": "Unit H - Deluxe"},
    {"barcode": "WH-00009", "description": "Item I - Economy"},
    {"barcode": "WH-00010", "description": "Item J - Premium"},
]

# Bob's Tiny Treasures products — these use QR codes (not Code 128)
BTT_PRODUCTS = [
    {"barcode": "BTT-00101", "description": "Goblin Gem (S)"},
    {"barcode": "BTT-00102", "description": "Sapphire Sprite (S)"},
    {"barcode": "BTT-00103", "description": "Rascal Ruby (S)"},
    {"barcode": "BTT-00201", "description": "Purple Prism (M)"},
    {"barcode": "BTT-00202", "description": "Trickster Token (M)"},
    {"barcode": "BTT-00203", "description": "Captain's Cube (M)"},
    {"barcode": "BTT-00301", "description": "Magenta Monolith (L)"},
    {"barcode": "BTT-00302", "description": "White Whopper (L)"},
    {"barcode": "BTT-00303", "description": "Diamond Dynamo (L)"},
]

STAGING_QR = [
    {"payload": "STAGING:ALPH", "code": "ALPH", "label": "Alpha Bay 1 (Area)"},
    {"payload": "STAGING:BETA", "code": "BETA", "label": "Beta Bay 2 (Area)"},
    {"payload": "STAGING:GAMM", "code": "GAMM", "label": "Gamma Tote 1 (Container)"},
    {"payload": "STAGING:DELT", "code": "DELT", "label": "Delta Tote 2 (Container)"},
    {"payload": "STAGING:EPSN", "code": "EPSN", "label": "Epsilon Tote 3 (Container)"},
]

OUTPUT_FILE     = os.path.join(os.path.dirname(__file__), "test_barcodes.pdf")
NAV_CARD_FILE   = os.path.join(os.path.dirname(__file__), "nav_card.pdf")

# ── Helpers ────────────────────────────────────────────────────────────────────

PAGE_W, PAGE_H = landscape(letter)   # 792 x 612 pt  (11 x 8.5 in)
MARGIN = 18 * mm


def _make_code128_drawing(value: str, width_pt: float, height_pt: float):
    """Return a ReportLab Drawing containing a Code 128 barcode.

    If svglib is available the barcode is rendered as an SVG-derived drawing
    (scalable, no rasterisation artefacts). Otherwise a text-only fallback is
    used so the script always produces output.
    """
    if HAS_SVGLIB:
        try:
            svg_buf = io.BytesIO()
            code128_cls = barcode.get_barcode_class("code128")
            bc = code128_cls(value, writer=SVGWriter())
            bc.write(svg_buf)
            svg_buf.seek(0)
            drawing = svg2rlg(svg_buf)
            if drawing is not None:
                # Scale to fit the requested cell dimensions
                sx = width_pt / drawing.width
                sy = height_pt / drawing.height
                s = min(sx, sy)
                drawing.width = drawing.width * s
                drawing.height = drawing.height * s
                drawing.transform = (s, 0, 0, s, 0, 0)
                return drawing
        except Exception:
            pass  # fall through to text fallback

    # Text-only fallback (no svglib or svg2rlg failed)
    d = Drawing(width_pt, height_pt)
    d.add(Rect(0, 0, width_pt, height_pt, strokeColor=colors.black, fillColor=colors.white))
    d.add(String(width_pt / 2, height_pt / 2 - 6, value,
                 fontName="Helvetica-Bold", fontSize=11,
                 textAnchor="middle"))
    d.add(String(width_pt / 2, height_pt / 2 + 8, "(barcode — install svglib for graphic)",
                 fontName="Helvetica", fontSize=7,
                 textAnchor="middle"))
    return d


def _make_qr_image(payload: str, size_pt: float):
    """Return a ReportLab platypus Image (flowable) containing a QR code."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    pil_img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    buf.seek(0)

    from reportlab.platypus import Image as PlatypusImage
    return PlatypusImage(buf, width=size_pt, height=size_pt)


# ── PDF builder ────────────────────────────────────────────────────────────────

def build_pdf(output_path: str) -> None:
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "title",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    section_style = ParagraphStyle(
        "section",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        spaceBefore=12,
        spaceAfter=4,
    )
    caption_style = ParagraphStyle(
        "caption",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=TA_CENTER,
    )
    footer_style = ParagraphStyle(
        "footer",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=TA_CENTER,
        textColor=colors.grey,
    )

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(letter),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    story = []

    # ── Title ──────────────────────────────────────────────────────────────────
    story.append(Paragraph("Picker Vision System — Test Barcodes", title_style))
    story.append(Spacer(1, 4 * mm))

    # ── Product barcodes section ───────────────────────────────────────────────
    story.append(Paragraph("Product Barcodes (Code 128)", section_style))

    # 2-column grid; cell width = (usable width) / 2
    usable_w = PAGE_W - 2 * MARGIN
    cell_w = usable_w / 2 - 4 * mm
    bc_h = 33 * mm   # barcode graphic height — 150% of standard 22 mm

    rows = []
    row = []
    for i, prod in enumerate(PRODUCTS):
        bc_drawing = _make_code128_drawing(prod["barcode"], cell_w, bc_h)
        cell_content = [
            bc_drawing,
            Paragraph(f"<b>{prod['barcode']}</b>", caption_style),
            Paragraph(prod["description"], caption_style),
        ]
        row.append(cell_content)
        if len(row) == 2 or i == len(PRODUCTS) - 1:
            if len(row) == 1:
                row.append("")   # pad last row
            rows.append(row)
            row = []

    col_w = usable_w / 2
    product_table = Table(rows, colWidths=[col_w, col_w])
    product_table.setStyle(TableStyle([
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("ALIGN",      (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("GRID",       (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(product_table)
    story.append(Spacer(1, 6 * mm))

    # ── Staging QR section ─────────────────────────────────────────────────────
    story.append(Paragraph("Staging QR Codes", section_style))

    qr_size = 76.2 * mm   # 3 inches
    qr_cells = []
    for stg in STAGING_QR:
        qr_image = _make_qr_image(stg["payload"], qr_size)
        qr_cells.append([
            qr_image,
            Paragraph(f"<b>{stg['code']}</b>", caption_style),
            Paragraph(stg["label"], caption_style),
        ])

    # 3 columns × 2 rows; pad last row to 3 cells
    qr_col_w = usable_w / 3
    qr_rows = [qr_cells[i:i + 3] for i in range(0, len(qr_cells), 3)]
    if len(qr_rows[-1]) < 3:
        qr_rows[-1] += [""] * (3 - len(qr_rows[-1]))
    qr_table = Table(qr_rows, colWidths=[qr_col_w] * 3)
    qr_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(qr_table)

    # ── BTT Product QR section ─────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph("Bob's Tiny Treasures — Product QR Codes (2 inch)", section_style))

    btt_qr_size = 50.8 * mm   # 2 inches — matches printed label size
    btt_cells = []
    for prod in BTT_PRODUCTS:
        qr_image = _make_qr_image(prod["barcode"], btt_qr_size)
        btt_cells.append([
            qr_image,
            Paragraph(f"<b>{prod['barcode']}</b>", caption_style),
            Paragraph(prod["description"], caption_style),
        ])

    # 4 columns — 9 products = 3 rows × 3 + 1 empty
    btt_col_w = usable_w / 4
    btt_rows = [btt_cells[i:i + 4] for i in range(0, len(btt_cells), 4)]
    if len(btt_rows[-1]) < 4:
        btt_rows[-1] += [""] * (4 - len(btt_rows[-1]))
    btt_table = Table(btt_rows, colWidths=[btt_col_w] * 4)
    btt_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(btt_table)

    # ── Footer ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Generated by Picker Vision System — for testing only",
        footer_style,
    ))

    doc.build(story)
    print(f"PDF written to: {output_path}")


# ── Nav card builder ───────────────────────────────────────────────────────────

# Four NAV:* commands the scanner already handles as control events.
NAV_COMMANDS = [
    {"payload": "NAV:CONFIRM", "label": "CONFIRM",  "corner": "top-right"},
    {"payload": "NAV:SKIP",    "label": "SKIP",     "corner": "top-left"},
    {"payload": "NAV:BACK",    "label": "BACK",     "corner": "bottom-left"},
    {"payload": "NAV:HELP",    "label": "HELP",     "corner": "bottom-right"},
]

# Corner layout on A4 landscape (841.89 × 595.28 pt):
#   top-left     top-right
#   bottom-left  bottom-right
_NAV_CORNER_POSITIONS = {
    "top-left":     (0, 1),   # (col, row) in a 2×2 table
    "top-right":    (1, 1),
    "bottom-left":  (0, 0),
    "bottom-right": (1, 0),
}

from reportlab.lib.pagesizes import A4

def build_nav_card(output_path: str) -> None:
    """Produce a single A4 landscape page with NAV QR codes in each corner.

    The picker scans a corner to send a control event instead of tapping
    the on-screen button. The scanner already handles NAV:* payloads —
    this card is a purely physical print artefact.
    """
    from reportlab.platypus import Image as PlatypusImage

    styles = getSampleStyleSheet()
    label_style = ParagraphStyle(
        "nav_label",
        parent=styles["Normal"],
        fontSize=18,
        leading=22,
        alignment=TA_CENTER,
        fontName="Helvetica-Bold",
    )
    hint_style = ParagraphStyle(
        "nav_hint",
        parent=styles["Normal"],
        fontSize=9,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.grey,
    )
    title_style = ParagraphStyle(
        "nav_title",
        parent=styles["Heading1"],
        fontSize=13,
        leading=16,
        alignment=TA_CENTER,
        spaceAfter=4,
    )

    page_w, page_h = landscape(A4)   # 841.89 × 595.28 pt
    nav_margin = 14 * mm
    qr_size = 110 * mm   # 1.5-inch QR at print resolution — large enough for easy scan

    doc = SimpleDocTemplate(
        output_path,
        pagesize=landscape(A4),
        leftMargin=nav_margin,
        rightMargin=nav_margin,
        topMargin=nav_margin,
        bottomMargin=nav_margin,
    )

    story = []
    story.append(Paragraph("Bob's Tiny Treasures — Picker Nav Card", title_style))
    story.append(Paragraph(
        "Scan a corner to confirm, skip, go back, or call for help — no screen tap needed.",
        hint_style,
    ))
    story.append(Spacer(1, 4 * mm))

    # Build a 2×2 grid ordered: [top-left, top-right] / [bottom-left, bottom-right]
    # Nav commands keyed by corner for lookup
    by_corner = {cmd["corner"]: cmd for cmd in NAV_COMMANDS}
    grid = [
        ["top-left", "top-right"],
        ["bottom-left", "bottom-right"],
    ]

    table_rows = []
    for row_corners in grid:
        row_cells = []
        for corner in row_corners:
            cmd = by_corner[corner]
            qr_img = _make_qr_image(cmd["payload"], qr_size)
            cell = [
                qr_img,
                Paragraph(cmd["label"], label_style),
                Paragraph(cmd["payload"], hint_style),
            ]
            row_cells.append(cell)
        table_rows.append(row_cells)

    usable_w = page_w - 2 * nav_margin
    col_w = usable_w / 2

    nav_table = Table(table_rows, colWidths=[col_w, col_w])
    nav_table.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("BOX",           (0, 0), (-1, -1), 1, colors.black),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, colors.black),
    ]))
    story.append(nav_table)

    doc.build(story)
    print(f"Nav card written to: {output_path}")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    build_pdf(OUTPUT_FILE)
    build_nav_card(NAV_CARD_FILE)
