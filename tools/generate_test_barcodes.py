"""
Test barcode sheet generator for Picker Vision System.

Requirements (all MIT/BSD/Apache 2.0 — no LGPL/GPL):
    pip install python-barcode qrcode[pil] reportlab svglib

Usage:
    python generate_test_barcodes.py
    Output: test_barcodes.pdf
"""

import io
import os

# ── Third-party imports ────────────────────────────────────────────────────────
import barcode
from barcode.writer import SVGWriter
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
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

STAGING_QR = [
    {"payload": "STAGING:ALPH", "code": "ALPH", "label": "Alpha Bay 1 (Area)"},
    {"payload": "STAGING:BETA", "code": "BETA", "label": "Beta Bay 2 (Area)"},
    {"payload": "STAGING:GAMM", "code": "GAMM", "label": "Gamma Tote 1 (Container)"},
    {"payload": "STAGING:DELT", "code": "DELT", "label": "Delta Tote 2 (Container)"},
    {"payload": "STAGING:EPSN", "code": "EPSN", "label": "Epsilon Tote 3 (Container)"},
]

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "test_barcodes.pdf")

# ── Helpers ────────────────────────────────────────────────────────────────────

PAGE_W, PAGE_H = A4          # 595 x 842 pt
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
        pagesize=A4,
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
    bc_h = 22 * mm   # barcode graphic height inside the cell

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

    qr_size = 28 * mm
    qr_cells = []
    for stg in STAGING_QR:
        qr_image = _make_qr_image(stg["payload"], qr_size)
        qr_cells.append([
            qr_image,
            Paragraph(f"<b>{stg['code']}</b>", caption_style),
            Paragraph(stg["label"], caption_style),
        ])

    qr_col_w = usable_w / 5
    qr_table = Table([qr_cells], colWidths=[qr_col_w] * 5)
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

    # ── Footer ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Generated by Picker Vision System — for testing only",
        footer_style,
    ))

    doc.build(story)
    print(f"PDF written to: {output_path}")


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    build_pdf(OUTPUT_FILE)
