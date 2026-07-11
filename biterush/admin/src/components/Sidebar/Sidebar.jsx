import React, { useContext } from 'react'
import './Sidebar.css'
import { assets } from '../../assets/assets'
import { NavLink } from 'react-router-dom'
import { AdminContext } from '../../context/AdminContext'

const Sidebar = () => {
  const { user } = useContext(AdminContext);
  const role = user?.role || 'admin';

  return (
    <div className='sidebar'>
      <div className="sidebar-options">
        
        {/* SHARED / ADMIN SECTION */}
        {(role === 'admin') && (
          <>
            <div className="sidebar-group-label">Main Logistics</div>
            <NavLink to='/dashboard' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>Master Analytics</p>
            </NavLink>
            <NavLink to='/users' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>User Mgmt</p>
            </NavLink>
            <NavLink to='/restaurants' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>Approve Vendors</p>
            </NavLink>
            <NavLink to='/analytics' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>App Stats</p>
            </NavLink>
            <NavLink to='/delivery' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>Driver Fleet</p>
            </NavLink>
          </>
        )}

        {/* RESTAURANT OWNER SECTION */}
        {(role === 'restaurant_owner' || role === 'admin') && (
          <>
            <div className="sidebar-group-label">Restaurant Control</div>
            <NavLink to='/dashboard' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>{role === 'admin' ? 'Global Stats' : 'My Dashboard'}</p>
            </NavLink>
            <NavLink to='/add' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>Add Food Item</p>
            </NavLink>
            <NavLink to='/list' className="sidebar-option">
              <img src={assets.order_icon} alt="" />
              <p>Food Inventory</p>
            </NavLink>
            <NavLink to='/orders' className="sidebar-option">
              <img src={assets.order_icon} alt="" />
              <p>Manage Orders</p>
            </NavLink>
          </>
        )}

        {/* DELIVERY PARTNER SECTION */}
        {(role === 'delivery_partner') && (
          <>
            <div className="sidebar-group-label">Delivery Portal</div>
            <NavLink to='/driver/dashboard' className="sidebar-option">
              <img src={assets.add_icon} alt="" />
              <p>My Status</p>
            </NavLink>
            <NavLink to='/driver/tasks' className="sidebar-option">
              <img src={assets.order_icon} alt="" />
              <p>Delivery Tasks</p>
            </NavLink>
          </>
        )}
      </div>
    </div>
  )
}

export default Sidebar
