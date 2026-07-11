import React, { useState, useEffect, useContext } from 'react'
import './Driver.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'
import useLocationTracking from '../../hooks/useLocationTracking'

const DriverDashboard = () => {
    const { url, token, currency, socket, refreshDriverProfile, refreshPortalIdentity } = useContext(AdminContext);
    const [profile, setProfile] = useState(null);
    const [currentOrder, setCurrentOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);
    const [showRegister, setShowRegister] = useState(false);
    const [registerData, setRegisterData] = useState({ vehicleType: 'bike', vehicleNumber: '' });
    const [registerLoading, setRegisterLoading] = useState(false);
    const navigate = useNavigate();

    const fetchProfile = async () => {
        try {
            const res = await axios.get(`${url}/api/delivery/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                setProfile(res.data.data);
                refreshDriverProfile?.(token);
            }
        } catch (error) {
            if (error.response?.status === 404) {
                setShowRegister(true);
            } else {
                toast.error("Failed to load profile");
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchCurrentOrder = async () => {
        try {
            const res = await axios.get(`${url}/api/delivery/current-order`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) setCurrentOrder(res.data.data);
        } catch {}
    };

    const toggleStatus = async () => {
        setToggling(true);
        try {
            if (!profile?.isOnline) {
                if (!navigator.geolocation) {
                    toast.error("Location access is required to go online");
                    return;
                }

                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 12000,
                        maximumAge: 300000,
                    });
                });

                await axios.post(`${url}/api/delivery/update-location`, {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            const res = await axios.patch(`${url}/api/delivery/toggle-online`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success(res.data.message);
                fetchProfile();
                refreshDriverProfile?.(token);
            }
        } catch {
            toast.error(profile?.isOnline ? "Failed to update status" : "Location is required before going online");
        } finally {
            setToggling(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setRegisterLoading(true);
        try {
            const res = await axios.post(`${url}/api/delivery/register`, registerData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success("Driver profile created!");
                setShowRegister(false);
                fetchProfile();
                refreshPortalIdentity?.(token);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || "Registration failed");
        } finally {
            setRegisterLoading(false);
        }
    };

    const markDelivered = async (orderId) => {
        try {
            const res = await axios.patch(`${url}/api/delivery/mark-delivered/${orderId}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data.success) {
                toast.success("Order delivered! 🎉 +₹30 earned");
                setCurrentOrder(null);
                fetchProfile();
                fetchCurrentOrder();
            }
        } catch {
            toast.error("Failed to mark delivered");
        }
    };

    useEffect(() => {
        fetchProfile();
        fetchCurrentOrder();
        const interval = setInterval(fetchCurrentOrder, 15000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!socket) return;

        const refreshAll = () => {
            fetchCurrentOrder();
            fetchProfile();
        };

        socket.on('delivery_offer', refreshAll);
        socket.on('order_accepted', refreshAll);
        socket.on('order_status_update', refreshAll);

        return () => {
            socket.off('delivery_offer', refreshAll);
            socket.off('order_accepted', refreshAll);
            socket.off('order_status_update', refreshAll);
        };
    }, [socket]);

    if (loading) return (
        <div className='driver-loading'>
            <div className="driver-spinner"></div>
            <p>Loading your portal...</p>
        </div>
    );

    if (showRegister) return (
        <div className='driver-register-container'>
            <div className='driver-register-card'>
                <div className="register-icon">🚴</div>
                <h2>Set Up Your Driver Profile</h2>
                <p>You need to create your delivery partner profile before you can start accepting orders.</p>
                <form onSubmit={handleRegister}>
                    <div className="reg-group">
                        <label>Vehicle Type</label>
                        <select
                            value={registerData.vehicleType}
                            onChange={e => setRegisterData(d => ({ ...d, vehicleType: e.target.value }))}
                        >
                            <option value="bike">Bike</option>
                            <option value="scooter">Scooter</option>
                            <option value="bicycle">Bicycle</option>
                            <option value="car">Car</option>
                        </select>
                    </div>
                    <div className="reg-group">
                        <label>Vehicle Number</label>
                        <input
                            type="text"
                            placeholder="e.g. DL 5S AB 1234"
                            value={registerData.vehicleNumber}
                            onChange={e => setRegisterData(d => ({ ...d, vehicleNumber: e.target.value.toUpperCase() }))}
                            required
                        />
                    </div>
                    <button type="submit" className="reg-submit-btn" disabled={registerLoading}>
                        {registerLoading ? <div className="btn-spinner"></div> : '🚀 Create Profile & Start'}
                    </button>
                </form>
            </div>
        </div>
    );

    return (
        <div className='driver-dashboard'>

            {/* Header */}
            <div className="driver-header">
                <div>
                    <h2>🚴 Driver Portal</h2>
                    <p className="driver-subheading">Welcome back, {profile?.userId?.name || 'Driver'}!</p>
                </div>
                <div className="header-right">
                    <span className={`status-badge ${profile?.isOnline ? 'online' : 'offline'}`}>
                        <span className="status-dot"></span>
                        {profile?.isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
            </div>

            {/* Active Order Banner */}
            {currentOrder && (
                <div className="active-order-banner">
                    <div className="active-order-info">
                        <span className="active-label">🔴 ACTIVE DELIVERY</span>
                        <h3>Order #{currentOrder.orderId || currentOrder._id?.slice(-6).toUpperCase()}</h3>
                        <p>
                            <strong>{currentOrder.address?.firstName} {currentOrder.address?.lastName}</strong>
                            &nbsp;— {currentOrder.address?.street}, {currentOrder.address?.city}
                        </p>
                        <p>📦 {currentOrder.items?.length} items &nbsp;|&nbsp; 💰 {currency}{currentOrder.totalAmount}</p>
                    </div>
                    <div className="active-order-actions">
                        {currentOrder.status === 'Out for Delivery' && (
                            <button onClick={() => markDelivered(currentOrder._id)} className="deliver-btn">
                                ✅ Mark Delivered
                            </button>
                        )}
                        <button onClick={() => navigate('/driver/tasks')} className="view-tasks-btn">
                            View All Tasks →
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="driver-stats-grid">
                <div className="driver-stat-card deliveries">
                    <div className="stat-icon">📦</div>
                    <div className="stat-content">
                        <p>Total Deliveries</p>
                        <h3>{profile?.totalDeliveries || 0}</h3>
                    </div>
                </div>
                <div className="driver-stat-card earnings-today">
                    <div className="stat-icon">💵</div>
                    <div className="stat-content">
                        <p>Today's Earnings</p>
                        <h3>{currency}{profile?.earningsToday || 0}</h3>
                    </div>
                </div>
                <div className="driver-stat-card earnings-total">
                    <div className="stat-icon">🏦</div>
                    <div className="stat-content">
                        <p>Total Earnings</p>
                        <h3>{currency}{profile?.earningsTotal || 0}</h3>
                    </div>
                </div>
                <div className="driver-stat-card rating">
                    <div className="stat-icon">⭐</div>
                    <div className="stat-content">
                        <p>Rating</p>
                        <h3>{Number(profile?.rating || 5).toFixed(1)}</h3>
                    </div>
                </div>
            </div>

            {/* Go Online / Offline Card */}
            <div className="driver-action-card">
                <div className="action-info">
                    <h3>Availability</h3>
                    <p>
                        {profile?.isOnline
                            ? 'You are live! Nearby ready-for-pickup deliveries will appear for you to accept.'
                            : 'Go online to start receiving nearby delivery offers.'}
                    </p>
                </div>
                <button
                    className={`status-toggle-btn ${profile?.isOnline ? 'turn-off' : 'turn-on'}`}
                    onClick={toggleStatus}
                    disabled={toggling}
                >
                    {toggling
                        ? <div className="btn-spinner"></div>
                        : profile?.isOnline ? '🔴 Go Offline' : '🟢 Go Online'}
                </button>
            </div>

            {/* Vehicle & Profile Info */}
            <div className="driver-info-grid">
                <div className="driver-profile-mini">
                    <h3>Vehicle Details</h3>
                    <div className="detail-row">
                        <span>Type</span>
                        <span>{profile?.vehicleType?.toUpperCase()}</span>
                    </div>
                    <div className="detail-row">
                        <span>Number</span>
                        <span>{profile?.vehicleNumber || '—'}</span>
                    </div>
                    <div className="detail-row">
                        <span>Verified</span>
                        <span className={profile?.isVerified ? 'verified-yes' : 'verified-no'}>
                            {profile?.isVerified ? '✅ Verified' : '⏳ Pending'}
                        </span>
                    </div>
                </div>

                <div className="driver-profile-mini">
                    <h3>Account Info</h3>
                    <div className="detail-row">
                        <span>Name</span>
                        <span>{profile?.userId?.name}</span>
                    </div>
                    <div className="detail-row">
                        <span>Email</span>
                        <span>{profile?.userId?.email}</span>
                    </div>
                    <div className="detail-row">
                        <span>Phone</span>
                        <span>{profile?.userId?.phone || '—'}</span>
                    </div>
                </div>
            </div>

            {/* Earnings per delivery note */}
            <div className="earnings-note">
                💡 You earn <strong>{currency}30</strong> per successful delivery. Keep delivering to grow your total!
            </div>
        </div>
    );
};

export default DriverDashboard;
