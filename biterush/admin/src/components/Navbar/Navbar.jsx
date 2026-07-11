import React, { useContext } from 'react'
import './Navbar.css'
import { assets } from '../../assets/assets'
import { AdminContext } from '../../context/AdminContext'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '../NotificationBell/NotificationBell'

const Navbar = () => {
  const { user, logout } = useContext(AdminContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  }

  return (
    <div className='navbar'>
      <div className="navbar-brand">
        <div className='admin-logo'>BiteRush</div>
        <span className="admin-badge">
          {user?.role === 'admin' ? 'Master Admin' : 
           user?.role === 'restaurant_owner' ? 'Owner Portal' : 
           'Delivery Portal'}
        </span>
      </div>
      <div className="navbar-right">
        <NotificationBell />
        <div className="user-info">
          <p className="user-name">{user?.name}</p>
          <p className="user-role">{user?.role?.replace('_', ' ')}</p>
        </div>
        <div className="profile-container">
          <img className='profile' src={assets.profile_image} alt="Profile" />
          <div className="profile-dropdown">
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Navbar
