import React, { useContext, useEffect, useState } from 'react'
import './MyOrders.css'
import api from '../../services/api.js'
import { StoreContext } from '../../Context/StoreContext'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useSocket } from '../../Context/SocketContext.jsx'

const STATUS_COLORS = { 'Pending': '#f59e0b', 'Confirmed': '#3b82f6', 'Preparing': '#8b5cf6', 'Ready': '#06b6d4', 'Out for Delivery': '#ff4f00', 'Delivered': '#22c55e', 'Cancelled': '#ef4444' }

const MyOrders = () => {
  const { token, currency } = useContext(StoreContext)
  const { socket } = useSocket() || {}
  const [orders, setOrders] = useState([])
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const [orderDetails, setOrderDetails] = useState({})
  const [detailLoadingId, setDetailLoadingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) { navigate('/'); return }
    const fetchOrders = async () => {
      try {
        const res = await api.post('/order/userorders', {})
        setOrders(res.data.data || [])
      } catch { toast.error('Failed to load orders') } finally { setLoading(false) }
    }
    fetchOrders()
  }, [token])

  useEffect(() => {
    if (!socket) return

    const updateOrderStatus = ({ orderId, status }) => {
      setOrders((prev) => prev.map((order) => order._id === orderId ? { ...order, status } : order))
      setOrderDetails((prev) => prev[orderId] ? { ...prev, [orderId]: { ...prev[orderId], status } } : prev)
    }

    const onDelivered = ({ orderId }) => updateOrderStatus({ orderId, status: 'Delivered' })

    socket.on('order_status_update', updateOrderStatus)
    socket.on('order_delivered', onDelivered)

    return () => {
      socket.off('order_status_update', updateOrderStatus)
      socket.off('order_delivered', onDelivered)
    }
  }, [socket])

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return
    try {
      const res = await api.patch(`/order/${orderId}/cancel`)
      if (res.data.success) {
        setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: 'Cancelled' } : o))
        toast.success('Order cancelled')
      }
    } catch (err) { toast.error(err.response?.data?.message || 'Cannot cancel') }
  }

  const formatAddress = (address) => {
    if (!address) return 'Address not available'
    if (typeof address === 'string') return address

    const parts = [
      address.firstName && address.lastName ? `${address.firstName} ${address.lastName}` : '',
      address.street,
      address.city,
      address.state,
      address.pincode,
      address.country,
      address.phone,
    ].filter(Boolean)

    return parts.join(', ')
  }

  const toggleOrderDetails = async (orderId) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null)
      return
    }

    setExpandedOrderId(orderId)

    if (orderDetails[orderId]) return

    try {
      setDetailLoadingId(orderId)
      const res = await api.get(`/order/${orderId}`)
      if (res.data.success) {
        setOrderDetails(prev => ({ ...prev, [orderId]: res.data.data }))
      }
    } catch {
      toast.error('Failed to load order details')
    } finally {
      setDetailLoadingId(null)
    }
  }

  if (loading) return <div className="mo-loading"><div className="spinner" /></div>

  return (
    <div className="myorders">
      <div className="mo-header">
        <h2>🛵 My Orders</h2>
        <span>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
      </div>

      {orders.length === 0 ? (
        <div className="mo-empty">
          <span>🛍️</span>
          <p>No orders yet</p>
          <button onClick={() => navigate('/')}>Order Now</button>
        </div>
      ) : (
        <div className="mo-list">
          {orders.map(order => (
            <div key={order._id} className="mo-card">
              <div className="mo-card-top">
                <div className="mo-icon">🛵</div>
                <div className="mo-info">
                  <p className="mo-restaurant">{order.restaurantId?.name || 'Restaurant unavailable'}</p>
                  <p className="mo-items-text">
                    {order.items?.map(i => `${i.name} ×${i.quantity}`).join(', ')}
                  </p>
                  <p className="mo-date">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="mo-meta">
                  <p className="mo-amount">{currency}{order.totalAmount}</p>
                  <span className="mo-count">{order.items?.length} item{order.items?.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="mo-card-bottom">
                <span className="mo-status" style={{ color: STATUS_COLORS[order.status] || '#888', background: STATUS_COLORS[order.status] + '20' }}>
                  ● {order.status}
                </span>
                <div className="mo-actions">
                  <button className="details-btn" onClick={() => toggleOrderDetails(order._id)}>
                    {expandedOrderId === order._id ? 'Hide details' : 'View details'}
                  </button>
                  {['Pending', 'Confirmed'].includes(order.status) && (
                    <button className="cancel-btn" onClick={() => cancelOrder(order._id)}>Cancel</button>
                  )}
                  {['Out for Delivery', 'Preparing', 'Confirmed'].includes(order.status) && (
                    <button className="track-btn" onClick={() => navigate(`/track/${order._id}`)}>🗺️ Track</button>
                  )}
                  {order.status === 'Delivered' && (
                    <span className="delivered-badge">✅ Delivered</span>
                  )}
                </div>
              </div>

              {/* Status progress bar */}
              <div className="mo-progress">
                {['Pending','Confirmed','Preparing','Out for Delivery','Delivered'].map((s, i) => {
                  const steps = ['Pending','Confirmed','Preparing','Out for Delivery','Delivered']
                  const cur  = steps.indexOf(order.status)
                  return <div key={s} className={`prog-seg ${i <= cur ? 'filled' : ''}`} style={i <= cur ? { background: STATUS_COLORS[order.status] } : {}} />
                })}
              </div>

              {expandedOrderId === order._id && (
                <div className="mo-details">
                  {detailLoadingId === order._id ? (
                    <p className="mo-detail-loading">Loading order summary...</p>
                  ) : (
                    <>
                      <div className="mo-detail-grid">
                        <div className="mo-detail-block">
                          <p className="mo-detail-label">Order summary</p>
                          <p>Order #{order.orderId || order._id?.slice(-8).toUpperCase()}</p>
                          <p>{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</p>
                          <p>Subtotal {currency}{order.amount}</p>
                          <p>Delivery {currency}{order.deliveryCharge || 0}</p>
                          <p className="mo-detail-total">Total {currency}{order.totalAmount}</p>
                        </div>

                        <div className="mo-detail-block">
                          <p className="mo-detail-label">Restaurant</p>
                          <p>{orderDetails[order._id]?.restaurantId?.name || order.restaurantId?.name || 'Restaurant unavailable'}</p>
                          <p>{formatAddress(orderDetails[order._id]?.restaurantId?.address || order.restaurantId?.address)}</p>
                          {(orderDetails[order._id]?.restaurantId?.phone || order.restaurantId?.phone) && (
                            <p>{orderDetails[order._id]?.restaurantId?.phone || order.restaurantId?.phone}</p>
                          )}
                        </div>

                        <div className="mo-detail-block">
                          <p className="mo-detail-label">Delivery details</p>
                          <p>{formatAddress(orderDetails[order._id]?.address || order.address)}</p>
                          <p>Payment: {(orderDetails[order._id]?.paymentMethod || order.paymentMethod || 'cod').toUpperCase()}</p>
                          <p>Status: {orderDetails[order._id]?.status || order.status}</p>
                        </div>
                      </div>

                      <div className="mo-item-breakdown">
                        <p className="mo-detail-label">Items</p>
                        {(orderDetails[order._id]?.items || order.items || []).map((item, index) => (
                          <div key={`${item.itemId || item.name}-${index}`} className="mo-detail-item">
                            <span>{item.name} x{item.quantity}</span>
                            <span>{currency}{item.price * item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MyOrders
