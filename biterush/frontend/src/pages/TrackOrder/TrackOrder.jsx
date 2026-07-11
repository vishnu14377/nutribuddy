import React, { useEffect, useRef, useState } from 'react'
import './TrackOrder.css'
import { useParams } from 'react-router-dom'
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../../services/api.js'
import { useSocket } from '../../Context/SocketContext.jsx'

// Fix for default Leaflet icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Custom high-quality icons
const driverIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972185.png', iconSize: [44, 44], iconAnchor: [22, 44], popupAnchor: [0, -40] })
const restaurantIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075977.png', iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -35] })
const homeIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/6009/6009864.png', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -38] })

const STATUS_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered']

/**
 * Helper to ensure coordinates are [lat, lng] for Leaflet
 */
const getCoords = (coordinates) => {
  if (!coordinates) return null
  let lng, lat
  if (Array.isArray(coordinates)) {
    [lng, lat] = coordinates
  } else if (coordinates.latitude && coordinates.longitude) {
    lat = coordinates.latitude
    lng = coordinates.longitude
  } else {
    return null
  }
  
  const latitude = Number(lat)
  const longitude = Number(lng)
  
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude === 0 && longitude === 0) return null
  return [latitude, longitude]
}

/**
 * Component to automatically adjust map bounds to keep all points visible
 */
const AutoFitMap = ({ points }) => {
  const map = useMap()
  
  useEffect(() => {
    const validPoints = points.filter(p => p && p.length === 2)
    if (validPoints.length > 0) {
      const bounds = L.latLngBounds(validPoints)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true })
    }
  }, [points, map])
  
  return null
}

const formatAddress = (address) => {
  if (!address) return 'Address unavailable'
  return [
    address.street,
    address.city,
    address.state,
    address.zipcode || address.pincode,
    address.country,
  ].filter(Boolean).join(', ') || 'Address unavailable'
}

const TrackOrder = () => {
  const { orderId } = useParams()
  const socketContext = useSocket()
  const socket = socketContext?.socket
  const trackOrder = socketContext?.trackOrder
  const leaveOrder = socketContext?.leaveOrder
  
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [driverLoc, setDriverLoc] = useState(null)

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/order/${orderId}`)
        const nextOrder = res.data.data
        setOrder(nextOrder)
        
        // Initial driver location from DB
        const dbDriverLoc = getCoords(nextOrder?.assignedDriver?.currentLocation?.coordinates)
        if (dbDriverLoc) setDriverLoc(dbDriverLoc)
      } catch {
        setError('We could not load tracking for this order.')
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
    if (trackOrder) trackOrder(orderId)

    return () => {
      if (leaveOrder) leaveOrder(orderId)
    }
  }, [orderId, trackOrder, leaveOrder])

  useEffect(() => {
    if (!socket) return

    const onStatus = ({ orderId: eventOrderId, status }) => {
      if (eventOrderId === orderId) {
        setOrder((curr) => curr ? { ...curr, status } : curr)
      }
    }

    const onLocation = ({ orderId: eventOrderId, latitude, longitude }) => {
      if (eventOrderId === orderId) {
        setDriverLoc([Number(latitude), Number(longitude)])
      }
    }

    const onDelivered = ({ orderId: eventOrderId }) => {
      if (eventOrderId === orderId) {
        setOrder((curr) => curr ? { ...curr, status: 'Delivered' } : curr)
      }
    }

    const onDriverAssigned = ({ orderId: eventOrderId, driver }) => {
      if (eventOrderId === orderId) {
        setOrder((curr) => {
            if(!curr) return curr;
            return {
                ...curr,
                assignedDriver: {
                    ...driver,
                    userId: { name: driver.name, phone: driver.phone }
                }
            }
        })
        if (driver.location) setDriverLoc([driver.location.latitude, driver.location.longitude])
      }
    }

    socket.on('order_status_update', onStatus)
    socket.on('driver_location', onLocation)
    socket.on('order_delivered', onDelivered)
    socket.on('driver_assigned', onDriverAssigned)

    return () => {
      socket.off('order_status_update', onStatus)
      socket.off('driver_location', onLocation)
      socket.off('order_delivered', onDelivered)
      socket.off('driver_assigned', onDriverAssigned)
    }
  }, [socket, orderId])

  if (loading) {
    return <div className="track-loading"><div className="spinner" /><p>Tracking your meal...</p></div>
  }

  if (!order) {
    return <div className="track-error"><p>{error || 'Order not found'}</p></div>
  }

  const currentStep = STATUS_STEPS.indexOf(order.status)
  const restaurantLoc = getCoords(order.restaurantId?.location?.coordinates)
  const deliveryLoc = getCoords([order.address?.longitude, order.address?.latitude])
  
  // Points to keep on screen
  const mapPoints = [restaurantLoc, deliveryLoc, driverLoc].filter(Boolean)
  const defaultCenter = [28.6139, 77.2090] // New Delhi default

  return (
    <div className="track-page">
      <div className="track-left">
        <div className="track-header">
          <h2>📦 Live Order Tracking</h2>
          <span className={`status-chip ${order.status.toLowerCase().replace(/ /g, '-')}`}>
            {order.status}
          </span>
        </div>

        <div className="track-id">ID: #{order.orderId || order._id?.slice(-8).toUpperCase()}</div>

        <div className="track-summary">
          <div className="track-summary-card">
            <p className="summary-label">Ordering From</p>
            <p><b>{order.restaurantId?.name || 'Restaurant'}</b></p>
          </div>
          <div className="track-summary-card">
            <p className="summary-label">Delivery To</p>
            <p>{formatAddress(order.address)}</p>
          </div>
          <div className="track-summary-card">
            <p className="summary-label">Delivery Partner</p>
            <p><b>{order.assignedDriver?.userId?.name || 'Searching...'}</b></p>
          </div>
        </div>

        <div className="timeline">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className={`timeline-step ${i <= currentStep ? 'done' : ''} ${i === currentStep ? 'current' : ''}`}>
              <div className="step-dot">
                {i < currentStep ? '✓' : i === currentStep ? <span className="pulse" /> : ''}
              </div>
              {i < STATUS_STEPS.length - 1 && <div className="step-line" />}
              <p>{step}</p>
            </div>
          ))}
        </div>

        <div className="order-items-box">
          <h3>Order Content</h3>
          {order.items?.map((item, i) => (
            <div key={i} className="order-item-row">
              <span>{item.name}</span>
              <span className="qty-pill">x{item.quantity}</span>
              <span className="item-price">₹{item.price * item.quantity}</span>
            </div>
          ))}
          <hr />
          <div className="order-item-row total-row">
            <b>Total Paid</b><b>₹{order.totalAmount}</b>
          </div>
        </div>
      </div>

      <div className="track-right">
        <div className="map-container-wrapper">
          <MapContainer center={mapPoints[0] || defaultCenter} zoom={13} className="track-map">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            <AutoFitMap points={mapPoints} />
            
            {restaurantLoc && (
              <Marker position={restaurantLoc} icon={restaurantIcon}>
                <Popup>{order.restaurantId?.name || 'Restaurant'}</Popup>
              </Marker>
            )}
            
            {deliveryLoc && (
              <Marker position={deliveryLoc} icon={homeIcon}>
                <Popup>Your Location</Popup>
              </Marker>
            )}
            
            {driverLoc && (
              <>
                <Marker position={driverLoc} icon={driverIcon}>
                  <Popup>Driver</Popup>
                </Marker>
                {deliveryLoc && (
                  <Polyline 
                    positions={[driverLoc, deliveryLoc]} 
                    color="#ff4f00" 
                    dashArray="10, 10" 
                    weight={3}
                    opacity={0.6}
                  />
                )}
              </>
            )}
          </MapContainer>
          
          <div className="map-overlay">
            {driverLoc ? (
              <div className="map-badge moving">🚴 Driver is on the way</div>
            ) : (
              <div className="map-badge waiting">⌛ Waiting for driver assignment</div>
            )}
          </div>
        </div>
        
        {!deliveryLoc && (
          <div className="track-map-note">
            ⚠️ Precision tracking is limited because a delivery pin was not captured during checkout.
          </div>
        )}
      </div>
    </div>
  )
}

export default TrackOrder
