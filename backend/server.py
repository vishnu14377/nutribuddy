"""Main FastAPI application with SQLite database and OpenAI integration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path

from routes.recipe_routes import create_recipe_router
from services.vector_service import VectorService
from services.database_service import DatabaseService

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize SQLite Database
db_path = ROOT_DIR / 'data' / 'ubereats.db'
db_service = DatabaseService(str(db_path))

# Get API keys
openai_api_key = os.environ.get('OPENAI_API_KEY')
pinecone_api_key = os.environ.get('PINECONE_API_KEY')

if not openai_api_key:
    logger.error("OPENAI_API_KEY not found in environment!")
    raise ValueError("OPENAI_API_KEY is required")

if not pinecone_api_key:
    logger.error("PINECONE_API_KEY not found in environment!")
    raise ValueError("PINECONE_API_KEY is required")

# Initialize Vector Service with OpenAI
vector_service = VectorService(
    pinecone_api_key=pinecone_api_key,
    openai_api_key=openai_api_key
)

# Create FastAPI app
app = FastAPI(
    title="Uber Eats AI Search",
    description="AI-powered food discovery for Uber Eats using OpenAI",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with OpenAI API key for enhanced AI search
recipe_router = create_recipe_router(
    db_service, 
    vector_service,
    openai_api_key=openai_api_key
)
app.include_router(recipe_router)


@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown."""
    db_service.close()
    logger.info("Database connection closed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
