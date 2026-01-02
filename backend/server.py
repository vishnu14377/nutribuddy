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

db_service = DatabaseService(str(ROOT_DIR / 'data' / 'ubereats.db'))

openai_api_key = os.environ.get('OPENAI_API_KEY')
pinecone_api_key = os.environ.get('PINECONE_API_KEY')

if not openai_api_key or not pinecone_api_key:
    raise ValueError("OPENAI_API_KEY and PINECONE_API_KEY required")

vector_service = VectorService(pinecone_api_key=pinecone_api_key, openai_api_key=openai_api_key)

app = FastAPI(title="Nutribuddy", description="AI-powered nutritional food search", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(create_recipe_router(db_service, vector_service, openai_api_key=openai_api_key))

@app.on_event("shutdown")
async def shutdown():
    db_service.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
