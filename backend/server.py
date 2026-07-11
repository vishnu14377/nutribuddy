"""Nutribuddy API - AI-powered nutritional food search."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path

from routes.recipe_routes import create_recipe_router
from services.vector_service import VectorService
from services.database_service import DatabaseService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

db_service = DatabaseService(str(ROOT_DIR / 'data' / 'nutribuddy.db'))

openai_api_key = os.environ.get('OPENAI_API_KEY')
pinecone_api_key = os.environ.get('PINECONE_API_KEY')

if not openai_api_key or not pinecone_api_key:
    raise ValueError("OPENAI_API_KEY and PINECONE_API_KEY required")

vector_service = VectorService(pinecone_api_key=pinecone_api_key, openai_api_key=openai_api_key)

app = FastAPI(title="Nutribuddy", description="AI-powered nutritional food search", version="1.0.0")

_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(create_recipe_router(db_service, vector_service, openai_api_key=openai_api_key))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "nutribuddy-ai", "db_count": db_service.get_count()}


@app.on_event("shutdown")
async def shutdown():
    db_service.close()
