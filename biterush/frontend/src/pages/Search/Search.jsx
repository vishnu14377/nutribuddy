import React, { useEffect, useState, useContext } from 'react'
import './Search.css'
import api, { BASE_IMAGE_URL } from '../../services/api.js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import { toast } from 'react-toastify'

const Search = () => {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const navigate = useNavigate()
  const { addToCart, token, currency } = useContext(StoreContext)
  const [results, setResults] = useState({ food: [], restaurants: [] })
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState('all')

  useEffect(() => {
    if (!q) return
    setLoading(true)
    api.get(`/search?q=${encodeURIComponent(q)}&type=${type}`)
      .then(res => setResults(res.data.data || { food: [], restaurants: [] }))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [q, type])

  const totalResults = results.food.length + results.restaurants.length

  return (
    <div className="search-page">
      <div className="search-header">
        <h1>Search Results for <span>"{q}"</span></h1>
        <p>{totalResults} result{totalResults !== 1 ? 's' : ''} found</p>
        <div className="type-tabs">
          {['all','food','restaurant'].map(t => (
            <button key={t} className={`type-tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
              {t === 'all' ? '🔍 All' : t === 'food' ? '🍕 Food' : '🏪 Restaurants'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="search-loading"><div className="spinner" /></div>
      ) : totalResults === 0 ? (
        <div className="search-empty"><span>😕</span><p>No results found for "{q}"</p></div>
      ) : (
        <>
          {results.restaurants.length > 0 && (type === 'all' || type === 'restaurant') && (
            <section className="result-section">
              <h2>🏪 Restaurants ({results.restaurants.length})</h2>
              <div className="rest-results">
                {results.restaurants.map(r => (
                  <div key={r._id} className="rest-result-card" onClick={() => navigate(`/restaurant/${r._id}`)}>
                    {r.image ? <img src={BASE_IMAGE_URL + r.image} alt={r.name} /> : <div className="rest-img-ph">🍽️</div>}
                    <div>
                      <h4>{r.name}</h4>
                      <p>{r.cuisine?.join(' · ')}</p>
                      <span className="meta">⭐ {r.rating?.toFixed(1)} · 🕐 {r.deliveryTime}min</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {results.food.length > 0 && (type === 'all' || type === 'food') && (
            <section className="result-section">
              <h2>🍕 Food Items ({results.food.length})</h2>
              <div className="food-results">
                {results.food.map(item => (
                  <div key={item._id} className="food-result-card">
                    <img src={BASE_IMAGE_URL + item.image} alt={item.name} />
                    <div className="food-result-info">
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      {item.restaurantId && <span className="from-rest">from {item.restaurantId.name}</span>}
                      <div className="food-result-footer">
                        <span className="price">{currency}{item.price}</span>
                        <button className="add-btn" onClick={() => { if (!token) { toast.info('Login to add'); return; } addToCart(item._id) }}>+ Add</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default Search
