"""
Multi-person temporal tracker abstraction.
Provides continuous ID persistence across camera frames.
"""

from typing import List, Dict, Any, Tuple
import numpy as np


class SimpleCentroidTracker:
    """
    Lightweight fallback centroid & IOU tracker for testing or lightweight hardware.
    """

    def __init__(self, max_disappeared: int = 30, max_distance: float = 120.0):
        self.next_object_id = 1
        self.objects: Dict[int, Tuple[float, float]] = {}
        self.disappeared: Dict[int, int] = {}
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid: Tuple[float, float]) -> int:
        object_id = self.next_object_id
        self.objects[object_id] = centroid
        self.disappeared[object_id] = 0
        self.next_object_id += 1
        return object_id

    def deregister(self, object_id: int):
        if object_id in self.objects:
            del self.objects[object_id]
        if object_id in self.disappeared:
            del self.disappeared[object_id]

    def update(self, rects: List[Tuple[float, float, float, float]]) -> List[int]:
        """
        Updates tracked object IDs for given bounding boxes.
        
        Returns:
            List of tracking IDs matching the input rects order.
        """
        if len(rects) == 0:
            for object_id in list(self.disappeared.keys()):
                self.disappeared[object_id] += 1
                if self.disappeared[object_id] > self.max_disappeared:
                    self.deregister(object_id)
            return []

        input_centroids = []
        for (x1, y1, x2, y2) in rects:
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            input_centroids.append((cx, cy))

        if len(self.objects) == 0:
            ids = []
            for c in input_centroids:
                ids.append(self.register(c))
            return ids

        object_ids = list(self.objects.keys())
        object_centroids = list(self.objects.values())

        # Compute pairwise euclidean distances
        distances = []
        for ic in input_centroids:
            row = []
            for oc in object_centroids:
                d = np.hypot(ic[0] - oc[0], ic[1] - oc[1])
                row.append(d)
            distances.append(row)

        assigned_ids = [None] * len(input_centroids)
        used_obj_indices = set()
        used_input_indices = set()

        # Greedy closest match
        flat_pairs = []
        for i in range(len(input_centroids)):
            for j in range(len(object_centroids)):
                flat_pairs.append((distances[i][j], i, j))
        flat_pairs.sort(key=lambda x: x[0])

        for dist, i, j in flat_pairs:
            if i in used_input_indices or j in used_obj_indices:
                continue
            if dist > self.max_distance:
                continue
            assigned_ids[i] = object_ids[j]
            self.objects[object_ids[j]] = input_centroids[i]
            self.disappeared[object_ids[j]] = 0
            used_input_indices.add(i)
            used_obj_indices.add(j)

        # Unmatched inputs get new IDs
        for i in range(len(input_centroids)):
            if assigned_ids[i] is None:
                assigned_ids[i] = self.register(input_centroids[i])

        # Increment disappeared for unmatched existing objects
        for j, oid in enumerate(object_ids):
            if j not in used_obj_indices:
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.deregister(oid)

        return assigned_ids
