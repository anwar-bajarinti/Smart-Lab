"""
Data schemas and type representations for the Smart Lab Backend API.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any


@dataclass
class ApplianceState:
    id: str
    type: str  # "relay" or "dimmer"
    state: bool  # True=ON, False=OFF
    speed: Optional[int] = None  # 0-100 for dimmer
    gpio: Optional[int] = None
    relay_id: Optional[int] = None


@dataclass
class ZoneInfo:
    zone_id: str
    name: str
    row: int
    col: int
    occupied: bool = False
    occupancy_state: str = "EMPTY"
    light_state: str = "OFF"
    fan_state: str = "OFF"
    fan_speed: int = 0
    mode: str = "AUTO"
    manual_override: bool = False
    occupant_count: int = 0
    occupant_ids: List[int] = field(default_factory=list)
    appliances: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class EnergyMetrics:
    voltage: Optional[float] = None       # Volts (V)
    current: Optional[float] = None       # Amperes (A)
    power: Optional[float] = None         # Watts (W)
    energy: Optional[float] = None        # Kilowatt-hours (kWh)
    frequency: Optional[float] = None     # Hertz (Hz)
    power_factor: Optional[float] = None  # 0.00 - 1.00
    is_live_hardware: bool = False
    status: str = "OFFLINE"
    timestamp: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
