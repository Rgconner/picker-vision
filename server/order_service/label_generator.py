"""label_generator.py — Bob's Tiny Treasures PDF label sheet generator.

Pure function: generate_label_pdf(config: dict) -> bytes
No database imports. All product/shelf/zone data is passed in via config.

Config schema
-------------
{
  "print_mode": "cut" | "avery",          # layout engine
  "sections": {
    "products": {
      "include": true,
      "barcode_type": "qr" | "code128" | "upc",
      "detail": "minimal" | "detailed",
      "avery_template": "22807"           # ignored in cut mode
    },
    "shelves": {
      "include": true,
      "barcode_type": "qr" | "code128",   # UPC silently → code128 for shelves
      "detail": "minimal" | "detailed",
      "rows": 3,
      "cols": 3,
      "avery_template": "5164"
    },
    "zones": {
      "include": true,
      "barcode_type": "qr" | "code128",
      "detail": "minimal" | "detailed",
      "colour_band": false,
      "avery_template": "8165"
    }
  },
  "products": [ {barcode, description, sku, weight_kg}, ... ],
  "zones":    [ {code, label, qr_payload}, ... ]
}
"""

from __future__ import annotations

import io
from typing import Any

# ── ReportLab ─────────────────────────────────────────────────────────────────
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen.canvas import Canvas

# ── Barcode / QR libraries ────────────────────────────────────────────────────
import qrcode
import qrcode.image.pil as _qr_pil
from PIL import Image as _PILImage

# python-barcode for Code128 and UPC-A
import barcode as _barcode
from barcode.writer import ImageWriter as _ImageWriter

# ---------------------------------------------------------------------------
# Avery template specs: (left_margin, top_margin, label_w, label_h, h_gap, v_gap, cols)
# All in inches.
# ---------------------------------------------------------------------------
_AVERY = {
    "22807": (0.75, 0.50, 1.00, 1.00, 0.125, 0.00, 4),   # 1×1 sq, 40/sheet
    "5164":  (0.14, 0.50, 4.00, 3.33, 0.19,  0.00, 2),   # 3.33×4, 6/sheet (landscape label)
    "5163":  (0.14, 0.50, 4.00, 2.00, 0.19,  0.00, 2),   # 2×4, 10/sheet
    "8165":  (0.00, 0.00, 8.50, 11.0, 0.00,  0.00, 1),   # full sheet, 1/page
}

# Cut-yourself defaults per section (label_w, label_h, cols)
_CUT = {
    "products": (1.50, 1.50, 4),
    "shelves":  (3.50, 3.00, 2),
    "zones":    (7.50, 9.50, 1),
}

# Brand colours
_AMBER  = colors.HexColor("#f59e0b")
_DARK   = colors.HexColor("#0f1117")
_WHITE  = colors.HexColor("#f8fafc")
_MUTED  = colors.HexColor("#94a3b8")
_BORDER = colors.HexColor("#2d3142")

# Zone colour bands
_ZONE_COLOURS = {
    "TINY": colors.HexColor("#f59e0b"),   # amber
    "WOND": colors.HexColor("#3b82f6"),   # blue
    "CHRM": colors.HexColor("#22c55e"),   # green
}

ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


# ---------------------------------------------------------------------------
# Barcode image helpers — return PIL Image objects
# ---------------------------------------------------------------------------

def _make_qr(value: str, size_px: int = 200) -> _PILImage.Image:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=max(2, size_px // 25),
        border=2,
    )
    qr.add_data(value)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    return img.get_image().resize((size_px, size_px), _PILImage.LANCZOS)


def _make_code128(value: str, width_px: int = 300, height_px: int = 80) -> _PILImage.Image:
    writer = _ImageWriter()
    writer.set_options({"write_text": False, "quiet_zone": 2})
    cls = _barcode.get_barcode_class("code128")
    buf = io.BytesIO()
    cls(value, writer=writer).write(buf, options={"write_text": False, "module_height": 10.0})
    buf.seek(0)
    img = _PILImage.open(buf).convert("RGB")
    return img.resize((width_px, height_px), _PILImage.LANCZOS)


def _make_upc(value: str, width_px: int = 300, height_px: int = 80) -> _PILImage.Image:
    """Attempt UPC-A; falls back to Code128 for non-numeric or wrong-length values."""
    digits = "".join(c for c in value if c.isdigit())
    # UPC-A needs exactly 11 or 12 digits
    if len(digits) in (11, 12):
        try:
            writer = _ImageWriter()
            cls = _barcode.get_barcode_class("upca")
            buf = io.BytesIO()
            cls(digits[:11], writer=writer).write(buf, options={"write_text": False, "module_height": 10.0})
            buf.seek(0)
            img = _PILImage.open(buf).convert("RGB")
            return img.resize((width_px, height_px), _PILImage.LANCZOS)
        except Exception:
            pass
    return _make_code128(value, width_px, height_px)


def _barcode_image(value: str, btype: str, wide: bool = False) -> _PILImage.Image:
    """Return a PIL Image for the requested barcode type."""
    wp = 320 if wide else 200
    hp = 90  if wide else 60
    if btype == "qr":
        return _make_qr(value, 200)
    elif btype == "upc":
        return _make_upc(value, wp, hp)
    else:
        return _make_code128(value, wp, hp)


def _pil_to_rl(img: _PILImage.Image) -> io.BytesIO:
    """Convert a PIL image to a ReportLab-readable PNG BytesIO."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


# ---------------------------------------------------------------------------
# Cell drawing helpers
# ---------------------------------------------------------------------------

def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[:max_chars - 1] + "…"


def _draw_wordmark(c: Canvas, x: float, y: float, w: float):
    """Draw the BTT text wordmark at the given baseline position."""
    # TODO ST-6: replace with svglib.svg2rlg(logo.svg) and renderPDF.draw()
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(_AMBER)
    label = "Bob's Tiny Treasures"
    c.drawCentredString(x + w / 2, y, label)


def _draw_cut_lines(c: Canvas, x: float, y: float, w: float, h: float):
    c.setStrokeColor(_BORDER)
    c.setDash(2, 3)
    c.setLineWidth(0.25)
    c.rect(x, y, w, h, stroke=1, fill=0)
    c.setDash()


def _draw_product_cell(
    c: Canvas, x: float, y: float, w: float, h: float,
    product: dict, btype: str, detail: bool, cut_lines: bool,
):
    if cut_lines:
        _draw_cut_lines(c, x, y, w, h)

    # Determine barcode value — use raw barcode for all types
    value = product["barcode"]
    is_qr = (btype == "qr")
    img = _barcode_image(value, btype)
    img_buf = _pil_to_rl(img)

    # Layout: barcode image in upper portion, text below
    text_h = (0.45 if detail else 0.25) * inch
    bc_size = min(w - 0.12 * inch, h - text_h - 0.08 * inch)
    bc_x = x + (w - bc_size) / 2
    bc_y = y + text_h + 0.04 * inch

    if is_qr:
        c.drawImage(img_buf, bc_x, bc_y, bc_size, bc_size, preserveAspectRatio=True)
    else:
        bc_w = min(w - 0.12 * inch, bc_size * 1.8)
        bc_h = bc_size * 0.4
        c.drawImage(img_buf, x + (w - bc_w) / 2, bc_y + (bc_size - bc_h) / 2, bc_w, bc_h, preserveAspectRatio=False)

    # Text
    ty = y + text_h - 0.04 * inch
    name = _truncate(product["description"].split("—")[0].strip(), 22 if detail else 28)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", max(5, min(8, int(w / inch * 5.5))))
    c.drawCentredString(x + w / 2, ty, name)

    if detail:
        c.setFont("Helvetica", max(4, min(6, int(w / inch * 4))))
        c.setFillColor(colors.HexColor("#444444"))
        sku_line = f"{product['sku']}  ·  {int(product['weight_kg']*1000)} g"
        c.drawCentredString(x + w / 2, ty - 0.14 * inch, sku_line)
        c.setFont("Courier", max(4, min(5, int(w / inch * 3.5))))
        c.drawCentredString(x + w / 2, ty - 0.26 * inch, value)


def _draw_shelf_cell(
    c: Canvas, x: float, y: float, w: float, h: float,
    shelf_code: str, btype: str, detail: bool, cut_lines: bool,
):
    if cut_lines:
        _draw_cut_lines(c, x, y, w, h)

    # Shelves can't use UPC — fall back to code128
    effective_type = "code128" if btype == "upc" else btype
    qr_payload = f"SHELF:{shelf_code}"
    img = _barcode_image(qr_payload, effective_type)
    img_buf = _pil_to_rl(img)

    # Large shelf code at top
    code_h = 0.45 * inch
    c.setFont("Helvetica-Bold", min(36, int(w / inch * 18)))
    c.setFillColor(colors.black)
    c.drawCentredString(x + w / 2, y + h - code_h + 0.06 * inch, shelf_code)

    # Barcode image in middle
    bc_margin = 0.12 * inch
    avail_h = h - code_h - (0.3 * inch if detail else 0.2 * inch) - bc_margin
    is_qr = (effective_type == "qr")
    if is_qr:
        bc_size = min(w - bc_margin * 2, avail_h)
        bc_x = x + (w - bc_size) / 2
        bc_y = y + (0.3 * inch if detail else 0.2 * inch)
        c.drawImage(img_buf, bc_x, bc_y, bc_size, bc_size, preserveAspectRatio=True)
    else:
        bc_w = w - bc_margin * 2
        bc_h = min(avail_h * 0.6, 0.7 * inch)
        bc_x = x + bc_margin
        bc_y = y + (0.3 * inch if detail else 0.2 * inch) + (avail_h - bc_h) / 2
        c.drawImage(img_buf, bc_x, bc_y, bc_w, bc_h, preserveAspectRatio=False)

    # Sub-label
    c.setFont("Helvetica", min(10, int(w / inch * 4)))
    c.setFillColor(colors.HexColor("#444444"))
    c.drawCentredString(x + w / 2, y + 0.1 * inch, f"Shelf {shelf_code}")

    if detail:
        c.setFont("Courier", min(7, int(w / inch * 3)))
        c.drawCentredString(x + w / 2, y + 0.3 * inch, qr_payload)


def _draw_zone_cell(
    c: Canvas, x: float, y: float, w: float, h: float,
    zone: dict, btype: str, detail: bool, colour_band: bool, cut_lines: bool,
):
    if cut_lines:
        _draw_cut_lines(c, x, y, w, h)

    code  = zone["code"]
    label = zone["label"]
    value = zone["qr_payload"]

    # Optional colour band across the top
    band_h = 0.0
    if colour_band:
        band_h = 0.55 * inch
        band_col = _ZONE_COLOURS.get(code, _AMBER)
        c.setFillColor(band_col)
        c.rect(x, y + h - band_h, w, band_h, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", min(22, int(w / inch * 9)))
        c.drawCentredString(x + w / 2, y + h - band_h + 0.12 * inch, code)

    # Zone code in large text (below band if present)
    code_y = y + h - band_h - 0.45 * inch
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", min(28, int(w / inch * 10)))
    if not colour_band:
        c.drawCentredString(x + w / 2, code_y, code)

    # Barcode image — centred
    effective_type = "code128" if btype == "upc" else btype
    img = _barcode_image(value, effective_type)
    img_buf = _pil_to_rl(img)

    footer_h = 0.35 * inch
    top_used = band_h + (0.0 if colour_band else 0.5 * inch)
    avail_h  = h - top_used - footer_h - 0.15 * inch
    is_qr = (effective_type == "qr")
    if is_qr:
        bc_size = min(w * 0.65, avail_h * 0.85)
        bc_x = x + (w - bc_size) / 2
        bc_y = y + footer_h + (avail_h - bc_size) / 2 + 0.1 * inch
        c.drawImage(img_buf, bc_x, bc_y, bc_size, bc_size, preserveAspectRatio=True)
    else:
        bc_w = w * 0.75
        bc_h = min(avail_h * 0.4, 1.2 * inch)
        bc_x = x + (w - bc_w) / 2
        bc_y = y + footer_h + (avail_h - bc_h) / 2 + 0.1 * inch
        c.drawImage(img_buf, bc_x, bc_y, bc_w, bc_h, preserveAspectRatio=False)

    # Zone label text
    c.setFont("Helvetica", min(13, int(w / inch * 5)))
    c.setFillColor(colors.HexColor("#222222"))
    c.drawCentredString(x + w / 2, y + footer_h - 0.02 * inch, label)

    if detail:
        c.setFont("Courier", min(8, int(w / inch * 3.2)))
        c.setFillColor(colors.HexColor("#555555"))
        c.drawCentredString(x + w / 2, y + 0.18 * inch, value)

    # BTT wordmark footer
    _draw_wordmark(c, x, y + 0.04 * inch, w)


# ---------------------------------------------------------------------------
# Layout engine — places cells on pages
# ---------------------------------------------------------------------------

def _layout_spec(section: str, cfg: dict, print_mode: str):
    """Return (label_w, label_h, cols, left_margin, bottom_margin, h_gap, v_gap) in points."""
    pg_w, pg_h = LETTER  # 612 × 792 pt

    if print_mode == "avery":
        tpl_key = cfg.get("avery_template", list(_AVERY.keys())[0])
        tpl = _AVERY.get(tpl_key)
        if tpl:
            lm, tm, lw, lh, hg, vg, cols = tpl
            # Convert inches → points
            lw_pt = lw * inch; lh_pt = lh * inch
            lm_pt = lm * inch; tm_pt = tm * inch
            hg_pt = hg * inch; vg_pt = vg * inch
            bm_pt = pg_h - tm_pt - lh_pt  # first row bottom in points from bottom of page
            return lw_pt, lh_pt, cols, lm_pt, bm_pt, hg_pt, vg_pt

    # Cut-yourself fallback
    lw, lh, cols = _CUT[section]
    lw_pt = lw * inch; lh_pt = lh * inch
    h_margin = (pg_w - cols * lw_pt) / 2
    rows_per_page = max(1, int((pg_h - 0.5 * inch) / (lh_pt + 0.05 * inch)))
    v_margin = (pg_h - rows_per_page * lh_pt) / 2
    return lw_pt, lh_pt, cols, h_margin, v_margin, 0.0, 0.05 * inch


def _place_cells(c: Canvas, items: list, draw_fn, section: str, cfg: dict, print_mode: str):
    """Iterate items, placing each in the correct cell position, paginating as needed."""
    pg_w, pg_h = LETTER
    lw, lh, cols, lm, bm, hg, vg = _layout_spec(section, cfg, print_mode)
    cut_lines = (print_mode == "cut")

    col_idx = 0
    row_idx = 0
    first_item = True

    # Compute rows per page from the first row's bottom margin
    rows_per_page = max(1, int((pg_h - bm) / (lh + vg + 0.001)))

    for idx, item in enumerate(items):
        if idx > 0 and col_idx == 0 and row_idx == 0:
            c.showPage()

        x = lm + col_idx * (lw + hg)
        # ReportLab y=0 is bottom; row_idx=0 is the topmost row on the page
        y = pg_h - bm - lh - row_idx * (lh + vg)

        draw_fn(c, x, y, lw, lh, item)

        col_idx += 1
        if col_idx >= cols:
            col_idx = 0
            row_idx += 1
            if row_idx >= rows_per_page:
                row_idx = 0
                c.showPage()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_label_pdf(config: dict) -> bytes:
    """Generate a label sheet PDF and return the raw bytes.

    ``config`` follows the schema documented at the top of this module.
    """
    buf = io.BytesIO()
    c = Canvas(buf, pagesize=LETTER)
    c.setTitle("Bob's Tiny Treasures — Warehouse Labels")
    c.setAuthor("Picker Vision / Bob's Tiny Treasures")

    print_mode = config.get("print_mode", "cut")
    sections   = config.get("sections", {})
    products   = config.get("products", [])
    zones      = config.get("zones", [])

    page_started = False  # track whether we've drawn anything yet

    # ── Products ─────────────────────────────────────────────────────────────
    prod_cfg = sections.get("products", {})
    if prod_cfg.get("include", True) and products:
        btype  = prod_cfg.get("barcode_type", "qr")
        detail = prod_cfg.get("detail", "minimal") == "detailed"

        def _draw_p(cv, x, y, w, h, p):
            _draw_product_cell(cv, x, y, w, h, p, btype, detail, cut_lines=(print_mode=="cut"))

        _place_cells(c, products, _draw_p, "products", prod_cfg, print_mode)
        page_started = True

    # ── Shelves ───────────────────────────────────────────────────────────────
    shelf_cfg = sections.get("shelves", {})
    if shelf_cfg.get("include", True):
        rows  = int(shelf_cfg.get("rows", 3))
        cols  = int(shelf_cfg.get("cols", 3))
        btype  = shelf_cfg.get("barcode_type", "qr")
        detail = shelf_cfg.get("detail", "minimal") == "detailed"
        shelf_codes = [
            f"{ROW_LETTERS[r]}{c+1}"
            for r in range(rows)
            for c in range(cols)
        ]

        if shelf_codes:
            if page_started:
                c.showPage()

            def _draw_s(cv, x, y, w, h, code):
                _draw_shelf_cell(cv, x, y, w, h, code, btype, detail, cut_lines=(print_mode=="cut"))

            _place_cells(c, shelf_codes, _draw_s, "shelves", shelf_cfg, print_mode)
            page_started = True

    # ── Zones ─────────────────────────────────────────────────────────────────
    zone_cfg = sections.get("zones", {})
    if zone_cfg.get("include", True) and zones:
        btype       = zone_cfg.get("barcode_type", "qr")
        detail      = zone_cfg.get("detail", "minimal") == "detailed"
        colour_band = bool(zone_cfg.get("colour_band", False))

        if page_started:
            c.showPage()

        def _draw_z(cv, x, y, w, h, zone):
            _draw_zone_cell(cv, x, y, w, h, zone, btype, detail, colour_band, cut_lines=(print_mode=="cut"))

        _place_cells(c, zones, _draw_z, "zones", zone_cfg, print_mode)

    c.save()
    buf.seek(0)
    return buf.getvalue()
