import React, { useEffect, useState } from 'react'
import './Restaurants.css'
import api, { BASE_IMAGE_URL } from '../../services/api.js'
import { useNavigate } from 'react-router-dom'

const CUISINES = ['All', 'Indian', 'Chinese', 'Italian', 'Mexican', 'Fast Food', 'Biryani', 'Pizza', 'Burger']

const Restaurants = () => {
  const [restaurants, setRestaurants] = useState([])
  const [filtered,    setFiltered]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeCuisine, setActiveCuisine] = useState('All')
  const [onlyOpen,      setOnlyOpen]      = useState(false)
  const [minRating,     setMinRating]     = useState(0)
  const navigate = useNavigate()

  const fetchRestaurants = async () => {
    setLoading(true)
    try {
      const res = await api.get('/restaurants')
      setRestaurants(res.data.data || [])
      setFiltered(res.data.data || [])
    } catch { setRestaurants([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRestaurants() }, [])

  useEffect(() => {
    let list = [...restaurants]
    if (activeCuisine !== 'All') list = list.filter(r => r.cuisine?.some(c => c.toLowerCase().includes(activeCuisine.toLowerCase())))
    if (onlyOpen)  list = list.filter(r => r.isOpen)
    if (minRating) list = list.filter(r => r.rating >= minRating)
    setFiltered(list)
  }, [activeCuisine, onlyOpen, minRating, restaurants])

  return (
    <div className="restaurants-page">
      <div className="restaurants-hero">
        <h1>🍽️ Discover Restaurants</h1>
        <p>Fresh, delicious food from the best restaurants near you</p>
      </div>

      {/* Filters */}
      <div className="rest-filters">
        <div className="cuisine-chips">
          {CUISINES.map(c => (
            <button key={c} className={`chip ${activeCuisine === c ? 'active' : ''}`} onClick={() => setActiveCuisine(c)}>{c}</button>
          ))}
        </div>
        <div className="filter-controls">
          <label className="toggle-label">
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
            <span>Open Now</span>
          </label>
          <select className="rating-select" value={minRating} onChange={e => setMinRating(Number(e.target.value))}>
            <option value={0}>All Ratings</option>
            <option value={3}>3★ & above</option>
            <option value={4}>4★ & above</option>
            <option value={4.5}>4.5★ & above</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <p className="results-count">{filtered.length} restaurant{filtered.length !== 1 ? 's' : ''} found</p>

      {loading ? (
        <div className="rest-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="rest-card skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span>🔍</span>
          <p>No restaurants found with the selected filters</p>
          <button onClick={() => { setActiveCuisine('All'); setOnlyOpen(false); setMinRating(0) }}>Clear Filters</button>
        </div>
      ) : (
        <div className="rest-grid">
          {filtered.map(r => (
            <div key={r._id} className="rest-card" onClick={() => navigate(`/restaurant/${r._id}`)}>
              <div className="rest-card-img-wrap">
                {r.image
                  ? <img src={BASE_IMAGE_URL + r.image} alt={r.name} />
                  : <div className="rest-card-img-placeholder">🍽️</div>
                }
                <span className={`open-badge ${r.isOpen ? 'open' : 'closed'}`}>{r.isOpen ? '● Open' : '● Closed'}</span>
              </div>
              <div className="rest-card-body">
                <h3>{r.name}</h3>
                <p className="cuisine-tags">{r.cuisine?.join(' · ')}</p>
                <div className="rest-meta">
                  <span className="rating">⭐ {r.rating?.toFixed(1) || '4.0'}</span>
                  <span className="dot-sep">·</span>
                  <span>🕐 {r.deliveryTime || 30} min</span>
                  <span className="dot-sep">·</span>
                  <span>₹{r.minimumOrder || 100} min</span>
                </div>
                <p className="rest-address">📍 {r.address?.city}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Restaurants
