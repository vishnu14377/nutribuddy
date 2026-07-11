import React, { useEffect, useState, useContext } from 'react'
import './Orders.css'
import { toast } from 'react-toastify'
import axios from 'axios'
import { assets } from '../../assets/assets'
import { AdminContext } from '../../context/AdminContext'

const StatCard = ({ icon, label, value, color }) => (
    <div className="order-stat-card" style={{ '--accent': color }}>
        <div className="stat-icon" style={{ background: color + '15', color }}>{icon}</div>
        <div className="stat-content">
            <p className="stat-label">{label}</p>
            <h3 className="stat-value">{value}</h3>
        </div>
    </div>
)

const Orders = () => {
    const { url, token, currency, user, socket } = useContext(AdminContext);
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [restaurants, setRestaurants] = useState([]);
    const [selectedRes, setSelectedRes] = useState('all');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const role = user?.role || 'admin';

    const fetchRestaurants = async () => {
        if (role !== 'admin') return;
        try {
            const res = await axios.get(`${url}/api/restaurants`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) setRestaurants(res.data.data);
        } catch (_) {}
    };

    const fetchStats = async () => {
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const res = await axios.get(`${url}/api/admin/stats`, config);
            if (res.data.success) setStats(res.data.data);
        } catch (_) {}
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            let endpoint = `${url}/api/order/list`;
            if (role === 'admin' && selectedRes !== 'all') {
                endpoint += `?restaurantId=${selectedRes}`;
            }
            
            const response = await axios.get(endpoint, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.success) {
                setOrders(response.data.data);
            }
        } catch (error) {
            toast.error("Error fetching orders");
        } finally {
            setLoading(false);
        }
    }

    const statusHandler = async (event, orderId) => {
        try {
            const response = await axios.post(`${url}/api/order/status`, {
                orderId,
                status: event.target.value
            }, { headers: { Authorization: `Bearer ${token}` } });
            if (response.data.success) {
                toast.success("Status Updated");
                fetchOrders();
                fetchStats();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to update status");
        }
    }

    useEffect(() => {
        if (token) {
            fetchRestaurants();
            fetchStats();
            fetchOrders();
        }
    }, [token, selectedRes])

    useEffect(() => {
        if (!socket) return;
        const refreshOrders = () => {
            fetchOrders();
            fetchStats();
        };
        socket.on('order_status_update', refreshOrders);
        socket.on('driver_location', refreshOrders);
        socket.on('notification', refreshOrders);
        return () => {
            socket.off('order_status_update', refreshOrders);
            socket.off('driver_location', refreshOrders);
            socket.off('notification', refreshOrders);
        };
    }, [socket, selectedRes, token]);

    const STATUS_STEPS = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'];

    const filteredOrders = orders.filter(o => filter === 'all' || o.status === filter);

    if (loading && !orders.length) return <div className="orders-loading"><div className="spinner"></div></div>

    return (
        <div className='orders-page'>
            <div className="orders-header">
                <div className="header-text">
                    <h2>{role === 'admin' ? '📦 Master Order Management' : '🍔 My Restaurant Orders'}</h2>
                    <p>Manage, track, and update {role === 'admin' ? 'platform' : 'your'} orders in real-time.</p>
                </div>
                {role === 'admin' && (
                    <select 
                        value={selectedRes} 
                        onChange={(e) => setSelectedRes(e.target.value)} 
                        className='restaurant-filter-select'
                    >
                        <option value="all">All Restaurants</option>
                        {restaurants.map(res => (
                            <option key={res._id} value={res._id}>{res.name}</option>
                        ))}
                    </select>
                )}
            </div>

            <div className="orders-stats-grid">
                <StatCard 
                    icon="🛒" 
                    label="Total Orders" 
                    value={stats?.orders?.total || 0} 
                    color="#ff4f00" 
                />
                <StatCard 
                    icon="💰" 
                    label="Revenue" 
                    value={`${currency}${stats?.revenue?.total?.toLocaleString() || 0}`} 
                    color="#22c55e" 
                />
                <StatCard 
                    icon="⌛" 
                    label="Pending" 
                    value={orders.filter(o => !['Delivered', 'Cancelled'].includes(o.status)).length} 
                    color="#f59e0b" 
                />
                <StatCard 
                    icon="✅" 
                    label="Completed" 
                    value={orders.filter(o => o.status === 'Delivered').length} 
                    color="#3b82f6" 
                />
            </div>

            <div className="orders-filters">
                <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All Orders</button>
                {STATUS_STEPS.map(s => (
                    <button
                        key={s}
                        className={`filter-btn ${filter === s ? 'active' : ''}`}
                        onClick={() => setFilter(s)}
                    >
                        {s}
                    </button>
                ))}
            </div>

            <div className="orders-list">
                {filteredOrders.length === 0 ? (
                    <div className="no-data">
                        <img src={assets.parcel_icon} alt="" style={{ opacity: 0.2, width: 80, marginBottom: 16 }} />
                        <p>No orders found for the selected criteria.</p>
                    </div>
                ) : (
                    filteredOrders.map((order, index) => (
                        <div key={index} className='order-item-card'>
                            <div className="order-main-info">
                                <div className="parcel-icon-wrapper">
                                    <img src={assets.parcel_icon} alt="Order" />
                                </div>
                                <div className="order-details">
                                    <div className="order-title-row">
                                        <p className='order-id'>#{order.orderId || order._id.slice(-6).toUpperCase()}</p>
                                        <span className="order-time">{new Date(order.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className='order-items-list'>
                                        {order.items.map((item, i) => (
                                            <span key={i}>{item.name} <small>x{item.quantity}</small>{i < order.items.length - 1 ? ' • ' : ''}</span>
                                        ))}
                                    </div>
                                    <div className="customer-info">
                                        <p className='customer-name'>👤 {order.address.firstName} {order.address.lastName}</p>
                                        <p className='customer-phone'>📞 {order.address.phone}</p>
                                    </div>
                                    <div className='order-address-box'>
                                        <p>📍 {order.address.street}, {order.address.city}, {order.address.state}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="order-meta-info">
                                <div className="meta-block">
                                    <p className="label">Total Amount</p>
                                    <p className="value price">{currency}{order.totalAmount || order.amount}</p>
                                </div>
                                <div className="meta-block">
                                    <p className="label">Payment Method</p>
                                    <p className={`value payment-status ${order.paymentStatus}`}>{order.paymentMethod?.toUpperCase()}</p>
                                </div>
                                {role === 'admin' && order.restaurantId && (
                                    <div className="meta-block">
                                        <p className="label">Restaurant</p>
                                        <p className="value res-tag">{order.restaurantId.name || 'Unknown'}</p>
                                    </div>
                                )}
                            </div>

                            <div className="order-status-control">
                                <div className="control-group">
                                    <p className="label">Order Status</p>
                                    <select
                                        onChange={(e) => statusHandler(e, order._id)}
                                        value={order.status}
                                        className={`status-select ${order.status.replace(/\s+/g, '-').toLowerCase()}`}
                                    >
                                        {STATUS_STEPS.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="driver-info-box">
                                    {order.assignedDriver ? (
                                        <div className="driver-assigned">
                                            <span className="driver-icon">🚴</span>
                                            <div>
                                                <p className="driver-label">Assigned Driver</p>
                                                <p className="driver-name">{order.assignedDriver.userId?.name || order.assignedDriver.name || 'Driver assigned'}</p>
                                                {order.assignedDriver.currentLocation?.coordinates?.[0] && order.assignedDriver.currentLocation?.coordinates?.[1] && (
                                                    <p className="driver-label">
                                                        Live: {Number(order.assignedDriver.currentLocation.coordinates[1]).toFixed(4)}, {Number(order.assignedDriver.currentLocation.coordinates[0]).toFixed(4)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="driver-searching">
                                            <div className="dot-pulse"></div>
                                            <span>Searching for delivery partner...</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default Orders
