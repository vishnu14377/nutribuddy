"""Main FastAPI application with SQLite database."""

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

# Initialize Vector Service
vector_service = VectorService(
    pinecone_api_key=os.environ['PINECONE_API_KEY'],
    google_api_key=os.environ['GOOGLE_API_KEY']
)

# Create FastAPI app
app = FastAPI(
    title="Uber Eats AI Search",
    description="AI-powered food discovery for Uber Eats",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with Google API key for enhanced AI search
recipe_router = create_recipe_router(
    db_service, 
    vector_service,
    google_api_key=os.environ.get('GOOGLE_API_KEY')
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
