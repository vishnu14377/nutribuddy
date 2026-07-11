import React, { useEffect, useState, useContext } from 'react'
import './Delivery.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

const Delivery = () => {
  const { url, token } = useContext(AdminContext)
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchPartners = async () => {
    try {
      const response = await axios.get(`${url}/api/delivery/all`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        setPartners(response.data.data)
      }
    } catch (error) {
      toast.error("Failed to fetch delivery partners")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) fetchPartners()
  }, [token])

  if (loading) return <div className='delivery-loading'><div className='spinner'></div></div>

  return (
    <div className='delivery-page'>
      <div className="delivery-header">
        <h2>🚴 Delivery Operations</h2>
        <div className="delivery-stats">
          <div className="stat-pill">Online: <span>{partners.filter(p => p.isOnline).length}</span></div>
          <div className="stat-pill">Available: <span>{partners.filter(p => p.isAvailable).length}</span></div>
        </div>
      </div>

      <div className="partners-grid">
        {partners.length === 0 ? (
          <div className="no-data">No delivery partners registered yet.</div>
        ) : (
          partners.map((partner, index) => (
            <div key={index} className="partner-card">
              <div className="partner-card-header">
                <div className="partner-avatar">{partner.userId?.name[0]}</div>
                <div className="partner-basic-info">
                  <h3>{partner.userId?.name}</h3>
                  <p>{partner.userId?.email}</p>
                </div>
                <div className={`online-dot ${partner.isOnline ? 'online' : 'offline'}`} title={partner.isOnline ? 'Online' : 'Offline'}></div>
              </div>
              
              <div className="partner-card-body">
                <div className="info-row">
                  <span>Vehicle:</span>
                  <b>{partner.vehicleType} - {partner.vehicleNumber}</b>
                </div>
                <div className="info-row">
                  <span>Deliveries:</span>
                  <b>{partner.totalDeliveries}</b>
                </div>
                <div className="info-row">
                  <span>Rating:</span>
                  <b className='rating'>⭐ {partner.rating.toFixed(1)}</b>
                </div>
                <div className="info-row">
                  <span>Current Task:</span>
                  <b className={`task-status ${partner.currentOrderId ? 'busy' : 'free'}`}>
                    {partner.currentOrderId ? 'On Delivery' : 'Available'}
                  </b>
                </div>
              </div>

              <div className="partner-card-footer">
                <button className='track-partner-btn' disabled={!partner.isOnline}>Track Live Location</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Delivery
