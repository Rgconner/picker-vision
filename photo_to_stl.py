"""Convert a 2D photo into a printable 3D STL file.

A single photo has no real depth information, so the image brightness is
used as a height map and extruded into a solid relief (a "2.5D" model).
This is the same technique used for lithophanes and embossed photo tiles.

Modes:
  relief      bright pixels are tall, dark pixels are low (default)
  lithophane  bright pixels are thin so backlight shines through them
  silhouette  the photo is thresholded and the object is extruded

Usage:
    python photo_to_stl.py photo.jpg
    python photo_to_stl.py photo.jpg --mode relief --width 80 --max-height 4
    python photo_to_stl.py photo.jpg --mode lithophane --width 120
    python photo_to_stl.py photo.jpg --mode silhouette --width 60
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter
from stl import mesh


def load_gray(path, resolution):
    """Load an image, apply EXIF rotation, convert to gray and downsample."""
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert('L')

    scale = resolution / max(img.size)
    if scale < 1.0:
        new_size = (max(2, round(img.width * scale)),
                    max(2, round(img.height * scale)))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    gray = np.asarray(img, dtype=np.float64) / 255.0
    return gray


def otsu_threshold(gray):
    """Simple Otsu threshold on a normalized [0, 1] image."""
    hist, _ = np.histogram(gray, bins=256, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.5

    idx = np.arange(256)
    w0 = np.cumsum(hist)
    w1 = total - w0
    m0_num = np.cumsum(hist * idx)

    m0 = np.zeros(256)
    m1 = np.zeros(256)
    safe0 = w0 > 0
    safe1 = w1 > 0
    m0[safe0] = m0_num[safe0] / w0[safe0]
    m1[safe1] = (m0_num[-1] - m0_num[safe1]) / w1[safe1]

    sigma = w0 * w1 * (m0 - m1) ** 2
    sigma[~(safe0 & safe1)] = -1.0
    return float(np.argmax(sigma)) / 255.0


def build_heightfield_mesh(heights, pixel_size, base_height):
    """Build a watertight solid mesh from a height map.

    The result has a shaped top surface, vertical side walls around the
    boundary and a flat bottom at z = 0.
    """
    rows, cols = heights.shape

    xs = (np.arange(cols) - (cols - 1) / 2.0) * pixel_size
    ys = (np.arange(rows) - (rows - 1) / 2.0) * pixel_size
    xx, yy = np.meshgrid(xs, ys)

    # Top surface vertices (grid, row-major)
    top = np.stack([xx, yy, base_height + heights], axis=-1).reshape(-1, 3)

    # Boundary loop, counter-clockwise seen from +Z, starting at (0, 0)
    boundary = []
    boundary.extend(i for i in range(cols))                          # bottom edge
    boundary.extend(j * cols + (cols - 1) for j in range(1, rows))   # right edge
    boundary.extend((rows - 1) * cols + i for i in range(cols - 2, -1, -1))  # top edge
    boundary.extend(j * cols for j in range(rows - 2, 0, -1))        # left edge
    boundary = np.asarray(boundary, dtype=np.int64)

    # Bottom vertices: boundary projected down to z = 0
    bottom = top[boundary].copy()
    bottom[:, 2] = 0.0

    verts = np.vstack([top, bottom])
    n_top = len(top)
    n_b = len(boundary)

    # Top surface faces (two triangles per grid cell, normals up)
    cell = (np.arange(rows - 1)[:, None] * cols +
            np.arange(cols - 1)[None, :]).reshape(-1)
    v00 = cell
    v10 = cell + 1
    v01 = cell + cols
    v11 = cell + cols + 1
    top_faces = np.stack([
        np.stack([v00, v10, v01], axis=1),
        np.stack([v10, v11, v01], axis=1),
    ]).reshape(-1, 3)

    # Side wall faces (normals outward)
    a = boundary
    b = np.roll(boundary, -1)
    pos = np.arange(n_b)
    pos_next = np.roll(pos, -1)
    wall_faces = np.stack([
        np.stack([a, n_top + pos, n_top + pos_next], axis=1),
        np.stack([a, n_top + pos_next, b], axis=1),
    ]).reshape(-1, 3)

    # Bottom face: fan from first boundary point (normal down)
    k = np.arange(1, n_b - 1)
    bottom_faces = np.stack([
        np.full_like(k, n_top),
        n_top + k + 1,
        n_top + k,
    ], axis=1)

    faces = np.vstack([top_faces, wall_faces, bottom_faces])

    m = mesh.Mesh(np.zeros(len(faces), dtype=mesh.Mesh.dtype))
    m.vectors[:] = verts[faces]
    m.update_normals()
    return m


def parse_args():
    parser = argparse.ArgumentParser(
        description='Convert a 2D photo into a 3D STL relief model.')
    parser.add_argument('input', help='path to the photo (jpg, png, bmp, ...)')
    parser.add_argument('-o', '--output',
                        help='output STL path (default: <input>.stl)')
    parser.add_argument('--mode', choices=['relief', 'lithophane', 'silhouette'],
                        default='relief', help='height mapping mode')
    parser.add_argument('--width', type=float, default=80.0,
                        help='model width along the longest image axis in mm')
    parser.add_argument('--max-height', type=float, default=4.0,
                        help='relief height in mm above the base')
    parser.add_argument('--base', type=float, default=1.2,
                        help='solid base plate thickness in mm')
    parser.add_argument('--resolution', type=int, default=200,
                        help='grid resolution along the longest axis in pixels')
    parser.add_argument('--blur', type=float, default=1.0,
                        help='smoothing strength in pixels (0 disables)')
    parser.add_argument('--gamma', type=float, default=1.0,
                        help='brightness gamma (<1 lifts shadows, >1 boosts peaks)')
    parser.add_argument('--invert', action='store_true',
                        help='invert brightness before mapping')
    parser.add_argument('--threshold', type=float, default=None,
                        help='silhouette threshold 0..1 (default: Otsu auto)')
    parser.add_argument('--min-thickness', type=float, default=0.8,
                        help='minimum thickness in mm for lithophane mode')
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.isfile(args.input):
        sys.exit(f'Input file not found: {args.input}')
    if args.width <= 0 or args.max_height < 0 or args.base < 0:
        sys.exit('--width must be > 0 and --max-height/--base must be >= 0')

    output = args.output or os.path.splitext(args.input)[0] + '.stl'

    print(f'Loading {args.input}...')
    gray = load_gray(args.input, max(8, args.resolution))
    rows, cols = gray.shape
    print(f'  Height map: {cols} x {rows} pixels')

    if args.blur > 0:
        gray = gaussian_filter(gray, sigma=args.blur)

    # Stretch to full contrast range
    lo, hi = float(gray.min()), float(gray.max())
    if hi > lo:
        gray = (gray - lo) / (hi - lo)
    else:
        gray = np.zeros_like(gray)

    if args.invert:
        gray = 1.0 - gray
    if args.gamma != 1.0:
        gray = np.clip(gray, 0.0, 1.0) ** args.gamma

    if args.mode == 'lithophane':
        # Bright pixels become thin so light passes through them
        heights = args.min_thickness + (1.0 - gray) * max(
            0.0, args.max_height - args.min_thickness)
        base_height = 0.0
    elif args.mode == 'silhouette':
        t = args.threshold if args.threshold is not None else otsu_threshold(gray)
        print(f'  Silhouette threshold: {t:.3f}')
        heights = np.where(gray > t, args.max_height, 0.0)
        base_height = args.base
    else:
        heights = gray * args.max_height
        base_height = args.base

    pixel_size = args.width / (max(rows, cols) - 1)
    print(f'Building mesh ({args.mode}, {pixel_size:.4f} mm/pixel)...')
    m = build_heightfield_mesh(heights, pixel_size, base_height)

    m.save(output)
    size_kb = os.path.getsize(output) / 1024
    print(f'Saved {output}')
    print(f'  Triangles: {len(m.vectors)}')
    print(f'  Size: {size_kb:.0f} KB')
    print(f'  Bounds X: {m.x.min():.1f}..{m.x.max():.1f} mm, '
          f'Y: {m.y.min():.1f}..{m.y.max():.1f} mm, '
          f'Z: {m.z.min():.1f}..{m.z.max():.1f} mm')


if __name__ == '__main__':
    main()


