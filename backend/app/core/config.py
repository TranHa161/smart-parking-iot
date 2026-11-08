from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pydantic import Field


class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Parking IoT Backend"
    API_V1_STR: str = "/api"
    
    # Database: Mặc định SQLite aiosqlite cho môi trường dev nhanh, dễ chuyển sang PostgreSQL
    DATABASE_URL: str = "sqlite+aiosqlite:///./parking.db"
    
    # Redis (tùy chọn cho cache và distributed lock)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # MQTT Broker (kết nối với Kit STM32/ESP)
    MQTT_BROKER_HOST: str = "localhost"
    MQTT_BROKER_PORT: int = 1883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_KEEP_ALIVE: int = 60
    
    # Nghiệp vụ
    BOOKING_EXPIRATION_MINUTES: int = Field(15, gt=0)
    ENTRY_AUTHORIZATION_MINUTES: int = Field(15, gt=0)
    HOURLY_RATE: int = Field(10000, gt=0)  # 10.000 VNĐ / giờ
    
    CORS_ORIGINS: List[str] = ["*"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()

