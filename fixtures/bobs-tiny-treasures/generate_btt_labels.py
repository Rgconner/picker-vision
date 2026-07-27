from pathlib import Path

import qrcode
from reportlab.lib.colors import black
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

LOCATIONS = [
    'A1', 'A2', 'A3',
    'B1', 'B2', 'B3',
    'C1', 'C2', 'C3',
]


def make_qr(payload: str) -> ImageReader:
    img = qrcode.QRCode(border=1, box_size=10)
    img.add_data(payload)
    img.make(fit=True)
    return ImageReader(img.make_image(fill_color='black', back_color='white').get_image())


def draw_page(pdf: canvas.Canvas, location: str) -> None:
    width, height = letter
    margin = 0.5 * inch
    border_x = margin
    border_y = margin
    border_w = width - (2 * margin)
    border_h = height - (2 * margin)

    pdf.setStrokeColor(black)
    pdf.setLineWidth(3)
    pdf.rect(border_x, border_y, border_w, border_h)

    pdf.setFont('Helvetica-Bold', 32)
    pdf.drawCentredString(width / 2, height - 1.1 * inch, f'Stock Location {location}')

    qr_size = 3.2 * inch
    qr_x = (width - qr_size) / 2
    qr_y = 1.15 * inch
    pdf.drawImage(make_qr(f'SHELF:{location}'), qr_x, qr_y, qr_size, qr_size, preserveAspectRatio=True, mask='auto')

    pdf.setFont('Helvetica', 18)
    pdf.drawCentredString(width / 2, qr_y - 0.35 * inch, f'QR: SHELF:{location}')

    pdf.showPage()


def generate(output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output_path), pagesize=letter)
    pdf.setTitle("Bob's Tiny Treasures Stock Locations")

    for location in LOCATIONS:
        draw_page(pdf, location)

    pdf.save()
    return output_path


if __name__ == '__main__':
    output = generate(Path(__file__).with_name('btt_stock_locations_letter.pdf'))
    print(f'Wrote {output}')
