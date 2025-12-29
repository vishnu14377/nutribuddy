#!/usr/bin/env python3
"""
Backend API Testing for Uber Eats AI Search
Tests the critical search functionality with nutritional filtering accuracy.
"""

import requests
import json
import sys
import os
from typing import Dict, List, Any

# Get backend URL from frontend .env
def get_backend_url():
    """Get backend URL from frontend .env file."""
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception as e:
        print(f"Error reading frontend .env: {e}")
    return "http://localhost:8001"

BASE_URL = get_backend_url()
API_BASE = f"{BASE_URL}/api"

print(f"Testing backend at: {API_BASE}")

class UberEatsAPITester:
    """Test suite for Uber Eats AI Search API."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.results = {
            'passed': 0,
            'failed': 0,
            'errors': []
        }
    
    def log_result(self, test_name: str, passed: bool, message: str = ""):
        """Log test result."""
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
        if message:
            print(f"   {message}")
        
        if passed:
            self.results['passed'] += 1
        else:
            self.results['failed'] += 1
            self.results['errors'].append(f"{test_name}: {message}")
    
    def test_stats_endpoint(self) -> bool:
        """Test GET /api/stats endpoint."""
        print("\n=== Testing Stats Endpoint ===")
        try:
            response = self.session.get(f"{API_BASE}/stats")
            
            if response.status_code != 200:
                self.log_result("Stats API Response", False, f"Status code: {response.status_code}")
                return False
            
            data = response.json()
            
            # Check structure
            required_keys = ['database', 'vector_store', 'search_engine']
            for key in required_keys:
                if key not in data:
                    self.log_result("Stats API Structure", False, f"Missing key: {key}")
                    return False
            
            # Check database stats
            db_stats = data['database']
            recipe_count = db_stats.get('recipe_count', 0)
            
            if recipe_count < 100:
                self.log_result("Database Item Count", False, f"Only {recipe_count} items, expected ~150")
                return False
            
            self.log_result("Stats API Response", True, f"Found {recipe_count} items in database")
            
            # Check vector store
            vector_stats = data['vector_store']
            if 'total_vector_count' in vector_stats:
                vector_count = vector_stats['total_vector_count']
                self.log_result("Vector Store Count", True, f"Vector store has {vector_count} items")
            
            # Check search engine
            search_engine = data['search_engine']
            if 'OpenAI' in search_engine and 'GPT-4o' in search_engine:
                self.log_result("Search Engine Config", True, "Using OpenAI + GPT-4o")
            else:
                self.log_result("Search Engine Config", False, f"Unexpected engine: {search_engine}")
            
            return True
            
        except Exception as e:
            self.log_result("Stats API", False, f"Exception: {str(e)}")
            return False
    
    def test_get_recipes(self) -> bool:
        """Test GET /api/recipes endpoint."""
        print("\n=== Testing Get Recipes Endpoint ===")
        try:
            response = self.session.get(f"{API_BASE}/recipes?limit=10")
            
            if response.status_code != 200:
                self.log_result("Get Recipes API", False, f"Status code: {response.status_code}")
                return False
            
            recipes = response.json()
            
            if not isinstance(recipes, list):
                self.log_result("Get Recipes Format", False, "Response is not a list")
                return False
            
            if len(recipes) == 0:
                self.log_result("Get Recipes Data", False, "No recipes returned")
                return False
            
            # Check first recipe structure
            recipe = recipes[0]
            required_fields = ['id', 'name', 'estimated_protein', 'estimated_carbs', 'estimated_calories']
            
            for field in required_fields:
                if field not in recipe:
                    self.log_result("Recipe Structure", False, f"Missing field: {field}")
                    return False
            
            # Check for expected items
            recipe_names = [r['name'].lower() for r in recipes]
            expected_items = ['wings', 'pizza', 'chicken']
            found_items = []
            
            for expected in expected_items:
                for name in recipe_names:
                    if expected in name:
                        found_items.append(expected)
                        break
            
            self.log_result("Get Recipes API", True, f"Retrieved {len(recipes)} recipes")
            self.log_result("Expected Menu Items", len(found_items) > 0, f"Found: {', '.join(found_items)}")
            
            # Check nutrition values are reasonable
            nutrition_ok = True
            for recipe in recipes[:3]:  # Check first 3
                protein = recipe.get('estimated_protein', 0)
                carbs = recipe.get('estimated_carbs', 0)
                calories = recipe.get('estimated_calories', 0)
                
                if protein == 0 and carbs == 0 and calories == 0:
                    nutrition_ok = False
                    break
            
            self.log_result("Nutrition Data Quality", nutrition_ok, "Recipes have reasonable nutrition values")
            
            return True
            
        except Exception as e:
            self.log_result("Get Recipes API", False, f"Exception: {str(e)}")
            return False
    
    def test_search_high_protein_low_carb(self) -> bool:
        """Test critical search: high protein low carb with strict filtering."""
        print("\n=== Testing High Protein Low Carb Search ===")
        try:
            search_data = {
                "query": "high protein low carb",
                "filters": {}
            }
            
            response = self.session.post(f"{API_BASE}/search", json=search_data)
            
            if response.status_code != 200:
                self.log_result("High Protein Low Carb Search", False, f"Status code: {response.status_code}")
                print(f"Response: {response.text}")
                return False
            
            results = response.json()
            
            if not isinstance(results, list):
                self.log_result("Search Response Format", False, "Response is not a list")
                return False
            
            if len(results) == 0:
                self.log_result("Search Results Count", False, "No results returned")
                return False
            
            # CRITICAL TEST: Every result must have protein > carbs
            all_valid = True
            invalid_items = []
            
            for i, result in enumerate(results):
                recipe = result.get('recipe', {})
                protein = recipe.get('estimated_protein', 0) or 0
                carbs = recipe.get('estimated_carbs', 0) or 0
                name = recipe.get('name', 'Unknown')
                
                print(f"  {i+1}. {name}: {protein}g protein, {carbs}g carbs")
                
                if protein <= carbs:
                    all_valid = False
                    invalid_items.append(f"{name} ({protein}g protein ≤ {carbs}g carbs)")
            
            if not all_valid:
                self.log_result("Strict Nutritional Filtering", False, 
                              f"Items with protein ≤ carbs: {'; '.join(invalid_items)}")
                return False
            
            self.log_result("Strict Nutritional Filtering", True, 
                          f"All {len(results)} results have protein > carbs")
            
            # Check for Wings in top results (expected high protein, low carb item)
            top_names = [r['recipe']['name'].lower() for r in results[:3]]
            has_wings = any('wing' in name for name in top_names)
            
            self.log_result("Expected High-Protein Items", has_wings, 
                          "Wings found in top 3 results" if has_wings else "Wings not in top 3")
            
            # Check match explanations
            has_explanations = all('match_explanation' in result for result in results)
            self.log_result("Match Explanations", has_explanations, "All results have explanations")
            
            if has_explanations:
                # Check if explanations mention nutritional context
                nutritional_context = any(
                    any(term in result['match_explanation'].lower() 
                        for term in ['protein', 'carb', 'nutrition', 'keto', 'diet'])
                    for result in results[:3]
                )
                self.log_result("Nutritional Context in Explanations", nutritional_context,
                              "Explanations include nutritional reasoning")
            
            return True
            
        except Exception as e:
            self.log_result("High Protein Low Carb Search", False, f"Exception: {str(e)}")
            return False
    
    def test_search_protein_rich_meal(self) -> bool:
        """Test general protein query."""
        print("\n=== Testing Protein Rich Meal Search ===")
        try:
            search_data = {
                "query": "protein rich meal",
                "filters": {}
            }
            
            response = self.session.post(f"{API_BASE}/search", json=search_data)
            
            if response.status_code != 200:
                self.log_result("Protein Rich Search", False, f"Status code: {response.status_code}")
                return False
            
            results = response.json()
            
            if len(results) == 0:
                self.log_result("Protein Rich Results", False, "No results returned")
                return False
            
            # Check that results are sorted by protein content (high to low)
            protein_values = []
            for result in results:
                recipe = result.get('recipe', {})
                protein = recipe.get('estimated_protein', 0) or 0
                protein_values.append(protein)
                name = recipe.get('name', 'Unknown')
                print(f"  {name}: {protein}g protein")
            
            # Check if generally sorted by protein (allowing some flexibility for AI re-ranking)
            top_3_avg = sum(protein_values[:3]) / 3 if len(protein_values) >= 3 else 0
            bottom_3_avg = sum(protein_values[-3:]) / 3 if len(protein_values) >= 3 else 0
            
            protein_prioritized = top_3_avg >= bottom_3_avg
            self.log_result("Protein Prioritization", protein_prioritized,
                          f"Top 3 avg: {top_3_avg:.1f}g, Bottom 3 avg: {bottom_3_avg:.1f}g")
            
            # Check that top results have reasonable protein content
            high_protein_count = sum(1 for p in protein_values[:5] if p >= 25)
            self.log_result("High Protein Items in Top 5", high_protein_count >= 3,
                          f"{high_protein_count}/5 items have ≥25g protein")
            
            return True
            
        except Exception as e:
            self.log_result("Protein Rich Search", False, f"Exception: {str(e)}")
            return False
    
    def test_search_edge_cases(self) -> bool:
        """Test edge cases and error handling."""
        print("\n=== Testing Edge Cases ===")
        
        # Test empty query
        try:
            response = self.session.post(f"{API_BASE}/search", json={"query": "", "filters": {}})
            if response.status_code == 200:
                results = response.json()
                self.log_result("Empty Query Handling", isinstance(results, list),
                              f"Returns list with {len(results)} items")
            else:
                self.log_result("Empty Query Handling", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("Empty Query Handling", False, f"Exception: {str(e)}")
        
        # Test very specific query
        try:
            response = self.session.post(f"{API_BASE}/search", 
                                       json={"query": "buffalo wings with ranch", "filters": {}})
            if response.status_code == 200:
                results = response.json()
                self.log_result("Specific Query", len(results) > 0, f"Found {len(results)} results")
            else:
                self.log_result("Specific Query", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("Specific Query", False, f"Exception: {str(e)}")
        
        return True
    
    def run_all_tests(self):
        """Run all test suites."""
        print("🧪 Starting Uber Eats AI Search API Tests")
        print("=" * 50)
        
        # Test in order of importance
        self.test_stats_endpoint()
        self.test_get_recipes()
        self.test_search_high_protein_low_carb()  # CRITICAL TEST
        self.test_search_protein_rich_meal()
        self.test_search_edge_cases()
        
        # Summary
        print("\n" + "=" * 50)
        print("🏁 TEST SUMMARY")
        print(f"✅ Passed: {self.results['passed']}")
        print(f"❌ Failed: {self.results['failed']}")
        
        if self.results['errors']:
            print("\n🚨 FAILURES:")
            for error in self.results['errors']:
                print(f"  • {error}")
        
        return self.results['failed'] == 0


if __name__ == "__main__":
    tester = UberEatsAPITester()
    success = tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print(f"\n💥 {tester.results['failed']} test(s) failed!")
        sys.exit(1)