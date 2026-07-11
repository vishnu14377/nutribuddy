import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { AdminContext } from '../../context/AdminContext';
import { assets } from '../../assets/assets';
import './NotificationBell.css';

const NotificationBell = () => {
    const { url, token, socket } = useContext(AdminContext);
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);

    const fetchNotifications = async () => {
        try {
            const res = await axios.get(`${url}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) {
                setNotifications(res.data.data);
                setUnreadCount(res.data.data.filter(n => !n.isRead).length);
            }
        } catch (err) {}
    };

    const markAsRead = async (id) => {
        try {
            const res = await axios.patch(`${url}/api/notifications/${id}/read`, {}, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) {
                setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        } catch (err) {}
    };

    const markAllRead = async () => {
        try {
            const res = await axios.patch(`${url}/api/notifications/read-all`, {}, { headers: { Authorization: `Bearer ${token}` } });
            if (res.data.success) {
                setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                setUnreadCount(0);
            }
        } catch (err) {}
    };

    useEffect(() => {
        if (token) fetchNotifications();
    }, [token]);

    useEffect(() => {
        if (socket) {
            const handleNotification = (notif) => {
                setNotifications(prev => [notif, ...prev].slice(0, 50));
                setUnreadCount(prev => prev + 1);
                
                // Show toast alert
                import('react-toastify').then(({ toast }) => {
                    toast.info(
                        <div className="notif-toast-content">
                            <strong>{notif.title}</strong>
                            <p>{notif.message}</p>
                        </div>
                    );
                });
            };
            socket.on('notification', handleNotification);
            return () => socket.off('notification', handleNotification);
        }
    }, [socket]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="notification-bell-container" ref={dropdownRef}>
            <div className="bell-icon-wrapper" onClick={() => setShowDropdown(!showDropdown)}>
                <img src={assets.parcel_icon} alt="Notifications" className="bell-icon" />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </div>

            {showDropdown && (
                <div className="notification-dropdown">
                    <div className="dropdown-header">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}
                    </div>
                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="no-notifications">No notifications yet</div>
                        ) : (
                            notifications.map(n => (
                                <div 
                                    key={n._id} 
                                    className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                                    onClick={() => !n.isRead && markAsRead(n._id)}
                                >
                                    <div className="notif-title">{n.title}</div>
                                    <div className="notif-message">{n.message}</div>
                                    <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
