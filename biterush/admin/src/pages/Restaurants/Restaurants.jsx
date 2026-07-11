import React, { useEffect, useState, useContext } from 'react'
import './Restaurants.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

const Restaurants = () => {
  const { url, token } = useContext(AdminContext)
  const [restaurants, setRestaurants] = useState([])
  const [pendingOnly, setPendingOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchRestaurants = async () => {
    try {
      const endpoint = pendingOnly ? '/api/restaurants/pending' : '/api/restaurants'
      const response = await axios.get(`${url}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        setRestaurants(response.data.data)
      }
    } catch (error) {
      toast.error("Failed to fetch restaurants")
    } finally {
      setLoading(false)
    }
  }

  const approveRestaurant = async (id) => {
    try {
      const response = await axios.patch(`${url}/api/restaurant/${id}/approve`, {}, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        toast.success("Restaurant approved!")
        fetchRestaurants()
      }
    } catch (error) {
      toast.error("Approval failed")
    }
  }

  const toggleOpen = async (id) => {
    try {
      const response = await axios.patch(`${url}/api/restaurant/${id}/toggle-open`, {}, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        toast.success("Status toggled")
        fetchRestaurants()
      }
    } catch (error) {
      toast.error("Action failed")
    }
  }

  useEffect(() => {
    if (token) fetchRestaurants()
  }, [token, pendingOnly])

  if (loading) return <div className='restaurants-loading'><div className='spinner'></div></div>

  return (
    <div className='restaurants-page'>
      <div className="restaurants-header">
        <div className="header-left">
          <h2>🏪 Restaurant Management</h2>
          <p>Total: {restaurants.length}</p>
        </div>
        <div className="header-actions">
          <button 
            className={`toggle-view-btn ${!pendingOnly ? 'active' : ''}`}
            onClick={() => setPendingOnly(false)}
          >
            All Vendors
          </button>
          <button 
            className={`toggle-view-btn ${pendingOnly ? 'active' : ''}`}
            onClick={() => setPendingOnly(true)}
          >
            Approval Queue 
            {restaurants.length > 0 && pendingOnly && <span className='badge'>{restaurants.length}</span>}
          </button>
        </div>
      </div>

      <div className="restaurants-grid">
        {restaurants.length === 0 ? (
          <div className="no-data">No restaurants found.</div>
        ) : (
          restaurants.map((res, index) => (
            <div key={index} className="res-card">
              <div className="res-card-img">
                <img src={res.image ? `${url}/images/${res.image}` : 'https://placehold.co/400x200?text=No+Image'} alt={res.name} />
                <div className={`status-overlay ${res.isApproved ? (res.isOpen ? 'open' : 'closed') : 'pending'}`}>
                  {res.isApproved ? (res.isOpen ? 'OPEN' : 'CLOSED') : 'PENDING APPROVAL'}
                </div>
              </div>
              <div className="res-card-info">
                <div className="res-title-row">
                  <h3>{res.name}</h3>
                  <div className="res-rating">⭐ {res.rating.toFixed(1)}</div>
                </div>
                <p className="res-cuisine">{res.cuisine.join(', ')}</p>
                <p className="res-address">📍 {res.address.street}, {res.address.city}</p>
                <div className="res-contact">
                  <span>📞 {res.phone}</span>
                  <span>✉️ {res.email}</span>
                </div>
                
                <div className="res-card-actions">
                  {!res.isApproved ? (
                    <button onClick={() => approveRestaurant(res._id)} className='approve-btn'>
                      ✅ Approve Restaurant
                    </button>
                  ) : (
                    <button onClick={() => toggleOpen(res._id)} className={`toggle-btn ${res.isOpen ? 'close' : 'open'}`}>
                      {res.isOpen ? 'Close Shop' : 'Open Shop'}
                    </button>
                  )}
                  <button className='view-menu-btn' onClick={() => window.open(`http://localhost:5173/restaurant/${res._id}`)}>
                    View on Site
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Restaurants
