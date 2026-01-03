"""Sync database recipes to vector store."""
import os
from dotenv import load_dotenv
from services.database_service import DatabaseService
from services.vector_service import VectorService
from models.recipe import Recipe
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv('.env')

# Initialize services
db_service = DatabaseService('./data/nutribuddy.db')
vector_service = VectorService(
    pinecone_api_key=os.environ.get('PINECONE_API_KEY'),
    openai_api_key=os.environ.get('OPENAI_API_KEY')
)

# Get all recipes from database
recipes_data = db_service.get_all_recipes(limit=1000)
logger.info(f"Found {len(recipes_data)} recipes in database")

if not recipes_data:
    logger.error("No recipes found in database!")
    exit(1)

# Convert to Recipe objects
recipes = [Recipe(**r) for r in recipes_data]

# Clear existing vectors in the index
logger.info("Clearing existing vectors from index...")
vector_service.clear_index()

# Store recipes in vector store
logger.info(f"Storing {len(recipes)} recipes in vector store...")
stored = vector_service.store_recipes_batch(recipes, batch_size=20)

logger.info(f"✅ Successfully synced {stored} recipes to vector store!")

# Verify
stats = vector_service.get_index_stats()
logger.info(f"Vector store now has {stats['total_vectors']} vectors")

db_service.close()
