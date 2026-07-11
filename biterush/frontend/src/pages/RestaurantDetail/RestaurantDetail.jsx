import React, { useEffect, useState, useContext } from 'react'
import './RestaurantDetail.css'
import api, { BASE_IMAGE_URL } from '../../services/api.js'
import { useParams, useNavigate } from 'react-router-dom'
import { StoreContext } from '../../Context/StoreContext'
import { toast } from 'react-toastify'

const RestaurantDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart, removeFromCart, cartItems, token, currency } = useContext(StoreContext)
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [category, setCategory] = useState('All')

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await api.get(`/restaurant/${id}/menu`)
        setData(res.data.data)
      } catch { toast.error('Failed to load restaurant') } finally { setLoading(false) }
    }
    fetchMenu()
  }, [id])

  if (loading) return <div className="rd-loading"><div className="spinner" /></div>
  if (!data)   return <div className="rd-error"><p>Restaurant not found</p><button onClick={() => navigate('/restaurants')}>← Back</button></div>

  const { restaurant, menu } = data
  const categories = ['All', ...new Set(menu.map(i => i.category))]
  const visibleMenu = category === 'All' ? menu : menu.filter(i => i.category === category)

  return (
    <div className="rd-page">
      {/* Hero */}
      <div className="rd-hero" style={{ backgroundImage: restaurant.coverImage ? `url(${BASE_IMAGE_URL + restaurant.coverImage})` : undefined }}>
        <div className="rd-hero-overlay">
          <button className="back-btn" onClick={() => navigate('/restaurants')}>← Back</button>
          <div className="rd-hero-info">
            {restaurant.image && <img src={BASE_IMAGE_URL + restaurant.image} alt={restaurant.name} className="rd-logo" />}
            <div>
              <h1>{restaurant.name}</h1>
              <p>{restaurant.cuisine?.join(' · ')}</p>
              <div className="rd-badges">
                <span className={`status-badge ${restaurant.isOpen ? 'open' : 'closed'}`}>{restaurant.isOpen ? '● Open' : '● Closed'}</span>
                <span className="badge">⭐ {restaurant.rating?.toFixed(1) || '4.0'}</span>
                <span className="badge">🕐 {restaurant.deliveryTime || 30} min</span>
                <span className="badge">₹{restaurant.deliveryCharge || 50} delivery</span>
                <span className="badge">Min ₹{restaurant.minimumOrder || 100}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="rd-cats">
        {categories.map(c => (
          <button key={c} className={`cat-tab ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      {/* Menu */}
      <div className="rd-menu-grid">
        {visibleMenu.length === 0
          ? <p className="empty-cat">No items in this category</p>
          : visibleMenu.map(item => {
              const qty = cartItems[item._id] || 0
              return (
                <div key={item._id} className="menu-item-card">
                  <div className="menu-item-img">
                    <img src={BASE_IMAGE_URL + item.image} alt={item.name} />
                    {!item.isAvailable && <div className="unavailable-tag">Unavailable</div>}
                  </div>
                  <div className="menu-item-body">
                    <h4>{item.name}</h4>
                    <p className="menu-item-desc">{item.description}</p>
                    <div className="menu-item-footer">
                      <span className="menu-price">{currency}{item.price}</span>
                      {item.isAvailable ? (
                        qty === 0
                          ? <button className="add-btn" onClick={() => { if (!token) { toast.info('Please login to add items'); return; } addToCart(item._id) }}>+ Add</button>
                          : (
                            <div className="qty-control">
                              <button onClick={() => removeFromCart(item._id)}>−</button>
                              <span>{qty}</span>
                              <button onClick={() => addToCart(item._id)}>+</button>
                            </div>
                          )
                      ) : (
                        <span className="unavail-text">Not available</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

export default RestaurantDetail
