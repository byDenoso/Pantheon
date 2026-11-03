"""Build the small original glTF ornament used by the public scene. No external assets."""
import json
import math
import struct
from pathlib import Path

positions, indices = [], []
for plane in range(3):
    offset = len(positions) // 3
    for i in range(65):
        angle = i / 64 * 2 * math.pi
        for j in range(9):
            section = j / 8 * 2 * math.pi
            p = [(1.15 + .008 * math.cos(section)) * math.cos(angle),
                 (1.15 + .008 * math.cos(section)) * math.sin(angle), .008 * math.sin(section)]
            if plane == 1:
                p = [p[0], p[2], p[1]]
            elif plane == 2:
                p = [p[2], p[1], p[0]]
            positions.extend(p)
    for i in range(64):
        for j in range(8):
            a = offset + i * 9 + j
            b = a + 9
            indices.extend([a, b, a + 1, b, b + 1, a + 1])
vertices = struct.pack(f'<{len(positions)}f', *positions)
triangles = struct.pack(f'<{len(indices)}H', *indices)
payload = vertices + triangles
model = {
    'asset': {'version': '2.0', 'generator': 'NEXO authored orbital lens · scripts/build-orbital-lens.py'},
    'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': 'Orbital lens'}],
    'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'material': 0}]}],
    'materials': [{'name': 'Cyan emissive', 'pbrMetallicRoughness': {
        'baseColorFactor': [.15, .75, .9, .75], 'metallicFactor': 0, 'roughnessFactor': 1},
        'emissiveFactor': [.09, .38, .5], 'alphaMode': 'BLEND', 'doubleSided': True,
        'extensions': {'KHR_materials_unlit': {}}}],
    'extensionsUsed': ['KHR_materials_unlit'],
    'buffers': [{'byteLength': len(payload)}],
    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(vertices), 'target': 34962},
                    {'buffer': 0, 'byteOffset': len(vertices), 'byteLength': len(triangles), 'target': 34963}],
    'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': len(positions) // 3,
                   'type': 'VEC3', 'min': [-1.158] * 3, 'max': [1.158] * 3},
                  {'bufferView': 1, 'componentType': 5123, 'count': len(indices), 'type': 'SCALAR'}],
}
destination = Path(__file__).resolve().parents[1] / 'src/experience/assets/orbital-lens.glb'
document = json.dumps(model, separators=(',', ':')).encode()
document += b' ' * (-len(document) % 4)
payload += b'\x00' * (-len(payload) % 4)
chunks = struct.pack('<II', len(document), 0x4e4f534a) + document
chunks += struct.pack('<II', len(payload), 0x004e4942) + payload
destination.write_bytes(struct.pack('<III', 0x46546c67, 2, 12 + len(chunks)) + chunks)
print(f'{destination.name}: {destination.stat().st_size} bytes')
