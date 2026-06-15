from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://trading:password@db:5432/trading_db"
    fugle_api_key: str = ""
    force_poll: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
