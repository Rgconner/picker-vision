import numpy as np
from stl import mesh
from math import pi, cos, sin

# Panel dimensions
PANEL_SIZE = 155
PANEL_THICKNESS = 3
CORNER_RADIUS = 12
FAN_MOUNT_SPACING = 124.5
STANDOFF_HEIGHT = 10
STANDOFF_DIAMETER = 8
HOLE_DIAMETER = 4.2

# V-recess
V_RECESS_DEPTH = 5

# Venting
VENT_COUNT = 7
VENT_WIDTH = 40
VENT_HEIGHT = 2.5
VENT_SPACING = 5

def create_rounded_square_vertices(size, radius, z):
    """Create vertices for a rounded square at height z"""
    vertices = []
    half = size / 2
    r = radius
    segments = 16
    
    for corner_idx in range(4):
        cx = half - r if corner_idx % 2 == 0 else -half + r
        cy = half - r if corner_idx < 2 else -half + r
        start_angle = -pi/2 + corner_idx * pi/2
        for i in range(segments):
            angle = start_angle + (pi/2) * i / segments
            x = cx + r * cos(angle)
            y = cy + r * sin(angle)
            vertices.append([x, y, z])
    return np.array(vertices)

def create_panel_with_v_recess():
    """Create panel with V-recess integrated into the geometry"""
    vertices = []
    faces = []
    
    half = PANEL_SIZE / 2
    
    # Create top face with V-recess
    # The V-recess creates a depression in the left-center area
    # We'll create a modified top surface
    
    # Base grid for top face
    grid_size = 20
    x_range = np.linspace(-half, half, grid_size)
    y_range = np.linspace(-half, half, grid_size)
    
    # Create vertices with V-recess depth
    for y in y_range:
        for x in x_range:
            # Check if point is in V-recess area
            z = PANEL_THICKNESS
            
            # V-recess: two triangles meeting at center
            # Upper triangle: from top-left to center
            if x < 0 and y > 0 and y < -x + half - 15:
                # Interpolate depth based on distance from edge
                depth_factor = 1.0 - (abs(x) / (half - 15))
                z = PANEL_THICKNESS - V_RECESS_DEPTH * depth_factor
            
            # Lower triangle: from bottom-left to center
            elif x < 0 and y < 0 and y > x - half + 15:
                depth_factor = 1.0 - (abs(x) / (half - 15))
                z = PANEL_THICKNESS - V_RECESS_DEPTH * depth_factor
            
            vertices.append([x, y, z])
    
    # Create faces for top surface (grid triangulation)
    for i in range(grid_size - 1):
        for j in range(grid_size - 1):
            idx = i * grid_size + j
            # Two triangles per grid cell
            faces.append([idx, idx + 1, idx + grid_size])
            faces.append([idx + 1, idx + grid_size + 1, idx + grid_size])
    
    # Create bottom face (flat)
    bottom_offset = len(vertices)
    bottom_verts = create_rounded_square_vertices(PANEL_SIZE, CORNER_RADIUS, 0)
    vertices.extend(bottom_verts)
    
    n_bottom = len(bottom_verts)
    for i in range(1, n_bottom - 1):
        faces.append([bottom_offset + 0, bottom_offset + i + 1, bottom_offset + i])
    
    # Create side walls (simplified - just connect edges)
    # This is a simplification - a full implementation would create proper side walls
    
    return np.array(vertices), faces

def create_standoff_cylinder(position, height, outer_radius, inner_radius=0, sections=16):
    """Create a cylinder (with optional hole) at position"""
    vertices = []
    faces = []
    
    base_idx = 0
    
    # Outer cylinder
    for i in range(sections):
        angle = 2 * pi * i / sections
        x = position[0] + outer_radius * cos(angle)
        y = position[1] + outer_radius * sin(angle)
        vertices.append([x, y, 0])
        vertices.append([x, y, -height])
    
    # Outer cylinder faces
    for i in range(sections):
        next_i = (i + 1) % sections
        # Side faces
        faces.append([2*i, 2*next_i, 2*next_i+1])
        faces.append([2*i, 2*next_i+1, 2*i+1])
        # Top cap
        faces.append([2*next_i+1, 2*i+1, 1])
        # Bottom cap
        faces.append([2*i, 2*next_i, 0])
    
    # Inner hole (if specified)
    if inner_radius > 0:
        hole_base = len(vertices)
        for i in range(sections):
            angle = 2 * pi * i / sections
            x = position[0] + inner_radius * cos(angle)
            y = position[1] + inner_radius * sin(angle)
            vertices.append([x, y, 0])
            vertices.append([x, y, -height])
        
        # Inner hole faces (reversed winding)
        for i in range(sections):
            next_i = (i + 1) % sections
            h_idx = hole_base + 2*i
            h_next = hole_base + 2*next_i
            faces.append([h_next, h_idx, h_idx+1])
            faces.append([h_next, h_idx+1, h_next+1])
            faces.append([h_idx+1, h_next+1, hole_base+1])
            faces.append([h_next, h_idx, hole_base])
    
    return np.array(vertices), faces

def create_venting_slots():
    """Create venting slot holes"""
    vertices = []
    faces = []
    
    start_y = -15
    
    for i in range(VENT_COUNT):
        y_pos = start_y + i * VENT_SPACING
        
        # Create rectangular slot
        x1, x2 = -VENT_WIDTH/2, VENT_WIDTH/2
        y1, y2 = y_pos - VENT_HEIGHT/2, y_pos + VENT_HEIGHT/2
        z1 = PANEL_THICKNESS
        z2 = 0
        
        base = len(vertices)
        
        # 8 vertices for slot box
        vertices.extend([
            [x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1],
            [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]
        ])
        
        # Faces for the slot (as a cutout)
        # Top face
        faces.append([base, base+2, base+1])
        faces.append([base, base+3, base+2])
        # Bottom face
        faces.append([base+4, base+5, base+6])
        faces.append([base+4, base+6, base+7])
        # Side faces
        faces.append([base, base+1, base+5])
        faces.append([base, base+5, base+4])
        faces.append([base+1, base+2, base+6])
        faces.append([base+1, base+6, base+5])
        faces.append([base+2, base+3, base+7])
        faces.append([base+2, base+7, base+6])
        faces.append([base+3, base, base+4])
        faces.append([base+3, base+4, base+7])
    
    return np.array(vertices), faces

def main():
    print('Creating IBM z17 fan panel...')
    
    # Create panel with V-recess
    print('  Creating panel with V-recess...')
    pv, pf = create_panel_with_v_recess()
    
    # Add standoffs with holes
    print('  Adding standoffs...')
    offset = FAN_MOUNT_SPACING / 2
    positions = [
        [offset, offset],
        [offset, -offset],
        [-offset, offset],
        [-offset, -offset]
    ]
    
    for pos in positions:
        sv, sf = create_standoff_cylinder(pos, STANDOFF_HEIGHT, STANDOFF_DIAMETER/2, HOLE_DIAMETER/2)
        sf_offset = [[f[0]+len(pv), f[1]+len(pv), f[2]+len(pv)] for f in sf]
        pv = np.vstack([pv, sv])
        pf.extend(sf_offset)
    
    # Add venting slots
    print('  Adding venting slots...')
    vv, vf = create_venting_slots()
    vf_offset = [[f[0]+len(pv), f[1]+len(pv), f[2]+len(pv)] for f in vf]
    pv = np.vstack([pv, vv])
    pf.extend(vf_offset)
    
    # Create mesh
    print('  Creating mesh...')
    m = mesh.Mesh(np.zeros(len(pf), dtype=mesh.Mesh.dtype))
    for i, face in enumerate(pf):
        for j in range(3):
            m.vectors[i][j] = pv[face[j]]
    
    # Save
    m.save('ibm_z17_fan_panel.stl')
    print(f'Saved! Vertices: {len(pv)}, Faces: {len(pf)}')
    print(f'Panel: {PANEL_SIZE}mm x {PANEL_SIZE}mm with {CORNER_RADIUS}mm rounded corners')
    print(f'V-recess depth: {V_RECESS_DEPTH}mm')
    print(f'Venting: {VENT_COUNT} slots')
    print(f'Standoffs: 4x {STANDOFF_HEIGHT}mm tall with M{int(HOLE_DIAMETER)} holes')

if __name__ == '__main__':
    main()
