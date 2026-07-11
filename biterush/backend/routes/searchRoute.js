import express from 'express';
import { searchLimiter } from '../middleware/rateLimiter.js';
import { search, getSearchSuggestions } from '../controllers/searchController.js';

const searchRouter = express.Router();

searchRouter.get('/',            searchLimiter, search);
searchRouter.get('/suggestions', searchLimiter, getSearchSuggestions);

export default searchRouter;
