# NIMA - Nutritional Intelligence Menu Assistant

AI-powered meal discovery platform that helps users find perfect dishes aligned with their dietary goals and preferences.

## Features

- **Natural Language Search**: Search for meals using plain English
- **Smart Nutrition Matching**: AI-powered recipe matching based on nutritional goals
- **Vector Search**: Semantic search using Google Gemini embeddings and Pinecone
- **Nutritional Breakdown**: Automatic calculation of calories, protein, carbs, and fat
- **Personalized Explanations**: Each match includes why it fits your search

## Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: MongoDB (recipe storage)
- **Vector DB**: Pinecone (semantic search)
- **AI/ML**: Google Gemini (embeddings + text generation)
- **Language**: Python 3.11+

### Frontend
- **Framework**: React 19
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI
- **HTTP Client**: Axios

## Project Structure

```
/app/
├── backend/
│   ├── models/          # Pydantic models
│   ├── services/        # Business logic
│   ├── routes/          # API endpoints
│   ├── utils/           # Utilities
│   ├── server.py        # FastAPI app
│   └── .env             # Environment variables
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── App.js       # Main app
│   │   └── index.js     # Entry point
│   └── package.json
└── .vscode/             # VS Code settings
```

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB
- Google Gemini API key
- Pinecone API key

### Backend Setup

1. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Configure environment variables in `.env`:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=nima_database
GOOGLE_API_KEY=your_google_api_key
PINECONE_API_KEY=your_pinecone_api_key
```

3. Run the server:
```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
yarn install
```

2. Configure environment in `.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

3. Start the dev server:
```bash
yarn start
```

## API Endpoints

- `GET /api/` - Health check
- `POST /api/recipes/upload` - Initialize recipe database
- `POST /api/search` - Search recipes with natural language
- `GET /api/recipes` - Get all recipes

## Development

### Code Style
- **Python**: Black formatter, type hints, docstrings
- **JavaScript**: Prettier, JSDoc comments, functional components

### VS Code Extensions
Recommended extensions are listed in `.vscode/extensions.json`

## License

MIT License
