"""Unit tests for packer.py — pure fallback bin-packing heuristic.

Tests cover:
  - Single-tote order (all items fit within the 100 g cap)
  - Multi-tote split (items overflow into a second tote)
  - Layer assignment (max 2 items per layer)
  - Weight-cap boundary (exactly at the cap fits; one gram over spills)
  - Empty input produces one empty tote
  - Ordering: heaviest items first (stable base layers)
"""

import sys
import pathlib

# Make packer.py importable without installing the package.
# tests/ sits at picker-vision/tests/; order_service is at picker-vision/server/order_service/
_SERVICE_ROOT = pathlib.Path(__file__).resolve().parent.parent / "server" / "order_service"
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from packer import plan_packing, TOTE_WEIGHT_CAP_KG, MAX_ITEMS_PER_LAYER


# ---------------------------------------------------------------------------
# Minimal stubs for OrderLine and Product
# ---------------------------------------------------------------------------

class FakeLine:
    def __init__(self, line_id: str, qty: int):
        self.id       = line_id
        self.quantity = qty


class FakeProduct:
    def __init__(self, barcode: str, description: str, weight_kg: float):
        self.barcode     = barcode
        self.description = description
        self.weight_kg   = weight_kg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_pair(line_id: str, qty: int, barcode: str, desc: str, weight_kg: float):
    return FakeLine(line_id, qty), FakeProduct(barcode, desc, weight_kg)


def total_items_in_plan(totes):
    return sum(
        sum(len(layer.items) for layer in tote.layers)
        for tote in totes
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSingleTote:
    """All items fit within a single 100 g tote."""

    def test_single_item(self):
        pairs = [make_pair("L1", 1, "BTT-001", "Gem", 0.010)]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        assert total_items_in_plan(totes) == 1

    def test_three_items_fit(self):
        # 3×8g = 24 g — well under cap
        pairs = [make_pair("L1", 3, "BTT-001", "Goblin Gem", 0.008)]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        assert total_items_in_plan(totes) == 3

    def test_mixed_items_fit(self):
        # 10 + 22 + 8 = 40 g — under cap
        pairs = [
            make_pair("L1", 1, "BTT-00103", "Ruby",   0.010),
            make_pair("L2", 1, "BTT-00201", "Prism",  0.022),
            make_pair("L3", 1, "BTT-00101", "Goblin", 0.008),
        ]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        assert total_items_in_plan(totes) == 3


class TestMultiToteSplit:
    """Items must be split across totes when the weight cap is exceeded."""

    def test_two_heavy_items_split(self):
        # Two 60 g items — each needs its own tote (total 120 g > 100 g cap)
        pairs = [
            make_pair("L1", 1, "BTT-001", "Heavy A", 0.060),
            make_pair("L2", 1, "BTT-002", "Heavy B", 0.060),
        ]
        totes = plan_packing(pairs)
        assert len(totes) == 2
        assert total_items_in_plan(totes) == 2

    def test_qty_overflow_to_second_tote(self):
        # qty=5 × 25 g = 125 g → 4 items (100 g) in tote 1, 1 item in tote 2
        pairs = [make_pair("L1", 5, "BTT-001", "Cube", 0.025)]
        totes = plan_packing(pairs)
        assert len(totes) == 2
        tote1_items = total_items_in_plan([totes[0]])
        tote2_items = total_items_in_plan([totes[1]])
        assert tote1_items == 4
        assert tote2_items == 1

    def test_tote_seq_is_1_based(self):
        pairs = [
            make_pair("L1", 1, "BTT-001", "Heavy A", 0.060),
            make_pair("L2", 1, "BTT-002", "Heavy B", 0.060),
        ]
        totes = plan_packing(pairs)
        seqs = [t.tote_seq for t in totes]
        assert seqs == [1, 2]


class TestLayerAssignment:
    """Items within a tote are grouped into layers of max 2."""

    def test_two_items_one_layer(self):
        pairs = [
            make_pair("L1", 1, "BTT-001", "Item A", 0.020),
            make_pair("L2", 1, "BTT-002", "Item B", 0.020),
        ]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        assert len(totes[0].layers) == 1
        assert len(totes[0].layers[0].items) == 2

    def test_three_items_two_layers(self):
        # 3 items → layer 1: [item, item], layer 2: [item]
        pairs = [make_pair("L1", 3, "BTT-001", "Item", 0.020)]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        layers = totes[0].layers
        assert len(layers) == 2
        assert len(layers[0].items) == 2
        assert len(layers[1].items) == 1

    def test_four_items_two_layers(self):
        pairs = [make_pair("L1", 4, "BTT-001", "Item", 0.020)]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        layers = totes[0].layers
        assert len(layers) == 2
        assert all(len(l.items) == 2 for l in layers)

    def test_layer_seq_is_1_based(self):
        pairs = [make_pair("L1", 4, "BTT-001", "Item", 0.010)]
        totes = plan_packing(pairs)
        seqs = [l.layer_seq for l in totes[0].layers]
        assert seqs == [1, 2]

    def test_max_items_per_layer_respected(self):
        # 10 items — should produce exactly 5 layers of 2
        pairs = [make_pair("L1", 10, "BTT-001", "Item", 0.009)]
        totes = plan_packing(pairs)
        for tote in totes:
            for layer in tote.layers:
                assert len(layer.items) <= MAX_ITEMS_PER_LAYER


class TestWeightCapBoundary:
    """Items exactly at the cap fit; going one gram over spills to a new tote."""

    def test_exactly_at_cap_single_tote(self):
        # 4 × 25 g = 100 g — exactly at cap
        pairs = [make_pair("L1", 4, "BTT-001", "Cube", 0.025)]
        totes = plan_packing(pairs)
        assert len(totes) == 1
        assert abs(totes[0].assigned_weight_kg - 0.1) < 1e-9

    def test_one_gram_over_spills(self):
        # 4 × 25 g + 1 × 1 g → tote 1 full at 100 g, tote 2 gets the 1 g item
        pairs = [
            make_pair("L1", 4, "BTT-001", "Cube",    0.025),
            make_pair("L2", 1, "BTT-002", "Pebble",  0.001),
        ]
        totes = plan_packing(pairs)
        assert len(totes) == 2
        assert abs(totes[0].assigned_weight_kg - 0.1) < 1e-9
        assert abs(totes[1].assigned_weight_kg - 0.001) < 1e-9

    def test_assigned_weight_matches_items(self):
        pairs = [
            make_pair("L1", 2, "BTT-001", "Ruby",   0.010),
            make_pair("L2", 1, "BTT-002", "Prism",  0.022),
        ]
        totes = plan_packing(pairs)
        expected = 2 * 0.010 + 1 * 0.022
        assert abs(totes[0].assigned_weight_kg - expected) < 1e-9


class TestHeaviestFirst:
    """Heaviest items should land in tote 1 (stable greedy sort)."""

    def test_heavy_item_goes_to_tote_1(self):
        # L1 (50 g) should sort before L2 (8 g) so tote 1 has the heavy item
        pairs = [
            make_pair("L1", 1, "BTT-003", "Light", 0.008),
            make_pair("L2", 1, "BTT-001", "Heavy", 0.050),
        ]
        totes = plan_packing(pairs)
        # Both fit in one tote (58 g < 100 g)
        assert len(totes) == 1
        # First item in first layer should be the heaviest (0.050)
        first_item = totes[0].layers[0].items[0]
        assert first_item.barcode == "BTT-001"


class TestEmptyInput:
    """Empty input returns one empty tote."""

    def test_no_pairs(self):
        totes = plan_packing([])
        assert len(totes) == 1
        assert totes[0].tote_seq == 1
        assert totes[0].assigned_weight_kg == 0.0


class TestCustomCap:
    """Custom tote_weight_cap and max_items_per_layer overrides are respected."""

    def test_custom_weight_cap(self):
        # 3 × 25 g with cap=50 g → tote 1: 2 items (50 g), tote 2: 1 item (25 g)
        pairs = [make_pair("L1", 3, "BTT-001", "Cube", 0.025)]
        totes = plan_packing(pairs, tote_weight_cap=0.05)
        assert len(totes) == 2

    def test_custom_max_items_per_layer(self):
        # 4 items with max 1 per layer → 4 layers
        pairs = [make_pair("L1", 4, "BTT-001", "Item", 0.010)]
        totes = plan_packing(pairs, max_items_per_layer=1)
        assert len(totes[0].layers) == 4
        for layer in totes[0].layers:
            assert len(layer.items) == 1
