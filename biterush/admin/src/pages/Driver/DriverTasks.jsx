import React, { useState, useEffect, useContext } from 'react'
import './Driver.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

const STATUS_ORDER = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'];
const STATUS_COLOR = {
    'Pending': '#f0a500',
    'Confirmed': '#3b82f6',
    'Preparing': '#8b5cf6',
    'Ready': '#10b981',
    'Out for Delivery': '#f97316',
    'Delivered': '#22c55e',
    'Cancelled': '#ef4444',
};

const DriverTasks = () => {
    const { url, token, currency, socket } = useContext(AdminContext);
    const [tasks, setTasks] = useState([]);
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('active');
    const [updatingId, setUpdatingId] = useState(null);

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${url}/api/order/driver-tasks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) setTasks(res.data.data);
        } catch {
            toast.error("Failed to fetch tasks");
        } finally {
            setLoading(false);
        }
    };

    const fetchOffers = async () => {
        try {
            const res = await axios.get(`${url}/api/delivery/offers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) setOffers(res.data.data);
        } catch {}
    };

    const acceptOffer = async (orderId) => {
        setUpdatingId(orderId);
        try {
            const res = await axios.patch(`${url}/api/delivery/accept-order/${orderId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success('Delivery confirmed. Customer has been notified.');
                fetchTasks();
                fetchOffers();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to accept delivery");
        } finally {
            setUpdatingId(null);
        }
    };

    const markDelivered = async (orderId) => {
        setUpdatingId(orderId);
        try {
            const res = await axios.patch(`${url}/api/delivery/mark-delivered/${orderId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success("🎉 Order Delivered! +₹30 added to earnings");
                fetchTasks();
                fetchOffers();
            }
        } catch {
            toast.error("Failed to mark delivered");
        } finally {
            setUpdatingId(null);
        }
    };

    const getActionButton = (task) => {
        const isUpdating = updatingId === task._id;
        if (isUpdating) return <button className="task-btn loading" disabled><div className="btn-spinner dark"></div></button>;

        if (task.status === 'Out for Delivery') return (
            <button onClick={() => markDelivered(task._id)} className='task-btn green'>
                🏁 Mark Delivered
            </button>
        );
        return (
            <button className='task-btn done' disabled>
                {task.status === 'Delivered' ? '✅ Delivered' : '❌ Cancelled'}
            </button>
        );
    };

    const filteredTasks = tasks.filter(t => {
        if (filter === 'active') return !['Delivered', 'Cancelled'].includes(t.status);
        if (filter === 'done') return ['Delivered', 'Cancelled'].includes(t.status);
        return true;
    });

    useEffect(() => {
        fetchTasks();
        fetchOffers();
        const interval = setInterval(() => {
            fetchTasks();
            fetchOffers();
        }, 20000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refreshLists = () => {
            fetchTasks();
            fetchOffers();
        };
        socket.on('delivery_offer', refreshLists);
        socket.on('order_accepted', refreshLists);
        socket.on('order_status_update', refreshLists);
        socket.on('notification', refreshLists);
        return () => {
            socket.off('delivery_offer', refreshLists);
            socket.off('order_accepted', refreshLists);
            socket.off('order_status_update', refreshLists);
            socket.off('notification', refreshLists);
        };
    }, [socket]);

    return (
        <div className='driver-tasks'>
            <div className="driver-header">
                <div>
                    <h2>📋 Delivery Tasks</h2>
                    <p className="driver-subheading">{tasks.length} total assignment{tasks.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={fetchTasks} className='refresh-btn' disabled={loading}>
                    {loading ? '⏳' : '🔄'} Refresh
                </button>
            </div>

            {/* Filter Tabs */}
            <div className="task-filter-tabs">
                {['active', 'done', 'all'].map(f => (
                    <button
                        key={f}
                        className={`filter-tab ${filter === f ? 'active' : ''}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === 'active' ? `Active (${tasks.filter(t => !['Delivered', 'Cancelled'].includes(t.status)).length})` :
                            f === 'done' ? `Completed (${tasks.filter(t => ['Delivered', 'Cancelled'].includes(t.status)).length})` :
                                `All (${tasks.length})`}
                    </button>
                ))}
            </div>

            {offers.length > 0 && (
                <div className="tasks-list" style={{ marginBottom: '24px' }}>
                    {offers.map((offer) => {
                        return (
                            <div key={`offer-${offer._id}`} className='task-card'>
                                <div className="task-main">
                                    <div className="task-top-row">
                                        <h4>Nearby pickup #{offer.orderId || offer._id?.slice(-6).toUpperCase()}</h4>
                                        <span
                                            className="task-status-badge"
                                            style={{ background: '#10b98120', color: '#10b981' }}
                                        >
                                            Ready for pickup
                                        </span>
                                    </div>
                                    <div className="task-point pickup">
                                        <span className="point-dot pickup-dot"></span>
                                        <div className="info">
                                            <b>Pickup: {offer.restaurantId?.name || 'Restaurant'}</b>
                                            <span>{offer.restaurantId?.address?.street}, {offer.restaurantId?.address?.city}</span>
                                        </div>
                                    </div>
                                    <div className="task-point delivery">
                                        <span className="point-dot delivery-dot"></span>
                                        <div className="info">
                                            <b>Deliver to: {offer.address?.firstName} {offer.address?.lastName}</b>
                                            <span>{offer.address?.street}, {offer.address?.city}</span>
                                            {offer.userId?.phone && <span className="phone-tag">📞 {offer.userId.phone}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="task-actions">
                                    <div className="task-meta">
                                        <div className="meta-row">
                                            <span>Amount</span>
                                            <strong>{currency}{offer.totalAmount}</strong>
                                        </div>
                                        <div className="meta-row">
                                            <span>Items</span>
                                            <strong>{offer.items?.length}</strong>
                                        </div>
                                        <div className="meta-row">
                                            <span>Status</span>
                                            <strong>Offer waiting</strong>
                                        </div>
                                    </div>
                                    <div className="task-btn-wrapper">
                                        <button onClick={() => acceptOffer(offer._id)} className='task-btn orange' disabled={updatingId === offer._id}>
                                            {updatingId === offer._id ? '...' : '✅ Accept delivery'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {loading && tasks.length === 0 ? (
                <div className='driver-loading-inline'>
                    <div className="driver-spinner"></div>
                    <p>Loading tasks...</p>
                </div>
            ) : filteredTasks.length === 0 ? (
                <div className="no-data-card">
                    <div className="no-data-icon">🚴</div>
                    <h3>No {filter !== 'all' ? filter : ''} tasks</h3>
                    <p>Go online and nearby ready deliveries will appear here for you to accept.</p>
                </div>
            ) : (
                <div className="tasks-list">
                    {filteredTasks.map((task) => (
                        <div key={task._id} className='task-card'>
                            {/* Left: Order Info */}
                            <div className="task-main">
                                <div className="task-top-row">
                                    <h4>Order #{task.orderId || task._id?.slice(-6).toUpperCase()}</h4>
                                    <span
                                        className="task-status-badge"
                                        style={{ background: STATUS_COLOR[task.status] + '20', color: STATUS_COLOR[task.status] }}
                                    >
                                        {task.status}
                                    </span>
                                </div>

                                {/* Pickup */}
                                <div className="task-point pickup">
                                    <span className="point-dot pickup-dot"></span>
                                    <div className="info">
                                        <b>Pickup: {task.restaurantId?.name || 'Restaurant'}</b>
                                        <span>{task.restaurantId?.address?.street}, {task.restaurantId?.address?.city}</span>
                                    </div>
                                </div>

                                {/* Delivery */}
                                <div className="task-point delivery">
                                    <span className="point-dot delivery-dot"></span>
                                    <div className="info">
                                        <b>Deliver to: {task.address?.firstName} {task.address?.lastName}</b>
                                        <span>{task.address?.street}, {task.address?.city}</span>
                                        {task.userId?.phone && <span className="phone-tag">📞 {task.userId.phone}</span>}
                                    </div>
                                </div>

                                {/* Items */}
                                <div className="task-items-row">
                                    {task.items?.slice(0, 3).map((item, i) => (
                                        <span key={i} className="item-chip">{item.name} ×{item.quantity}</span>
                                    ))}
                                    {task.items?.length > 3 && <span className="item-chip more">+{task.items.length - 3} more</span>}
                                </div>
                            </div>

                            {/* Right: Meta + Action */}
                            <div className="task-actions">
                                <div className="task-meta">
                                    <div className="meta-row">
                                        <span>Amount</span>
                                        <strong>{currency}{task.totalAmount}</strong>
                                    </div>
                                    <div className="meta-row">
                                        <span>Items</span>
                                        <strong>{task.items?.length}</strong>
                                    </div>
                                    <div className="meta-row">
                                        <span>Payment</span>
                                        <strong style={{ textTransform: 'uppercase' }}>{task.paymentMethod}</strong>
                                    </div>
                                    <div className="meta-row">
                                        <span>Placed</span>
                                        <strong>{new Date(task.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong>
                                    </div>
                                </div>
                                <div className="task-btn-wrapper">
                                    {getActionButton(task)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DriverTasks;
