"""
Energy Monitoring Service.
Tracks lab electrical load, power factors, and consumption analytics.
"""

import time
from typing import Dict, Any, List
from backend.services.esp32_client import ESP32Client
from backend.models.schemas import EnergyMetrics


class EnergyService:
    """
    Coordinates energy telemetry and historical tracking.
    """

    def __init__(self, esp32_client: ESP32Client):
        self.esp32_client = esp32_client
        self.history: List[Dict[str, Any]] = []
        self.max_history_entries: int = 120

    def get_current_metrics(self) -> EnergyMetrics:
        """Fetch latest reading from ESP32 or simulated sensor."""
        metrics = self.esp32_client.read_pzem_energy()
        
        # Keep brief history for charts
        entry = metrics.to_dict()
        self.history.append(entry)
        if len(self.history) > self.max_history_entries:
            self.history.pop(0)

        return metrics

    def get_history(self) -> List[Dict[str, Any]]:
        """Return historical readings for dashboard charts."""
        return self.history
