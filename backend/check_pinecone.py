"""Check available Pinecone indexes."""
from pinecone import Pinecone
import os
from dotenv import load_dotenv

load_dotenv('.env')

pc = Pinecone(api_key=os.environ.get('PINECONE_API_KEY'))

print("Available Pinecone indexes:")
indexes = pc.list_indexes()
for idx in indexes:
    print(f"  - {idx.name}")
    print(f"    Dimension: {idx.dimension}")
    print(f"    Metric: {idx.metric}")
    print(f"    Status: {idx.status.state}")
    print()

if not indexes:
    print("No indexes found!")
