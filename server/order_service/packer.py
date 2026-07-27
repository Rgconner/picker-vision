"""packer.py — fallback bin-packing heuristic for Bob's Tiny Treasures.

This is a pure function module — no database imports, no side effects.
The caller is responsible for persisting the returned records.

Algorithm
---------
1. Sort (OrderLine, Product) pairs by product weight descending (heaviest first).
2. Expand each line into individual item units (qty=3 → three item slots).
3. Greedy bin-pack items into totes respecting the weight cap.
4. Within each tote, group items into layers of at most MAX_ITEMS_PER_LAYER.
5. Return a list of ToteSpec dataclasses that the endpoint handler converts to
   ORM records.
"""

from __future__ import annotations
from dataclasses import dataclass, field

TOTE_WEIGHT_CAP_KG: float = 0.1
MAX_ITEMS_PER_LAYER: int  = 2


# ---------------------------------------------------------------------------
# Plain data containers (no ORM dependency)
# ---------------------------------------------------------------------------

@dataclass
class ItemSlot:
    """One unit of an OrderLine item to be placed in a tote."""
    line_id:  str
    barcode:  str
    name:     str
    weight_kg: float


@dataclass
class LayerSpec:
    """One layer of items within a tote (max MAX_ITEMS_PER_LAYER items)."""
    layer_seq: int
    items: list[ItemSlot] = field(default_factory=list)


@dataclass
class ToteSpec:
    """One physical tote with its layers and total assigned weight."""
    tote_seq:          int
    assigned_weight_kg: float
    layers:            list[LayerSpec] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def plan_packing(
    lines_and_products: list[tuple],  # list of (OrderLine-like, Product-like)
    tote_weight_cap: float = TOTE_WEIGHT_CAP_KG,
    max_items_per_layer: int = MAX_ITEMS_PER_LAYER,
) -> list[ToteSpec]:
    """Compute a tote packing plan without touching the database.

    Parameters
    ----------
    lines_and_products:
        Sequence of ``(line, product)`` pairs.  Each *line* must expose
        ``.id``, ``.quantity``, and each *product* must expose
        ``.barcode``, ``.description``, and ``.weight_kg``.
    tote_weight_cap:
        Maximum net weight per tote in kg (default 0.1 kg / 100 g).
    max_items_per_layer:
        Maximum number of item units in a single verifiable layer (default 2).

    Returns
    -------
    list[ToteSpec]
        Ordered list of totes.  The list is non-empty even for zero-weight
        items so the caller always gets at least one tote.
    """
    # Step 1: sort pairs heaviest-first (stable sort is fine)
    pairs = sorted(lines_and_products, key=lambda lp: lp[1].weight_kg, reverse=True)

    # Step 2: expand to individual item slots
    slots: list[ItemSlot] = []
    for line, product in pairs:
        for _ in range(line.quantity):
            slots.append(ItemSlot(
                line_id   = line.id,
                barcode   = product.barcode,
                name      = product.description,
                weight_kg = product.weight_kg,
            ))

    if not slots:
        # Degenerate case — return one empty tote so the caller still gets a plan.
        return [ToteSpec(tote_seq=1, assigned_weight_kg=0.0, layers=[
            LayerSpec(layer_seq=1, items=[]),
        ])]

    # Step 3: greedy bin-pack into totes
    totes: list[list[ItemSlot]] = []
    current_tote: list[ItemSlot] = []
    current_weight: float = 0.0

    for slot in slots:
        if current_tote and current_weight + slot.weight_kg > tote_weight_cap:
            totes.append(current_tote)
            current_tote = []
            current_weight = 0.0
        current_tote.append(slot)
        current_weight += slot.weight_kg

    if current_tote:
        totes.append(current_tote)

    # Step 4: assign layers within each tote
    result: list[ToteSpec] = []
    for tote_idx, tote_items in enumerate(totes):
        assigned_weight = sum(s.weight_kg for s in tote_items)
        layers: list[LayerSpec] = []
        for chunk_start in range(0, len(tote_items), max_items_per_layer):
            chunk = tote_items[chunk_start: chunk_start + max_items_per_layer]
            layers.append(LayerSpec(
                layer_seq = len(layers) + 1,
                items     = chunk,
            ))
        result.append(ToteSpec(
            tote_seq           = tote_idx + 1,
            assigned_weight_kg = assigned_weight,
            layers             = layers,
        ))

    return result
