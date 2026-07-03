from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VolumeAlert(Base):
    __tablename__ = "volume_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    current_volume: Mapped[int] = mapped_column(Integer, nullable=False)
    average_volume: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    ratio: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    detected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
