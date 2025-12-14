# Uber Eats AI Search

AI-powered food discovery platform with Uber Eats theme. Search for meals using natural language and get personalized recommendations based on your dietary goals.

## 🚀 Quick Start

### VS Code (Recommended)

1. Open the project in VS Code
2. Install recommended extensions (VS Code will prompt you)
3. Run **Full Stack: Start All** task (`Ctrl+Shift+B`)
4. Open http://localhost:3000

### Manual Setup

#### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

#### Frontend
```bash
cd frontend
yarn install
yarn start
```

## 🗄️ Database

This app uses **SQLite** for simplicity and portability. The database file is stored at:
```
backend/data/ubereats.db
```

### Database Schema

```sql
CREATE TABLE recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ingredients TEXT NOT NULL,  -- JSON array
    cooking_method TEXT,
    cuisine_type TEXT,
    cooking_time TEXT,
    spice_level TEXT,
    dietary_tags TEXT,          -- JSON array
    estimated_calories INTEGER,
    estimated_protein REAL,
    estimated_carbs REAL,
    estimated_fat REAL,
    description TEXT,
    image_url TEXT,
    restaurant_name TEXT,
    delivery_time TEXT,
    rating REAL,
    price REAL
);
```

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI
- **Database**: SQLite (lightweight, file-based)
- **Vector DB**: Pinecone (semantic search)
- **AI/ML**: Google Gemini (embeddings)
- **Language**: Python 3.11+

### Frontend
- **Framework**: React 19
- **Styling**: Tailwind CSS (Uber Eats theme)
- **UI Components**: Shadcn UI
- **HTTP Client**: Axios

## 📁 Project Structure

```
/app/
├── .vscode/              # VS Code configuration
│   ├── launch.json       # Debug configurations
│   ├── tasks.json        # Build tasks
│   ├── settings.json     # Editor settings
│   └── extensions.json   # Recommended extensions
├── backend/
│   ├── data/             # SQLite database
│   ├── models/           # Pydantic models
│   ├── services/         # Business logic
│   ├── routes/           # API endpoints
│   ├── utils/            # Utilities
│   ├── server.py         # FastAPI app
│   └── .env              # Environment variables
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── App.js        # Main app
│   │   └── index.js      # Entry point
│   └── package.json
└── README.md
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/` | Health check |
| POST | `/api/recipes/upload` | Initialize menu database |
| POST | `/api/search` | AI-powered recipe search |
| GET | `/api/recipes` | Get all recipes |

### Search Example

```bash
curl -X POST http://localhost:8001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "high protein low carb dinner"}'
```

## 🎨 Uber Eats Theme

The app uses Uber Eats brand colors:
- **Primary Green**: `#06C167`
- **Black**: `#000000`
- **White**: `#FFFFFF`
- **Gray Scale**: Various shades for UI elements

## 🧪 VS Code Debugging

1. Set breakpoints in your code
2. Press `F5` or use the Debug panel
3. Select "Python: FastAPI Backend" for backend debugging
4. Select "Chrome: Frontend" for frontend debugging
5. Use "Full Stack" compound to debug both simultaneously

## 📝 Environment Variables

### Backend (.env)
```env
DB_PATH=./data/ubereats.db
GOOGLE_API_KEY=your_google_api_key
PINECONE_API_KEY=your_pinecone_api_key
CORS_ORIGINS=*
```

### Frontend (.env)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

## 📦 VS Code Tasks

Access via `Ctrl+Shift+P` > "Tasks: Run Task":

- **Full Stack: Start All** - Start both servers
- **Backend: Run Server** - Start FastAPI
- **Frontend: Start Dev Server** - Start React
- **Database: Initialize Menu** - Load recipes

## 🙋‍♂️ Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and tests
5. Submit a pull request

## 📄 License

MIT License
