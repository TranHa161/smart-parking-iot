from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pydantic import AliasChoices, Field, field_validator


class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Parking IoT Backend"
    API_V1_STR: str = "/api"
    
    # Database: Mặc định SQLite aiosqlite cho môi trường dev nhanh, dễ chuyển sang PostgreSQL
    DATABASE_URL: str = "sqlite+aiosqlite:///./parking.db"
    
    # Redis (tùy chọn cho cache và distributed lock)
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # MQTT Broker (hỗ trợ cả biến môi trường của docker-compose.yml root và backend/.env)
    MQTT_BROKER_HOST: str = Field(
        "localhost",
        validation_alias=AliasChoices("MQTT_BROKER_HOST", "MQTT_HOST", "MQTT_BROKER"),
    )
    MQTT_BROKER_PORT: int = Field(
        1883,
        validation_alias=AliasChoices("MQTT_BROKER_PORT", "MQTT_PORT"),
    )
    MQTT_USERNAME: str = Field(
        "",
        validation_alias=AliasChoices("MQTT_USERNAME", "MQTT_USER"),
    )
    MQTT_PASSWORD: str = Field(
        "",
        validation_alias=AliasChoices("MQTT_PASSWORD", "MQTT_PASS"),
    )
    MQTT_KEEP_ALIVE: int = 60
    
    # Nghiệp vụ
    BOOKING_EXPIRATION_MINUTES: int = Field(15, gt=0)
    ENTRY_AUTHORIZATION_MINUTES: int = Field(15, gt=0)
    HOURLY_RATE: int = Field(10000, gt=0)  # 10.000 VNĐ / giờ
    
    CORS_ORIGINS: List[str] = ["*"]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def ensure_async_postgres_scheme(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return "postgresql+asyncpg://" + v[len("postgres://"):]
            if v.startswith("postgresql://"):
                return "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()


